package http

import (
	"math"
	"testing"
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
