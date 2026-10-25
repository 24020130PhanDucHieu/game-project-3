package qualifier

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
)

func (s *Service) launch(id string) {
	s.mu.Lock()
	// Each event holds a database lease. Bound event coordinators so multiple
	// simultaneous events cannot exhaust the SQL pool and deadlock storage.
	if s.running[id] || len(s.running) >= 1 {
		s.mu.Unlock()
		return
	}
	s.running[id] = true
	s.mu.Unlock()
	go func() {
		defer func() { s.mu.Lock(); delete(s.running, id); s.mu.Unlock() }()
		release, err := s.Store.Lease(id)
		if err != nil {
			return
		}
		defer release()
		if err = s.run(id); err != nil {
			s.mu.Lock()
			e, readErr := s.Event(id)
			if readErr == nil {
				e.Status = "PAUSED"
				e.Error = err.Error()
				s.Store.Batch(map[string]interface{}{metaKey(id): e})
			}
			s.mu.Unlock()
			s.signal(id)
		}
	}()
}
func (s *Service) jobs(id string, round int) ([]Job, error) {
	rows, err := s.Store.List(jobPrefix(id, round))
	if err != nil {
		return nil, err
	}
	jobs := []Job{}
	for _, raw := range rows {
		var j Job
		if err = json.Unmarshal(raw, &j); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].ID < jobs[j].ID })
	return jobs, nil
}
func contains(items []string, id string) bool {
	for _, item := range items {
		if item == id {
			return true
		}
	}
	return false
}
func (s *Service) pair(e Event, people map[string]Participant, round int) error {
	ids := []string{}
	for id, p := range people {
		if p.LockedID != "" && !p.Banned {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", e.Seed, round)))
	rng := rand.New(rand.NewSource(int64(binary.BigEndian.Uint64(hash[:8]))))
	rng.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	rows := map[string]interface{}{}
	index := 0
	if len(ids)%2 == 1 {
		lowest := 0
		for i := range ids {
			if people[ids[i]].Byes < people[ids[lowest]].Byes {
				lowest = i
			}
		}
		sid := ids[lowest]
		ids = append(ids[:lowest], ids[lowest+1:]...)
		index++
		key := jobPrefix(e.ID, round) + fmt.Sprintf("%04d", index)
		rows[key] = Job{ID: key, Round: round, A: sid, Status: "DONE", Winner: sid, Reason: "Lượt nghỉ: không cộng ELO hay điểm thắng."}
	}
	for len(ids) > 0 {
		a := ids[0]
		chosen := 1
		for j := 1; j < len(ids); j++ {
			if !contains(people[a].Opponents, ids[j]) {
				chosen = j
				break
			}
		}
		b := ids[chosen]
		ids = append(ids[1:chosen], ids[chosen+1:]...)
		first := 1
		if people[a].Starts > people[b].Starts || (people[a].Starts == people[b].Starts && rng.Intn(2) == 1) {
			first = 2
		}
		index++
		key := jobPrefix(e.ID, round) + fmt.Sprintf("%04d", index)
		rows[key] = Job{ID: key, Round: round, A: a, B: b, First: first, Status: "PENDING", Seed: fmt.Sprintf("%s:%d:%d", e.Seed, round, index)}
	}
	e.CurrentRound = round
	e.Total = (e.Eligible + 1) / 2 * e.Rounds
	rows[metaKey(e.ID)] = e
	return s.Store.Batch(rows)
}
func (s *Service) play(id string, job Job, people map[string]Participant) error {
	if job.Status == "DONE" {
		return nil
	}
	if job.Status == "ERROR" {
		job.Attempts = 0
	}
	// A persisted RUNNING attempt was interrupted before its result committed.
	// Resume it without charging an extra failure for a power loss/restart.
	if job.Status == "RUNNING" && job.Attempts > 0 {
		job.Attempts--
	}
	a, b := people[job.A], people[job.B]
	// Fetch only the two bots being executed, not all sources in the event.
	if err := s.Store.Get(participantKey(id, job.A), &a); err != nil {
		return err
	}
	if err := s.Store.Get(participantKey(id, job.B), &b); err != nil {
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
		result, err := s.Engine.Mutate(nil, "qualifier-game", map[string]interface{}{"code_a": a.Code, "code_b": b.Code, "language_a": a.Language, "language_b": b.Language, "first": job.First, "seed": job.Seed})
		if err != nil {
			last = err
			continue
		}
		winner, _ := result["winner_side"].(string)
		if winner != "team_a" && winner != "team_b" {
			last = fmt.Errorf("Worker trả về kết quả không hợp lệ.")
			continue
		}
		job.Winner = job.A
		if winner == "team_b" {
			job.Winner = job.B
		}
		job.Reason, _ = result["win_reason"].(string)
		job.Status = "DONE"
		s.mu.Lock()
		e, err := s.Event(id)
		if err == nil {
			e.Completed++
			err = s.Store.Batch(map[string]interface{}{job.ID: job, metaKey(id): e})
		}
		s.mu.Unlock()
		s.signal(id)
		return err
	}
	job.Status = "ERROR"
	job.Error = fmt.Sprint(last)
	if err := s.Store.Batch(map[string]interface{}{job.ID: job}); err != nil {
		return err
	}
	return fmt.Errorf("Trận %s lỗi sau 3 lần thử: %v", job.ID, last)
}
func (s *Service) run(id string) error {
	if e, err := s.Event(id); err == nil && e.Kind == KindAI {
		return s.runAI(id)
	}
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
			if err = s.pair(e, people, round); err != nil {
				return err
			}
			jobs, err = s.jobs(id, round)
			if err != nil {
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
					if err := s.play(id, job, people); err != nil {
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
		jobs, err = s.jobs(id, round)
		if err != nil {
			return err
		}
		// Every rating uses the values at the beginning of this round. Execution
		// completion order cannot affect standings. The entire rating round commits once.
		s.mu.Lock()
		e, err = s.Event(id)
		if err != nil {
			s.mu.Unlock()
			return err
		}
		rows := map[string]interface{}{}
		for _, job := range jobs {
			a := people[job.A]
			if job.B == "" {
				a.Byes++
				e.Completed++
			} else {
				b := people[job.B]
				score := 0.0
				if job.Winner == job.A {
					score = 1
					a.Wins++
				} else {
					b.Wins++
				}
				expected := 1 / (1 + math.Pow(10, (b.Elo-a.Elo)/400))
				delta := 32 * (score - expected)
				job.BeforeA = a.Elo
				job.BeforeB = b.Elo
				a.Elo += delta
				b.Elo -= delta
				job.AfterA = a.Elo
				job.AfterB = b.Elo
				a.Played++
				b.Played++
				a.Opponents = append(a.Opponents, b.SID)
				b.Opponents = append(b.Opponents, a.SID)
				if job.First == 1 {
					a.Starts++
				} else {
					b.Starts++
				}
				people[b.SID] = b
				rows[participantKey(id, b.SID)] = b
				rows[job.ID] = job
			}
			people[a.SID] = a
			rows[participantKey(id, a.SID)] = a
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
