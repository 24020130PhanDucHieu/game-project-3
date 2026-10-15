package http

import (
	"encoding/json"
	"project-tuan3/internal/auth"
	"strings"
	"testing"
	"time"
)

func TestFogRedactsOpponentAcrossBoardsAndLogsWithoutMutatingStorage(t *testing.T) {
	for _, id := range []string{"COMBO_4", "COMBO_5", "COMBO_6", "COMBO_7", "RULE_FOG"} {
		for _, own := range []string{"team_a", "team_b", ""} {
			original := map[string]interface{}{"stage_rule": id, "tie_break_seed": "secret", "team_a_move": "ROCK", "team_b_move": "PAPER",
				"board_steps": []interface{}{map[string]interface{}{
					"red_pieces":  []interface{}{map[string]interface{}{"type": "ROCK"}},
					"blue_pieces": []interface{}{map[string]interface{}{"type": "PAPER"}},
					"log":         "ROCK vs PAPER", "clash_event": map[string]interface{}{"winner_type": "ROCK", "loser_type": "PAPER", "log": "ROCK vs PAPER"},
				}}, "bot_logs": []interface{}{map[string]interface{}{"preferred_move": "SCISSORS", "log": "SCISSORS"}}}
			copy := cloneJSONMap(original)
			redactFogRound(copy, own)
			if copy["tie_break_seed"] != nil {
				t.Fatal("seed leaked")
			}
			step := copy["board_steps"].([]interface{})[0].(map[string]interface{})
			for _, side := range []string{"team_a", "team_b"} {
				key := "red_pieces"
				if side == "team_b" {
					key = "blue_pieces"
				}
				piece := step[key].([]interface{})[0].(map[string]interface{})
				if (piece["type"] == "UNKNOWN") != (side != own) {
					t.Fatal("wrong side masked", id, own, side)
				}
			}
			encoded, _ := json.Marshal(copy["bot_logs"])
			if strings.Contains(string(encoded), "SCISSORS") || step["log"] != "? vs ?" {
				t.Fatal("log leaked")
			}
			if original["tie_break_seed"] != "secret" {
				t.Fatal("storage changed")
			}
		}
	}
}

func TestUnpublishedRulesAreHiddenFromTeamsAndPublic(t *testing.T) {
	input := map[string]interface{}{"stage_rules": map[string]interface{}{
		"1": map[string]interface{}{"rule_id": "RULE_REVERSE", "publish_at": float64(time.Now().Unix() + 600)},
		"2": map[string]interface{}{"rule_id": "RULE_FOG", "publish_at": float64(0)},
	}}
	for _, session := range []auth.Session{{}, {Role: "TEAM", StudentID: "student"}} {
		rules := redactTournament(input, session)["stage_rules"].(map[string]interface{})
		hidden := rules["1"].(map[string]interface{})
		if hidden["rule_id"] != nil || hidden["hidden"] != true {
			t.Fatal("future rule leaked")
		}
		if rules["2"].(map[string]interface{})["rule_id"] != "RULE_FOG" {
			t.Fatal("published rule hidden")
		}
	}
	rules := redactTournament(input, auth.Session{Role: "ADMIN"})["stage_rules"].(map[string]interface{})
	if rules["1"].(map[string]interface{})["rule_id"] != "RULE_REVERSE" {
		t.Fatal("admin cannot inspect configuration")
	}
}
