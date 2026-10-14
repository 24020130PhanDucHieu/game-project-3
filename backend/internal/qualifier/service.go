package qualifier

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

type Event struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Deadline     float64 `json:"deadline"`
	Rounds       int     `json:"rounds"`
	TopK         int     `json:"top_k"`
	Status       string  `json:"status"`
	CurrentRound int     `json:"current_round"`
	AppliedRound int     `json:"applied_round"`
	Completed    int     `json:"completed"`
	Total        int     `json:"total"`
	Eligible     int     `json:"eligible"`
	Seed         string  `json:"seed"`
	Error        string  `json:"error,omitempty"`
	Target       string  `json:"target,omitempty"`
}
type Participant struct {
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
	e, err := s.Event(id)
	if err != nil {
		return Submission{}, err
	}
	if e.Status != "OPEN" || now() >= e.Deadline {
		return Submission{}, errors.New("Đã hết hạn hoặc bài nộp đã bị khóa.")
	}
	if len([]byte(code)) > 65536 || strings.TrimSpace(code) == "" {
		return Submission{}, errors.New("Mã nguồn cần từ 1 đến 64 KB.")
	}
	if language != "PYTHON" && language != "CPP" {
		return Submission{}, errors.New("Ngôn ngữ không hợp lệ.")
	}
	if language == "CPP" && os.Getenv("ENVIRONMENT") == "production" {
		return Submission{}, errors.New("Máy chủ hiện chỉ hỗ trợ Python.")
	}
	account, err := s.Accounts.Get(sid)
	if err != nil || account.Deleted {
		return Submission{}, errors.New("Tài khoản không hợp lệ.")
	}
	var registered Participant
	if err := s.Store.Get(participantKey(id, sid), &registered); err != nil || registered.SID == "" {
		return Submission{}, errors.New("Hãy đăng ký tham gia vòng loại trước khi nộp bot.")
	}
	result, err := s.Engine.Mutate(nil, "validate-code", map[string]interface{}{"code_content": code, "language": language})
	if err != nil {
		return Submission{}, err
	}
	valid, _ := result["is_valid"].(bool)
	message, _ := result["error_message"].(string)
	sub := Submission{ID: uniqueID(), Code: code, Language: language, Valid: valid, Error: message, At: now()}
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err = s.Event(id)
	if err != nil {
		return sub, err
	}
	if e.Status != "OPEN" || now() >= e.Deadline {
		return sub, errors.New("Hạn nộp đã qua trong lúc kiểm tra. Bài chưa được nhận.")
	}
	people, err := s.Participants(id)
	if err != nil {
		return sub, err
	}
	p, exists := people[sid]
	if !exists {
		if len(people) >= 2000 {
			return sub, errors.New("Vòng loại đã đủ 2.000 đội.")
		}
		return sub, errors.New("Hãy đăng ký tham gia vòng loại trước khi nộp bot.")
	}
	p.SubmittedAt = sub.At
	if valid {
		p.Code = code
		p.Language = language
		p.ValidID = sub.ID
		p.SubmittedAt = sub.At
	}
	rows := map[string]interface{}{participantKey(id, sid): p, "submission:" + id + ":" + sid + ":" + sub.ID: sub}
	return sub, s.Store.Batch(rows)
}
func (s *Service) Freeze(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Status != "OPEN" {
		return errors.New("Vòng loại đã khóa.")
	}
	people, err := s.Participants(id)
	if err != nil {
		return err
	}
	rows := map[string]interface{}{}
	for sid, p := range people {
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
	return s.Store.Batch(rows)
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
	e.Error = ""
	err = s.Store.Batch(map[string]interface{}{metaKey(id): e})
	s.mu.Unlock()
	if err == nil {
		s.launch(id)
	}
	return err
}
func (s *Service) Recover() error {
	events, err := s.Events()
	if err != nil {
		return err
	}
	for _, e := range events {
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
				if e.Status == "OPEN" && now() >= e.Deadline {
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
	people, err := s.Participants(id)
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
