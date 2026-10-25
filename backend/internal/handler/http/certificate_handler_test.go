package http

import "testing"

func team(name, sid string) map[string]interface{} {
	return map[string]interface{}{"team_name": name, "student_id": sid}
}

func TestPlacementsOfFinalAndSemis(t *testing.T) {
	tour := map[string]interface{}{"matches": map[string]interface{}{
		"s1": map[string]interface{}{"round_level": float64(1), "winner": "team_a", "team_a": team("A", "1"), "team_b": team("B", "2")},
		"s2": map[string]interface{}{"round_level": float64(1), "winner": "team_b", "team_a": team("C", "3"), "team_b": team("D", "4")},
		"f":  map[string]interface{}{"round_level": float64(2), "winner": "team_b", "team_a": team("A", "1"), "team_b": team("D", "4")},
	}}
	got := map[string]string{}
	for _, p := range placementsOf(tour) {
		got[p.StudentID] = p.Place
	}
	want := map[string]string{"4": "Quán quân", "1": "Á quân", "2": "Đồng hạng Ba", "3": "Đồng hạng Ba"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s: got %q want %q", k, got[k], v)
		}
	}
}

func TestPlacementsOfNoneBeforeFinal(t *testing.T) {
	tour := map[string]interface{}{"matches": map[string]interface{}{
		"s1": map[string]interface{}{"round_level": float64(1), "winner": "team_a", "team_a": team("A", "1"), "team_b": team("B", "2")},
		"f":  map[string]interface{}{"round_level": float64(2), "team_a": team("A", "1"), "team_b": team("", "")},
	}}
	if p := placementsOf(tour); len(p) != 0 {
		t.Fatalf("chưa có chung kết mà đã có giấy: %v", p)
	}
}
