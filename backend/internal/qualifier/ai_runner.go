package qualifier

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

// runAI chạy vòng loại Giải AI: mỗi lượt chấm mọi mô hình đã khóa trên một bộ đề mới (hạt giống bí mật theo lượt),
// rồi cộng dồn điểm trung bình các lượt vào từng đội. Khóa/lease, tạm dừng, hàng đợi nộp, ban và Promote dùng chung với vòng loại thường.
func (s *Service) runAI(id string) error {
	workers := 2
	if value, err := strconv.Atoi(os.Getenv("QUALIFIER_WORKERS")); err == nil && value >= 1 && value <= 32 {
		workers = value
	}
	for {
		e, err := s.Event(id)
		if err != nil {
			return err
		}
		if e.Status != "RUNNING" {
			return nil
		}
		if e.PauseRequested {
			s.mu.Lock()
			e.Status = "PAUSED"
			e.Error = "Ban tổ chức tạm dừng sau khi hoàn tất lượt đang chấm."
			err = s.Store.Batch(map[string]interface{}{metaKey(id): e})
			s.mu.Unlock()
			return err
		}
		round := e.AppliedRound + 1
		people, err := s.ParticipantSummaries(id)
		if err != nil {
			return err
		}
		jobs, err := s.jobs(id, round)
		if err != nil {
			return err
		}
		if len(jobs) == 0 {
			if err = s.pairAI(e, people, round); err != nil {
				return err
			}
			if jobs, err = s.jobs(id, round); err != nil {
				return err
			}
		}
		queue := make(chan Job, len(jobs))
		failures := make(chan error, len(jobs))
		var wg sync.WaitGroup
		var stopped atomic.Bool
		for n := 0; n < workers; n++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for job := range queue {
					if stopped.Load() {
						return
					}
					if err := s.playAI(e, job); err != nil {
						stopped.Store(true)
						failures <- err
						return
					}
				}
			}()
		}
		for _, job := range jobs {
			queue <- job
		}
		close(queue)
		wg.Wait()
		close(failures)
		for err := range failures {
			return err
		}
		if jobs, err = s.jobs(id, round); err != nil {
			return err
		}
		// Toàn bộ điểm của lượt được ghi trong một giao dịch cùng bộ đếm AppliedRound: khởi động lại giữa chừng không cộng đôi.
		s.mu.Lock()
		e, err = s.Event(id)
		if err != nil {
			s.mu.Unlock()
			return err
		}
		rows := map[string]interface{}{}
		for _, job := range jobs {
			if job.AI == nil || job.Status != "DONE" {
				continue
			}
			p, known := people[job.A]
			if !known || p.Banned {
				continue
			}
			n := float64(p.AIRounds)
			p.AIPublic = (p.AIPublic*n + job.AI.Public) / (n + 1)
			p.AIPrivate = (p.AIPrivate*n + job.AI.Private) / (n + 1)
			p.AIReading = (p.AIReading*n + job.AI.Reading) / (n + 1)
			p.AIBoard = (p.AIBoard*n + job.AI.Board) / (n + 1)
			p.AIRounds++
			p.Played++
			people[job.A] = p
			rows[participantKey(id, p.SID)] = p
		}
		e.AppliedRound = round
		if round == e.Rounds {
			e.Status = "FINISHED"
		}
		rows[metaKey(id)] = e
		err = s.Store.BatchPreservingParticipantCode(rows)
		s.mu.Unlock()
		if err != nil {
			return err
		}
		s.signal(id)
		if e.Status == "FINISHED" {
			return nil
		}
	}
}

func (s *Service) pairAI(e Event, people map[string]Participant, round int) error {
	ids := []string{}
	for sid, p := range people {
		if p.LockedID != "" && !p.Banned {
			ids = append(ids, sid)
		}
	}
	sort.Strings(ids)
	rows := map[string]interface{}{}
	for index, sid := range ids {
		key := jobPrefix(e.ID, round) + fmt.Sprintf("%04d", index+1)
		rows[key] = Job{ID: key, Round: round, A: sid, Status: "PENDING"}
	}
	e.CurrentRound = round
	e.Total = e.Eligible * e.Rounds
	rows[metaKey(e.ID)] = e
	return s.Store.Batch(rows)
}

func aiNumber(value interface{}) (float64, bool) {
	number, ok := value.(float64)
	return number, ok && number >= 0 && number <= 100
}

func aiMap(value interface{}) map[string]float64 {
	out := map[string]float64{}
	raw, _ := value.(map[string]interface{})
	for key, item := range raw {
		if number, ok := item.(float64); ok {
			out[key] = number
		}
	}
	return out
}

// playAI chấm một mô hình trong một lượt. Lỗi hạ tầng được thử lại 3 lần rồi dừng cả vòng (giữ nguyên tiến độ);
// lỗi của chính mô hình (mã không chạy được) chỉ tính 0 điểm cho đội đó chứ không làm hỏng vòng loại.
func (s *Service) playAI(e Event, job Job) error {
	if job.Status == "DONE" {
		return nil
	}
	if job.Status == "ERROR" {
		job.Attempts = 0
	}
	if job.Status == "RUNNING" && job.Attempts > 0 {
		job.Attempts--
	}
	var p Participant
	if err := s.Store.Get(participantKey(e.ID, job.A), &p); err != nil {
		return err
	}
	var last error
	for job.Attempts < 3 {
		job.Attempts++
		job.Status = "RUNNING"
		job.Error = ""
		if err := s.Store.Batch(map[string]interface{}{job.ID: job}); err != nil {
			return err
		}
		result, err := s.Engine.Mutate(nil, "ai-suite", map[string]interface{}{
			"code": p.Code, "language": p.Language, "secret_seed": e.Seed, "public_seed": PublicSeed(e.ID), "round": job.Round,
			"rounds_per_match": AIRoundsPerMatch, "instances": AIInstances, "board_games": AIBoardGames,
		})
		if err != nil {
			last = err
			continue
		}
		outcome := &AIResult{}
		if failure, _ := result["error"].(string); failure != "" {
			outcome.Failed = failure
		} else {
			var okPublic, okPrivate, okReading, okBoard bool
			outcome.Public, okPublic = aiNumber(result["public_score"])
			outcome.Private, okPrivate = aiNumber(result["private_score"])
			outcome.Reading, okReading = aiNumber(result["reading_score"])
			board, _ := result["board"].(map[string]interface{})
			outcome.Board, okBoard = aiNumber(board["score"])
			if !okPublic || !okPrivate || !okReading || !okBoard {
				last = fmt.Errorf("Máy chấm trả về điểm không hợp lệ.")
				continue
			}
			outcome.FamiliesPublic = aiMap(result["families_public"])
			outcome.FamiliesPrivate = aiMap(result["families_private"])
			outcome.Bosses = aiMap(board["bosses"])
			if elapsed, ok := result["elapsed_ms"].(float64); ok {
				outcome.ElapsedMs = int(elapsed)
			}
			notes := map[string]bool{}
			if list, ok := result["errors"].([]interface{}); ok {
				for _, item := range list {
					if note, ok := item.(string); ok && !notes[note] && len(outcome.Notes) < 5 {
						notes[note] = true
						outcome.Notes = append(outcome.Notes, strings.TrimSpace(note))
					}
				}
			}
			if exceeded, _ := result["budget_exceeded"].(bool); exceeded {
				outcome.Notes = append(outcome.Notes, "Mô hình chạy quá chậm: bộ đề bị cắt do hết thời gian chấm.")
			}
		}
		job.AI = outcome
		job.Status = "DONE"
		s.mu.Lock()
		current, err := s.Event(e.ID)
		if err == nil {
			current.Completed++
			err = s.Store.Batch(map[string]interface{}{job.ID: job, metaKey(e.ID): current})
		}
		s.mu.Unlock()
		s.signal(e.ID)
		return err
	}
	job.Status = "ERROR"
	job.Error = fmt.Sprint(last)
	if err := s.Store.Batch(map[string]interface{}{job.ID: job}); err != nil {
		return err
	}
	return fmt.Errorf("Chấm mô hình %s lỗi sau 3 lần thử: %v", job.A, last)
}
