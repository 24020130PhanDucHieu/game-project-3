package http

import (
	"math"
	"testing"

	"github.com/gin-gonic/gin"
)

func eloMatchData(a, b, winner string, level int, ts float64) map[string]interface{} {
	return map[string]interface{}{
		"status": "COMPLETED", "winner": winner, "round_level": float64(level), "round_name": "R",
		"team_a": map[string]interface{}{"student_id": a, "team_name": "T" + a, "rounds_won": float64(3)},
		"team_b": map[string]interface{}{"student_id": b, "team_name": "T" + b, "rounds_won": float64(1)},
		"rounds_history": []interface{}{map[string]interface{}{"timestamp": ts}},
	}
}

func TestMainEloIndependentOfQualifierSeed(t *testing.T) {
	all := map[string]interface{}{"t1": map[string]interface{}{
		"name": "Cup", "created_at": float64(1),
		// "elo" của đội là ELO vòng loại dùng xếp hạt giống: ELO giải chính không được lấy nó.
		"teams": []interface{}{
			map[string]interface{}{"student_id": "a", "team_name": "Ta", "elo": float64(1500)},
			map[string]interface{}{"student_id": "b", "team_name": "Tb", "elo": float64(900)},
		},
		"matches": map[string]interface{}{"m1": eloMatchData("a", "b", "team_a", 1, 100)},
	}}
	got := ComputeMainElo(all)
	if got["A"].Rating != 1216 || got["B"].Rating != 1184 {
		t.Fatalf("ELO sai: A=%v B=%v (muốn 1216/1184, cùng bắt đầu 1200)", got["A"].Rating, got["B"].Rating)
	}
	if got["A"].Wins != 1 || got["A"].Played != 1 || got["B"].Wins != 0 {
		t.Fatalf("thống kê sai: %+v %+v", got["A"], got["B"])
	}
}

func TestMainEloZeroSumAndChronological(t *testing.T) {
	all := map[string]interface{}{"t1": map[string]interface{}{"name": "Cup", "created_at": float64(1), "matches": map[string]interface{}{
		"late":  eloMatchData("a", "c", "team_b", 2, 300), // A thua C (ở sau)
		"early": eloMatchData("a", "b", "team_a", 1, 100), // A thắng B (ở trước)
	}}}
	got := ComputeMainElo(all)
	sum := got["A"].Rating + got["B"].Rating + got["C"].Rating
	if math.Abs(sum-3600) > 1e-9 {
		t.Fatalf("tổng ELO phải bảo toàn 3600, có %v", sum)
	}
	h := got["A"].History
	if len(h) != 2 || h[0].MatchID != "early" || h[1].MatchID != "late" {
		t.Fatalf("lịch sử phải theo thời gian: %+v", h)
	}
	if h[1].Before != h[0].After {
		t.Fatalf("ELO sau trận trước phải là ELO trước trận sau: %v vs %v", h[0].After, h[1].Before)
	}
	// Đối thủ mạnh hơn thì thắng được nhiều điểm hơn
	if !(got["C"].History[0].Delta > 16) {
		t.Fatalf("C (1200) thắng A (1216) phải được > 16 điểm, có %v", got["C"].History[0].Delta)
	}
}

func TestMainEloSkipsByesAndUnfinished(t *testing.T) {
	bye := eloMatchData("a", "", "team_a", 1, 100)
	unfinished := eloMatchData("a", "b", "team_a", 1, 100)
	unfinished["status"] = "READY"
	all := map[string]interface{}{"t1": map[string]interface{}{"name": "Cup", "matches": map[string]interface{}{"bye": bye, "u": unfinished}}}
	if got := ComputeMainElo(all); len(got) != 0 {
		t.Fatalf("không được tính trận nhường đi/chưa xong: %v", got)
	}
}

func aiTournament(name string, matches map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{"name": name, "created_at": float64(1), "track": "AI", "matches": matches}
}

func aiMatch(a, b, winner string, wonA, wonB int, ts float64) map[string]interface{} {
	return map[string]interface{}{
		"status": "COMPLETED", "winner": winner, "round_level": float64(1), "round_name": "Tứ kết",
		"team_a": map[string]interface{}{"student_id": a, "team_name": "T" + a, "rounds_won": float64(wonA)},
		"team_b": map[string]interface{}{"student_id": b, "team_name": "T" + b, "rounds_won": float64(wonB)},
		"rounds_history": []interface{}{
			map[string]interface{}{"timestamp": ts, "round_number": float64(1), "winner": "team_a", "task": map[string]interface{}{"name": "Đề X"}, "scores": map[string]interface{}{"team_a": 80.04, "team_b": 61.0}},
			map[string]interface{}{"timestamp": ts + 1, "round_number": float64(2), "winner": "team_b", "tie": true, "task": map[string]interface{}{"name": "Đề Y"}, "scores": map[string]interface{}{"team_a": 0.0, "team_b": 0.0}},
		},
	}
}

func TestAiEloMarginByMatchScoreKeepsZeroSum(t *testing.T) {
	cases := []struct {
		wonA, wonB int
		margin     float64
		gain       float64
	}{{3, 0, 1.3, 20.8}, {3, 1, 1.15, 18.4}, {3, 2, 1.0, 16.0}}
	for _, c := range cases {
		all := map[string]interface{}{"t": aiTournament("Cup AI", map[string]interface{}{"m": aiMatch("a", "b", "team_a", c.wonA, c.wonB, 100)})}
		got := ComputeMainElo(all)
		ev := got["A"].History[0]
		if math.Abs(ev.Margin-c.margin) > 1e-9 || math.Abs(ev.Delta-c.gain) > 0.051 || ev.K != 32 {
			t.Fatalf("%d-%d: margin=%v delta=%v k=%v (muốn %v / %v)", c.wonA, c.wonB, ev.Margin, ev.Delta, ev.K, c.margin, c.gain)
		}
		if math.Abs(got["A"].Rating+got["B"].Rating-2400) > 1e-9 {
			t.Fatalf("giải AI vẫn phải bảo toàn tổng ELO")
		}
		if ev.OpponentBefore != 1200 {
			t.Fatalf("phải ghi ELO đối thủ trước trận: %v", ev.OpponentBefore)
		}
	}
}

func TestNormalTournamentEloIgnoresMargin(t *testing.T) {
	all := map[string]interface{}{"t1": map[string]interface{}{"name": "Cup", "created_at": float64(1), "matches": map[string]interface{}{"m1": eloMatchData("a", "b", "team_a", 1, 100)}}}
	if ev := ComputeMainElo(all)["A"].History[0]; ev.Margin != 1 || ev.Delta != 16 {
		t.Fatalf("giải thường không có hệ số thưởng: %+v", ev)
	}
}

func TestEloEventCarriesRoundScoresFromEachSide(t *testing.T) {
	all := map[string]interface{}{"t": aiTournament("Cup AI", map[string]interface{}{"m": aiMatch("a", "b", "team_a", 3, 2, 100)})}
	got := ComputeMainElo(all)
	a, b := got["A"].History[0].Rounds, got["B"].History[0].Rounds
	if len(a) != 2 || a[0].Task != "Đề X" || a[0].MyScore != 80 || a[0].OppScore != 61 || !a[0].Won {
		t.Fatalf("điểm hiệp 1 nhìn từ A sai: %+v", a)
	}
	if b[0].MyScore != 61 || b[0].OppScore != 80 || b[0].Won || !b[1].Won || !b[1].Tie {
		t.Fatalf("điểm hiệp nhìn từ B sai: %+v", b)
	}
}

func TestEloFormulaDescribesMarginOnlyForAi(t *testing.T) {
	if _, ok := eloFormula("")["margin"]; ok {
		t.Fatal("giải thường không có hệ số thưởng")
	}
	m, ok := eloFormula("AI")["margin"].(gin.H)
	if !ok || m["0"] != 1.3 || m["1"] != 1.15 || m["2"] != 1.0 {
		t.Fatalf("công thức giải AI phải mô tả hệ số 1,3 / 1,15 / 1,0: %v", eloFormula("AI"))
	}
}
