package http

import (
	"testing"

	"project-tuan3/internal/auth"
)

func TestRedactTournamentProtectsSourceAndCredentials(t *testing.T) {
	input := map[string]interface{}{
		"teams": []interface{}{map[string]interface{}{"credential_hash": "hash", "code_content": "registration source"}},
		"matches": map[string]interface{}{
			"m1": map[string]interface{}{
				"team_a":              map[string]interface{}{"current_code": "secret-a", "draft_code": "draft-a", "credential_hash": "hash-a"},
				"team_b":              map[string]interface{}{"current_code": "secret-b", "draft_code": "draft-b", "credential_hash": "hash-b"},
				"rounds_history":      []interface{}{map[string]interface{}{"team_a_code": "replay-a", "team_b_code": "replay-b"}},
				"submissions_history": []interface{}{map[string]interface{}{"side": "team_a", "code": "submitted-a"}, map[string]interface{}{"side": "team_b", "code": "submitted-b"}},
			},
		},
	}

	public := redactTournament(input, auth.Session{})
	match := public["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if _, exists := match["team_a"].(map[string]interface{})["current_code"]; exists {
		t.Fatal("public response exposed current code")
	}
	if _, exists := match["rounds_history"].([]interface{})[0].(map[string]interface{})["team_a_code"]; exists {
		t.Fatal("public response exposed replay source")
	}
	if _, exists := public["teams"].([]interface{})[0].(map[string]interface{})["credential_hash"]; exists {
		t.Fatal("public response exposed credential hash")
	}

	own := redactTournament(input, auth.Session{Role: "TEAM", TournamentID: "t1", MatchID: "m1", Side: "team_a"})
	ownMatch := own["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if ownMatch["team_a"].(map[string]interface{})["current_code"] != "secret-a" {
		t.Fatal("team session cannot read its own source")
	}
	if _, exists := ownMatch["team_b"].(map[string]interface{})["current_code"]; exists {
		t.Fatal("team session exposed opponent source")
	}
	if len(ownMatch["submissions_history"].([]interface{})) != 1 {
		t.Fatal("team session exposed opponent submissions")
	}

	official := redactTournament(input, auth.Session{Role: "ADMIN"})
	officialMatch := official["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if officialMatch["team_b"].(map[string]interface{})["current_code"] != "secret-b" {
		t.Fatal("official cannot inspect source")
	}
}
