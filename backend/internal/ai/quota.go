package ai

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Store là phần của kho bản ghi (Postgres hoặc tệp JSON) mà trợ lý cần.
type Store interface {
	Get(key string, target interface{}) error
	Batch(values map[string]interface{}) error
	List(prefix string) (map[string]json.RawMessage, error)
}

var (
	ErrDisabled  = errors.New("Trợ lý AI đang tắt.")
	ErrTeamLimit = errors.New("Hôm nay đội bạn đã dùng hết lượt hỏi trợ lý AI.")
	ErrBudget    = errors.New("Trợ lý AI đã đạt giới hạn sử dụng trong ngày.")
)

type Settings struct {
	Enabled     bool `json:"enabled"`
	PerTeam     int  `json:"per_team"`     // số lượt hỏi mỗi đội mỗi ngày
	DailyTokens int  `json:"daily_tokens"` // trần token (vào + ra) của cả hệ thống mỗi ngày
}

func DefaultSettings() Settings { return Settings{Enabled: true, PerTeam: 30, DailyTokens: 2_000_000} }

type counter struct {
	Used int `json:"used"`
}

type CachedAnswer struct {
	Answer  string        `json:"answer"`
	Sources []CitedSource `json:"sources"`
	At      int64         `json:"at"`
}

type LogEntry struct {
	ID         string   `json:"id"`
	At         int64    `json:"at"`
	StudentID  string   `json:"student_id"`
	TeamName   string   `json:"team_name"`
	Role       string   `json:"role"`
	Question   string   `json:"question"`
	Answer     string   `json:"answer"`
	NeedsHuman bool     `json:"needs_human"`
	Reason     string   `json:"reason,omitempty"`
	Draft      string   `json:"draft,omitempty"` // câu nháp model bị bác, chỉ ban tổ chức xem
	SourceIDs  []string `json:"source_ids,omitempty"`
	Tools      []string `json:"tools,omitempty"`
	Tokens     int      `json:"tokens"`
	Cached     bool     `json:"cached"`
}

// Manager giữ cài đặt, hạn mức, bộ nhớ đệm và nhật ký của trợ lý. Cổng chạy một bản duy nhất nên khóa trong bộ nhớ là đủ.
type Manager struct {
	Store    Store
	Now      func() time.Time
	Defaults Settings // mặc định từ biến môi trường; rỗng thì dùng DefaultSettings
	mu       sync.Mutex
	seq      uint64
}

func (m *Manager) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

func (m *Manager) day() string { return m.now().In(vnZone).Format("20060102") }

func (m *Manager) Settings() Settings {
	s := m.Defaults
	if s == (Settings{}) {
		s = DefaultSettings()
	}
	_ = m.Store.Get("aiset", &s)
	return s
}

func (m *Manager) SetSettings(s Settings) error {
	if s.PerTeam < 0 {
		s.PerTeam = 0
	}
	if s.PerTeam > 500 {
		s.PerTeam = 500
	}
	if s.DailyTokens < 0 {
		s.DailyTokens = 0
	}
	return m.Store.Batch(map[string]interface{}{"aiset": s})
}

func (m *Manager) read(key string) counter {
	var c counter
	if err := m.Store.Get(key, &c); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return counter{}
	}
	return c
}

func teamKey(sid, day string) string { return "aiq:" + strings.ToUpper(sid) + ":" + day }
func tokenKey(day string) string     { return "aitok:" + day }

// Reserve trừ trước một lượt của đội (chống gọi song song vượt hạn mức); trả về số lượt còn lại.
func (m *Manager) Reserve(sid string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.Settings()
	if !s.Enabled {
		return 0, ErrDisabled
	}
	day := m.day()
	if m.read(tokenKey(day)).Used >= s.DailyTokens {
		return 0, ErrBudget
	}
	c := m.read(teamKey(sid, day))
	if c.Used >= s.PerTeam {
		return 0, ErrTeamLimit
	}
	c.Used++
	if err := m.Store.Batch(map[string]interface{}{teamKey(sid, day): c}); err != nil {
		return 0, err
	}
	return s.PerTeam - c.Used, nil
}

// Refund hoàn lượt khi model lỗi (không phải lỗi của đội).
func (m *Manager) Refund(sid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	day := m.day()
	c := m.read(teamKey(sid, day))
	if c.Used > 0 {
		c.Used--
		_ = m.Store.Batch(map[string]interface{}{teamKey(sid, day): c})
	}
}

func (m *Manager) AddTokens(n int) {
	if n <= 0 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	day := m.day()
	c := m.read(tokenKey(day))
	c.Used += n
	_ = m.Store.Batch(map[string]interface{}{tokenKey(day): c})
}

type QuotaUsage struct {
	Enabled     bool `json:"enabled"`
	Used        int  `json:"used"`
	Limit       int  `json:"limit"`
	Remaining   int  `json:"remaining"`
	TokensToday int  `json:"tokens_today"`
	DailyTokens int  `json:"daily_tokens"`
}

func (m *Manager) UsageFor(sid string) QuotaUsage {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.Settings()
	day := m.day()
	used := 0
	if sid != "" {
		used = m.read(teamKey(sid, day)).Used
	}
	rem := s.PerTeam - used
	if rem < 0 {
		rem = 0
	}
	return QuotaUsage{Enabled: s.Enabled, Used: used, Limit: s.PerTeam, Remaining: rem, TokensToday: m.read(tokenKey(day)).Used, DailyTokens: s.DailyTokens}
}

// CacheKey: cùng câu hỏi chuẩn hóa + cùng phiên bản tài liệu thì dùng lại câu trả lời trong 24 giờ.
func CacheKey(question, kbVersion string) string {
	var parts []string
	for _, t := range queryTerms(question) {
		parts = append(parts, t.W)
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, " ") + "|" + kbVersion))
	return "aicache:" + hex.EncodeToString(sum[:12])
}

func (m *Manager) CacheGet(key string) (CachedAnswer, bool) {
	var c CachedAnswer
	if err := m.Store.Get(key, &c); err != nil || c.Answer == "" || m.now().Unix()-c.At > 24*3600 {
		return CachedAnswer{}, false
	}
	return c, true
}

func (m *Manager) CachePut(key string, c CachedAnswer) {
	c.At = m.now().Unix()
	_ = m.Store.Batch(map[string]interface{}{key: c})
}

func (m *Manager) Log(e LogEntry) {
	t := m.now()
	m.mu.Lock()
	m.seq++
	seq := m.seq
	m.mu.Unlock()
	e.At = t.Unix()
	// Thời gian + số thứ tự tăng dần để các câu hỏi trong cùng một mili giây vẫn xếp đúng thứ tự.
	e.ID = t.In(vnZone).Format("20060102150405.000") + "-" + leftPad(seq, 6)
	_ = m.Store.Batch(map[string]interface{}{"ailog:" + e.ID: e})
}

func leftPad(n uint64, width int) string {
	s := strconv.FormatUint(n%1_000_000, 10)
	for len(s) < width {
		s = "0" + s
	}
	return s
}

// Logs đọc nhật ký hôm nay và các ngày trước (days = số ngày), mới nhất trước.
func (m *Manager) Logs(days, limit int) []LogEntry {
	var out []LogEntry
	for d := 0; d < days; d++ {
		prefix := "ailog:" + m.now().In(vnZone).AddDate(0, 0, -d).Format("20060102")
		rows, err := m.Store.List(prefix)
		if err != nil {
			continue
		}
		for _, raw := range rows {
			var e LogEntry
			if json.Unmarshal(raw, &e) == nil && e.ID != "" {
				out = append(out, e)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
