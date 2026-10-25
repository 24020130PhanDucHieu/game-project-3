package qualifier

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// KindAI đánh dấu vòng loại của Giải AI: mỗi lượt chấm mọi mô hình trên bộ đề ẩn thay vì ghép cặp đấu.
const KindAI = "AI"

// Tham số bộ đề; máy chấm cũng dùng đúng các giá trị này (xem bot-runner/app/aicup/suite.py).
const (
	AIRoundsPerMatch = 150
	AIInstances      = 2
	AIBoardGames     = 9
	AIReadingWeight  = 0.6
	AIBoardWeight    = 0.4
)

var AIPublicFamilies = []string{"bias", "cycle", "markov1", "beat_last"}

var AITechniques = map[string]string{
	"RULES":    "Luật và heuristic tự viết",
	"STATS":    "Thống kê / Markov / đếm tần suất",
	"BANDIT":   "Bandit, học tăng cường đơn giản",
	"RL":       "Học tăng cường (Q-learning...)",
	"ML":       "Học máy cổ điển (hồi quy, cây quyết định...)",
	"NN":       "Mạng nơ-ron nhỏ (trọng số nhúng trong mã)",
	"ENSEMBLE": "Kết hợp nhiều mô hình",
	"OTHER":    "Khác",
}

// AIResult là điểm một mô hình đạt được trong một lượt. Phần riêng tư chỉ được lộ ra sau khi vòng loại kết thúc.
type AIResult struct {
	Public          float64            `json:"public"`
	Private         float64            `json:"private"`
	Reading         float64            `json:"reading"`
	Board           float64            `json:"board"`
	FamiliesPublic  map[string]float64 `json:"families_public,omitempty"`
	FamiliesPrivate map[string]float64 `json:"families_private,omitempty"`
	Bosses          map[string]float64 `json:"bosses,omitempty"`
	Notes           []string           `json:"notes,omitempty"`
	ElapsedMs       int                `json:"elapsed_ms,omitempty"`
	Failed          string             `json:"failed,omitempty"`
}

// PublicSeed là hạt giống công khai suy ra từ mã vòng loại: ai cũng dựng lại được bộ đối thủ công khai để huấn luyện.
func PublicSeed(eventID string) string {
	sum := sha256.Sum256([]byte("ai-public:" + eventID))
	return fmt.Sprintf("pub-%x", sum[:6])
}

// PrivateVisible: điểm riêng tư và bảng xếp hạng cuối chỉ mở khi vòng loại đã kết thúc.
func PrivateVisible(e Event) bool { return e.Status == "FINISHED" || e.Status == "PROMOTED" }

func sortAIParticipants(list []Participant, seed string, private bool) {
	key := func(p Participant) (float64, float64) {
		if private {
			return p.AIPrivate, p.AIReading
		}
		return p.AIPublic, p.AIPublic
	}
	sort.Slice(list, func(i, j int) bool {
		a, b := list[i], list[j]
		sa, ra := key(a)
		sb, rb := key(b)
		if sa != sb {
			return sa > sb
		}
		if ra != rb {
			return ra > rb
		}
		if a.SubmittedAt != b.SubmittedAt {
			return a.SubmittedAt < b.SubmittedAt
		}
		return fmt.Sprintf("%x", sha256.Sum256([]byte(seed+":"+a.SID))) < fmt.Sprintf("%x", sha256.Sum256([]byte(seed+":"+b.SID)))
	})
}

// AIBoardRow là một dòng bảng điểm Giải AI. Các trường riêng tư để rỗng khi chưa được phép công bố.
type AIBoardRow struct {
	Rank      int      `json:"rank"`
	StudentID string   `json:"student_id"`
	TeamName  string   `json:"team_name"`
	Score     float64  `json:"score"`
	Rounds    int      `json:"rounds"`
	Technique string   `json:"technique,omitempty"`
	Public    float64  `json:"public"`
	Private   *float64 `json:"private,omitempty"`
	Reading   *float64 `json:"reading,omitempty"`
	Board     *float64 `json:"board,omitempty"`
	Gap       *float64 `json:"gap,omitempty"`
}

// AILeaderboard trả bảng công khai (xếp theo điểm công khai) hoặc bảng riêng tư (chỉ khi được phép).
func (s *Service) AILeaderboard(id string, private, allowPrivate bool) (Event, []AIBoardRow, error) {
	e, err := s.Event(id)
	if err != nil {
		return e, nil, err
	}
	if e.Kind != KindAI {
		return e, nil, errors.New("Đây không phải vòng loại Giải AI.")
	}
	if private && !(allowPrivate || PrivateVisible(e)) {
		return e, nil, errors.New("Bảng điểm riêng tư sẽ mở khi vòng loại kết thúc.")
	}
	people, err := s.ParticipantSummaries(id)
	if err != nil {
		return e, nil, err
	}
	list := []Participant{}
	for _, p := range people {
		if p.LockedID != "" && !p.Banned && p.AIRounds > 0 {
			list = append(list, p)
		}
	}
	sortAIParticipants(list, e.Seed, private)
	rows := make([]AIBoardRow, 0, len(list))
	for i, p := range list {
		row := AIBoardRow{Rank: i + 1, StudentID: p.SID, TeamName: p.Name, Rounds: p.AIRounds, Technique: p.Technique, Public: round2(p.AIPublic), Score: round2(p.AIPublic)}
		if private {
			priv, reading, board, gap := round2(p.AIPrivate), round2(p.AIReading), round2(p.AIBoard), round2(p.AIPublic-p.AIReading)
			row.Score, row.Private, row.Reading, row.Board, row.Gap = priv, &priv, &reading, &board, &gap
		}
		rows = append(rows, row)
	}
	return e, rows, nil
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// SetModelCard lưu khai báo kỹ thuật của đội (chỉ trước khi vòng loại bắt đầu chấm).
func (s *Service) SetModelCard(id, sid, technique, card string) error {
	technique = strings.ToUpper(strings.TrimSpace(technique))
	card = strings.TrimSpace(card)
	if _, ok := AITechniques[technique]; !ok {
		return errors.New("Chọn một kỹ thuật trong danh sách.")
	}
	if len([]rune(card)) > 2000 {
		return errors.New("Thẻ mô hình tối đa 2.000 ký tự.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Kind != KindAI {
		return errors.New("Đây không phải vòng loại Giải AI.")
	}
	if e.Status != "OPEN" && e.Status != "CLOSING" && e.Status != "LOCKED" {
		return errors.New("Vòng loại đã bắt đầu chấm; không đổi khai báo kỹ thuật được nữa.")
	}
	var p Participant
	if err = s.Store.Get(participantKey(id, sid), &p); err != nil {
		return errors.New("Hãy đăng ký tham gia vòng loại trước.")
	}
	if p.Banned {
		return errors.New("Đội đã bị loại khỏi vòng loại.")
	}
	p.Technique, p.ModelCard = technique, card
	return s.Store.Batch(map[string]interface{}{participantKey(id, sid): p})
}
