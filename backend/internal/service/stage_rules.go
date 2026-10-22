package service

import (
	"errors"
	"math"
	"reflect"
	"strconv"
	"time"
)

type StageRule struct {
	Level     int     `json:"level"`
	RuleID    string  `json:"rule_id"`
	PublishAt float64 `json:"publish_at"`
}

func ValidStageRule(id string) bool {
	if len(id) >= 7 && id[:6] == "COMBO_" {
		val, err := strconv.Atoi(id[6:])
		if err == nil && val >= 0 && val <= 31 {
			return true
		}
	}
	switch id {
	case "STAGE_1_STANDARD", "STAGE_2_MUTATED", "RULE_REVERSE", "RULE_FOG", "RULE_SPECIAL_TILES", "STAGE_SPECIAL_TILES", "RULE_OBSTACLES", "STAGE_OBSTACLES":
		return true
	}
	return false
}

func StageRuleFor(tournament, match map[string]interface{}) map[string]interface{} {
	rules, _ := tournament["stage_rules"].(map[string]interface{})
	rule, _ := rules[strconv.Itoa(int(number(match["round_level"])))].(map[string]interface{})
	return rule
}

func CheckStageRulePublished(tournament, match map[string]interface{}, now time.Time) error {
	rule := StageRuleFor(tournament, match)
	if rule != nil && number(rule["publish_at"]) > float64(now.UnixMilli())/1000 {
		return errors.New("Luật vòng đấu chưa được công bố. Chờ giờ công bố để nộp code và thi đấu.")
	}
	return nil
}

func (s *TournamentService) SetStageRules(id string, requested []StageRule) (map[string]interface{}, error) {
	return s.SetStageRulesWithCorrection(id, requested, false)
}

func (s *TournamentService) SetStageRulesWithCorrection(id string, requested []StageRule, correction bool) (map[string]interface{}, error) {
	unlock := s.lockTournament(id)
	defer unlock()
	tournament, found, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.New("Không tìm thấy giải đấu.")
	}
	if tournament["status"] == "FINISHED" {
		return nil, errors.New("Giải đã hoàn tất, không thể đổi luật.")
	}
	matches, _ := tournament["matches"].(map[string]interface{})
	levels := map[int]bool{}
	played := map[int]bool{}
	for _, raw := range matches {
		match, _ := raw.(map[string]interface{})
		level := int(number(match["round_level"]))
		levels[level] = true
		history, _ := match["rounds_history"].([]interface{})
		if len(history) > 0 || match["battle_running"] == true || match["status"] == "COMPLETED" {
			played[level] = true
		}
	}
	old, _ := tournament["stage_rules"].(map[string]interface{})
	next := map[string]interface{}{}
	for key, value := range old {
		next[key] = value
	}
	seen := map[int]bool{}
	changed := map[int]bool{}
	now := float64(time.Now().UnixMilli()) / 1000
	for _, r := range requested {
		existing, _ := old[strconv.Itoa(r.Level)].(map[string]interface{})
		preserveLegacy := existing != nil && existing["rule_id"] == r.RuleID && (r.RuleID == "RULE_MUTATED_FOG" || r.RuleID == "STAGE_3_REVERSE_FOG" || r.RuleID == "STAGE_4_FINALS")
		if !levels[r.Level] || seen[r.Level] || (!ValidStageRule(r.RuleID) && !preserveLegacy) || math.IsNaN(r.PublishAt) || math.IsInf(r.PublishAt, 0) || r.PublishAt < 0 || r.PublishAt > 253402300799 {
			return nil, errors.New("Vòng, luật hoặc giờ công bố không hợp lệ.")
		}
		seen[r.Level] = true
		key := strconv.Itoa(r.Level)
		value := map[string]interface{}{"rule_id": r.RuleID, "publish_at": r.PublishAt}
		if reflect.DeepEqual(value, old[key]) {
			continue
		}
		previous, _ := old[key].(map[string]interface{})
		if played[r.Level] {
			return nil, errors.New("Không thể đổi luật vòng đã có trận thi đấu.")
		}
		if previous != nil && number(previous["publish_at"]) <= now && !correction {
			return nil, errors.New("Luật đã công bố được khóa để bảo đảm công bằng.")
		}
		next[key] = value
		changed[r.Level] = true
	}
	// A different rule requires fresh valid submissions; keep drafts and history.
	for _, raw := range matches {
		match, _ := raw.(map[string]interface{})
		if !changed[int(number(match["round_level"]))] {
			continue
		}
		for _, side := range []string{"team_a", "team_b"} {
			team, _ := match[side].(map[string]interface{})
			if team == nil {
				continue
			}
			team["code_valid"] = false
			team["code_submitted"] = false
			team["active_submission_id"] = nil
		}
		match["all_teams_ready"] = false
		match["round_status"] = "AWAITING_SUBMISSIONS"
	}
	tournament["stage_rules"] = next
	if err = s.repo.Save(id, tournament); err != nil {
		return nil, err
	}
	if err = s.repo.SaveToDisk(); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "SUCCESS", "stage_rules": next}, nil
}
