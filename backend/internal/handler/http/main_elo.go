package http

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

// ELO của GIẢI CHÍNH: tính từ kết quả các trận đã kết thúc của mọi giải đấu loại trực tiếp.
// Độc lập hoàn toàn với ELO vòng loại: mọi đội đều bắt đầu từ 1200 ở giải chính, kể cả đội được chọn
// từ vòng loại (ELO vòng loại chỉ dùng để chọn đội và xếp hạt giống, không được cộng sang đây).
const (
	mainEloStart = 1200.0
	mainEloK     = 32.0
)

// EloEvent: một trận làm thay đổi ELO của một đội.
type EloEvent struct {
	TournamentID   string  `json:"tournament_id"`
	TournamentName string  `json:"tournament_name"`
	MatchID        string  `json:"match_id"`
	RoundName      string  `json:"round_name"`
	At             float64 `json:"at"`
	OpponentID     string  `json:"opponent_id"`
	OpponentName   string  `json:"opponent_name"`
	Result         string  `json:"result"` // "win" | "loss"
	Score          string  `json:"score"`  // số hiệp thắng của đội mình : của đối thủ
	Before         float64 `json:"before"`
	After          float64 `json:"after"`
	Delta          float64 `json:"delta"`
	Expected       float64 `json:"expected"` // xác suất thắng dự kiến trước trận
}

type MainEloTeam struct {
	StudentID string
	TeamName  string
	Rating    float64
	Played    int
	Wins      int
	History   []EloEvent
}

type eloMatch struct {
	tid, tname, mid, round string
	level                  int
	at                     float64
	a, b                   map[string]interface{}
	winner                 string
}

func num(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

func str(m map[string]interface{}, key string) string {
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

// ComputeMainElo duyệt mọi giải theo thứ tự thời gian của từng trận rồi cập nhật ELO hai đội cùng lúc.
func ComputeMainElo(all map[string]interface{}) map[string]*MainEloTeam {
	var list []eloMatch
	teams := map[string]*MainEloTeam{}
	ensure := func(sid, name string) *MainEloTeam {
		sid = strings.ToUpper(strings.TrimSpace(sid))
		t, ok := teams[sid]
		if !ok {
			t = &MainEloTeam{StudentID: sid, Rating: mainEloStart}
			teams[sid] = t
		}
		if name != "" {
			t.TeamName = name
		}
		return t
	}
	for tid, raw := range all {
		t, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		created := num(t["created_at"])
		// Đội đã đăng ký giải nhưng chưa đấu vẫn có mặt ở bảng với 1200.
		tms, _ := t["teams"].([]interface{})
		for _, r := range tms {
			if tm, ok := r.(map[string]interface{}); ok && str(tm, "student_id") != "" {
				ensure(str(tm, "student_id"), str(tm, "team_name"))
			}
		}
		matches, _ := t["matches"].(map[string]interface{})
		for mid, mr := range matches {
			m, ok := mr.(map[string]interface{})
			if !ok || m["status"] != "COMPLETED" || (m["winner"] != "team_a" && m["winner"] != "team_b") {
				continue
			}
			a, _ := m["team_a"].(map[string]interface{})
			b, _ := m["team_b"].(map[string]interface{})
			if a == nil || b == nil || str(a, "student_id") == "" || str(b, "student_id") == "" {
				continue // trận nhường đi hoặc thiếu đội: không tính
			}
			at := 0.0
			if rounds, _ := m["rounds_history"].([]interface{}); len(rounds) > 0 {
				if last, ok := rounds[len(rounds)-1].(map[string]interface{}); ok {
					at = num(last["timestamp"])
				}
			}
			level := int(num(m["round_level"]))
			if at == 0 { // kết quả do ban tổ chức xử: xếp theo thời điểm tạo giải và vòng đấu
				at = created + float64(level)
			}
			list = append(list, eloMatch{tid: tid, tname: str(t, "name"), mid: mid, round: str(m, "round_name"), level: level, at: at, a: a, b: b, winner: m["winner"].(string)})
		}
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].at != list[j].at {
			return list[i].at < list[j].at
		}
		if list[i].level != list[j].level {
			return list[i].level < list[j].level
		}
		return list[i].tid+list[i].mid < list[j].tid+list[j].mid
	})
	for _, m := range list {
		ta := ensure(str(m.a, "student_id"), str(m.a, "team_name"))
		tb := ensure(str(m.b, "student_id"), str(m.b, "team_name"))
		ea := 1 / (1 + math.Pow(10, (tb.Rating-ta.Rating)/400))
		sa, sb := 0.0, 1.0
		if m.winner == "team_a" {
			sa, sb = 1.0, 0.0
		}
		da, db := mainEloK*(sa-ea), mainEloK*(sb-(1-ea))
		wa, wb := int(num(m.a["rounds_won"])), int(num(m.b["rounds_won"]))
		ev := func(me, opp *MainEloTeam, before, delta, exp float64, won bool, mine, theirs int) EloEvent {
			res := "loss"
			if won {
				res = "win"
			}
			return EloEvent{TournamentID: m.tid, TournamentName: m.tname, MatchID: m.mid, RoundName: m.round, At: m.at,
				OpponentID: opp.StudentID, OpponentName: opp.TeamName, Result: res, Score: strconv.Itoa(mine) + ":" + strconv.Itoa(theirs),
				Before: round1(before), After: round1(before + delta), Delta: round1(delta), Expected: math.Round(exp*1000) / 1000}
		}
		ta.History = append(ta.History, ev(ta, tb, ta.Rating, da, ea, sa == 1, wa, wb))
		tb.History = append(tb.History, ev(tb, ta, tb.Rating, db, 1-ea, sb == 1, wb, wa))
		ta.Rating += da
		tb.Rating += db
		ta.Played++
		tb.Played++
		if sa == 1 {
			ta.Wins++
		} else {
			tb.Wins++
		}
	}
	return teams
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
