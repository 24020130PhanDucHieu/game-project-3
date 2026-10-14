package http

import (
	"project-tuan3/internal/auth"
	"testing"
	"time"
)

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
