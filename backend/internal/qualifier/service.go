package qualifier

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

type Event struct {
	PauseRequested bool    `json:"pause_requested,omitempty"`
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Deadline       float64 `json:"deadline"`
	Rounds         int     `json:"rounds"`
	TopK           int     `json:"top_k"`
	Status         string  `json:"status"`
	CurrentRound   int     `json:"current_round"`
	AppliedRound   int     `json:"applied_round"`
	Completed      int     `json:"completed"`
	Total          int     `json:"total"`
	Eligible       int     `json:"eligible"`
	Seed           string  `json:"seed"`
	Error          string  `json:"error,omitempty"`
	Target         string  `json:"target,omitempty"`
}
type Participant struct {
	Pending     int      `json:"pending_submissions,omitempty"`
	TestBot     bool     `json:"test_bot,omitempty"`
	SID         string   `json:"student_id"`
	Name        string   `json:"team_name"`
	Code        string   `json:"code,omitempty"`
	Language    string   `json:"language,omitempty"`
	ValidID     string   `json:"valid_id,omitempty"`
	LockedID    string   `json:"locked_id,omitempty"`
	Elo         float64  `json:"elo"`
	Wins        int      `json:"wins"`
	Played      int      `json:"played"`
	Byes        int      `json:"byes"`
	Starts      int      `json:"starts"`
	Opponents   []string `json:"opponents,omitempty"`
	SubmittedAt float64  `json:"submitted_at"`
}
type Submission struct {
	Status   string  `json:"status,omitempty"`
	ID       string  `json:"id"`
	Code     string  `json:"code,omitempty"`
	Language string  `json:"language"`
	Valid    bool    `json:"valid"`
	Error    string  `json:"error,omitempty"`
	At       float64 `json:"at"`
}
type Job struct {
	ID       string  `json:"id"`
	Round    int     `json:"round"`
	A        string  `json:"a"`
	B        string  `json:"b"`
	First    int     `json:"first"`
	Status   string  `json:"status"`
	Winner   string  `json:"winner,omitempty"`
	Reason   string  `json:"reason,omitempty"`
	Error    string  `json:"error,omitempty"`
	Attempts int     `json:"attempts"`
	Seed     string  `json:"seed"`
	BeforeA  float64 `json:"before_a"`
	BeforeB  float64 `json:"before_b"`
	AfterA   float64 `json:"after_a"`
	AfterB   float64 `json:"after_b"`
}
type Service struct {
	Store      *repository.QualifierRecords
	Accounts   *repository.Accounts
	Tournament *service.TournamentService
	Engine     adapter.BotRunnerAdapter
	mu         sync.Mutex
	running    map[string]bool
	validating sync.Map
	OnUpdate   func(string)
}

func New(store *repository.QualifierRecords, accounts *repository.Accounts, tournament *service.TournamentService, engine adapter.BotRunnerAdapter) *Service {
	return &Service{Store: store, Accounts: accounts, Tournament: tournament, Engine: engine, running: map[string]bool{}}
}
func uniqueID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(raw[:])
}
func now() float64                          { return float64(time.Now().UnixMilli()) / 1000 }
func metaKey(id string) string              { return "event:" + id }
func participantKey(id, sid string) string  { return "participant:" + id + ":" + sid }
func jobPrefix(id string, round int) string { return fmt.Sprintf("job:%s:%04d:", id, round) }
func (s *Service) Event(id string) (Event, error) {
	var e Event
	err := s.Store.Get(metaKey(id), &e)
	return e, err
}
func (s *Service) Events() ([]Event, error) {
	rows, err := s.Store.List("event:")
	if err != nil {
		return nil, err
	}
	list := []Event{}
	for _, raw := range rows {
		var e Event
		if err = json.Unmarshal(raw, &e); err != nil {
			return nil, err
		}
		e.Seed = ""
		list = append(list, e)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Deadline > list[j].Deadline })
	return list, nil
}
func (s *Service) Participants(id string) (map[string]Participant, error) {
	rows, err := s.Store.List("participant:" + id + ":")
	return decodeParticipants(rows, err)
}
func (s *Service) ParticipantSummaries(id string) (map[string]Participant, error) {
	rows, err := s.Store.ListMetadata("participant:"+id+":", "")
	return decodeParticipants(rows, err)
}
func decodeParticipants(rows map[string]json.RawMessage, err error) (map[string]Participant, error) {
	if err != nil {
		return nil, err
	}
	items := map[string]Participant{}
	for _, raw := range rows {
		var p Participant
		if err = json.Unmarshal(raw, &p); err != nil {
			return nil, err
		}
		items[p.SID] = p
	}
	return items, nil
}
func (s *Service) Configure(id string, req Event) (Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.TrimSpace(req.Name) == "" || len(req.Name) > 200 || req.Deadline <= now() || req.Rounds < 1 || req.Rounds > 100 || (req.TopK != 8 && req.TopK != 16 && req.TopK != 32) {
		return Event{}, errors.New("Đặt tên, hạn nộp trong tương lai, 1–100 vòng và top 8/16/32.")
	}
	e := Event{ID: uniqueID(), Name: strings.TrimSpace(req.Name), Deadline: req.Deadline, Rounds: req.Rounds, TopK: req.TopK, Status: "OPEN", Seed: uniqueID()}
	if id != "" {
		var err error
		e, err = s.Event(id)
		if err != nil {
			return e, err
		}
		if e.Status != "OPEN" {
			return e, errors.New("Vòng loại đã khóa; không thể đổi cấu hình.")
		}
		e.Name = req.Name
		e.Deadline = req.Deadline
		e.Rounds = req.Rounds
		e.TopK = req.TopK
	}
	return e, s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
}
func (s *Service) Submit(id, sid, code, language string) (Submission, error) {
	sub, err := s.EnqueueSubmission(id, sid, code, language, "")
	if err != nil {
		return sub, err
	}
	if err = s.processSubmission("validation:" + id + ":" + sub.ID); err != nil {
		return sub, err
	}
	err = s.Store.Get("submission:"+id+":"+sid+":"+sub.ID, &sub)
	return sub, err
}

func (s *Service) Freeze(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Serialize against bot generation on other gateway processes as well.
	release, err := s.Store.Lease(id)
	if err != nil {
		return err
	}
	defer release()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Status != "OPEN" && e.Status != "CLOSING" && e.Status != "LOCKED" {
		return errors.New("Không thể khóa lại vòng loại đã bắt đầu thi đấu.")
	}
	if e.CurrentRound != 0 || e.AppliedRound != 0 || e.Completed != 0 || e.Total != 0 {
		return errors.New("Vòng loại đã có tiến độ thi đấu; không thay đổi bài đã khóa.")
	}
	jobs, err := s.Store.List("job:" + id + ":")
	if err != nil {
		return err
	}
	if len(jobs) != 0 {
		return errors.New("Vòng loại đã được ghép cặp; không thay đổi bài đã khóa.")
	}
	pending, err := s.Store.Pending("validation:" + id + ":")
	if err != nil {
		return err
	}
	if len(pending) > 0 {
		e.Status = "CLOSING"
		e.Error = "Đang chờ chấm hết bài đã nhận trước khi khóa danh sách."
		return s.Store.Batch(map[string]interface{}{metaKey(id): e})
	}
	wasLocked, previousEligible := e.Status == "LOCKED", e.Eligible
	// Derive the count from saved participants, never from a previous counter.
	e.Eligible = 0
	e.Error = ""
	people, err := s.ParticipantSummaries(id)
	if err != nil {
		return err
	}
	rows := map[string]interface{}{}
	for sid, p := range people {
		if p.LockedID != "" {
			e.Eligible++
			continue
		}
		active := p.TestBot
		if !p.TestBot {
			a, err := s.Accounts.Get(sid)
			if err != nil {
				return err
			}
			active = !a.Deleted
		}
		if p.ValidID != "" && active {
			p.LockedID = p.ValidID
			rows[participantKey(id, sid)] = p
			e.Eligible++
		}
	}
	e.Status = "LOCKED"
	if e.Eligible < e.TopK {
		e.Error = fmt.Sprintf("Chỉ có %d bot hợp lệ; cần ít nhất %d để chọn top.", e.Eligible, e.TopK)
	}
	rows[metaKey(id)] = e
	if err := s.Store.BatchPreservingParticipantCode(rows); err != nil {
		return err
	}
	if wasLocked && previousEligible != e.Eligible {
		log.Printf("[Qualifier] Reconciled frozen entrants event=%s previous=%d eligible=%d registered=%d", id, previousEligible, e.Eligible, len(people))
	}
	return nil
}
func (s *Service) Start(id string) error {
	s.mu.Lock()
	e, err := s.Event(id)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	if (e.Status != "LOCKED" && e.Status != "PAUSED") || e.Eligible < e.TopK {
		s.mu.Unlock()
		return errors.New("Cần khóa ít nhất K bot hợp lệ trước khi chạy; chỉ tiếp tục vòng đang tạm dừng.")
	}
	e.Status = "RUNNING"
	e.PauseRequested = false
	e.Error = ""
	err = s.Store.Batch(map[string]interface{}{metaKey(id): e})
	s.mu.Unlock()
	if err == nil {
		s.launch(id)
	}
	return err
}
func (s *Service) Recover() error {
	go s.runSubmissionQueue()
	events, err := s.Events()
	if err != nil {
		return err
	}
	for _, e := range events {
		if e.Status == "LOCKED" && e.CurrentRound == 0 && e.AppliedRound == 0 && e.Completed == 0 && e.Total == 0 {
			if err := s.Freeze(e.ID); err != nil {
				log.Printf("[Qualifier] Cannot reconcile frozen event=%s: %v", e.ID, err)
			}
		}
		if e.Status == "RUNNING" {
			s.launch(e.ID)
		}
	}
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			events, err := s.Events()
			if err != nil {
				continue
			}
			for _, e := range events {
				if e.Status == "RUNNING" {
					s.launch(e.ID)
				}
				if (e.Status == "OPEN" && now() >= e.Deadline) || e.Status == "CLOSING" {
					s.Freeze(e.ID)
					s.signal(e.ID)
				}
			}
		}
	}()
	return nil
}
func (s *Service) signal(id string) {
	if s.OnUpdate != nil {
		s.OnUpdate(id)
	}
}
func (s *Service) Ranked(id string) ([]Participant, error) {
	event, err := s.Event(id)
	if err != nil {
		return nil, err
	}
	people, err := s.ParticipantSummaries(id)
	if err != nil {
		return nil, err
	}
	list := []Participant{}
	for _, p := range people {
		if p.LockedID != "" {
			list = append(list, p)
		}
	}
	strength := func(p Participant) float64 {
		total := 0.0
		for _, sid := range p.Opponents {
			total += people[sid].Elo
		}
		if len(p.Opponents) > 0 {
			return total / float64(len(p.Opponents))
		}
		return 0
	}
	sort.Slice(list, func(i, j int) bool {
		a, b := list[i], list[j]
		if a.Elo != b.Elo {
			return a.Elo > b.Elo
		}
		if a.Wins != b.Wins {
			return a.Wins > b.Wins
		}
		sa, sb := strength(a), strength(b)
		if sa != sb {
			return sa > sb
		}
		return fmt.Sprintf("%x", sha256.Sum256([]byte(event.Seed+":"+a.SID))) < fmt.Sprintf("%x", sha256.Sum256([]byte(event.Seed+":"+b.SID)))
	})
	return list, nil
}
func (s *Service) Promote(id, target string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Status == "PROMOTED" {
		if e.Target == target {
			return nil
		}
		return errors.New("Đã chốt vào một giải khác.")
	}
	if e.Status != "FINISHED" {
		return errors.New("Vòng loại chưa hoàn tất.")
	}
	if e.Target != "" && e.Target != target {
		return errors.New("Đang chốt vào giải đã chọn trước đó.")
	}
	tournament, err := s.Tournament.GetTournamentByID(target)
	if err != nil {
		return err
	}
	if tournament["qualifier_id"] != id {
		teams, _ := tournament["teams"].([]interface{})
		if len(teams) != 0 || tournament["num_teams"] != float64(e.TopK) {
			return errors.New("Chọn giải chính trống có số đội bằng top K.")
		}
	}
	people, err := s.Ranked(id)
	if err != nil {
		return err
	}
	if len(people) < e.TopK {
		return errors.New("Chưa đủ đội hợp lệ.")
	}
	teams := []map[string]interface{}{}
	for _, p := range people[:e.TopK] {
		teams = append(teams, map[string]interface{}{"student_id": p.SID, "team_name": p.Name, "elo": p.Elo})
	}
	e.Target = target
	if err = s.Store.Batch(map[string]interface{}{metaKey(id): e}); err != nil {
		return err
	}
	_, err = s.Tournament.MutateTournament(target, "import-qualified", map[string]interface{}{"qualifier_id": id, "teams": teams, "top_k": e.TopK})
	if err != nil {
		return err
	}
	e.Status = "PROMOTED"
	return s.Store.Batch(map[string]interface{}{metaKey(id): e})
}
