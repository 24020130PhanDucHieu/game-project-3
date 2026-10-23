package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// CorrectionToken binds an official's decision to the exact snapshot they reviewed.
func CorrectionToken(t map[string]interface{}) string {
	state := make(map[string]interface{}, len(t))
	for key, value := range t {
		if key != "_incident_checkpoint" && key != "incident_log" && key != "correction_token" {
			state[key] = value
		}
	}
	raw, err := json.Marshal(state)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

type MatchCorrection struct {
	Token  string `json:"token"`
	Reason string `json:"reason"`
	Action string `json:"action"`
	ScoreA int    `json:"score_a"`
	ScoreB int    `json:"score_b"`
}

func incidentCopy(t map[string]interface{}) map[string]interface{} {
	raw, _ := json.Marshal(t)
	var result map[string]interface{}
	_ = json.Unmarshal(raw, &result)
	delete(result, "_incident_checkpoint")
	delete(result, "incident_log")
	return result
}

// Corrections are serialized with submissions and game completion. Rollback is
// allowed only before any subsequent state change, preventing lost new results.
func (s *TournamentService) CorrectMatch(id, matchID string, req MatchCorrection) (map[string]interface{}, error) {
	unlock := s.lockTournament(id)
	defer unlock()
	t, found, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.New("Không tìm thấy giải đấu.")
	}
	if req.Token == "" || req.Token != CorrectionToken(t) {
		return nil, errors.New("Dữ liệu đã thay đổi. Làm mới trận đấu và kiểm tra lại trước khi xác nhận.")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if utf8.RuneCountInString(req.Reason) < 5 || utf8.RuneCountInString(req.Reason) > 500 {
		return nil, errors.New("Lý do cần từ 5 đến 500 ký tự.")
	}
	logs, _ := t["incident_log"].([]interface{})
	if req.Action == "rollback" {
		checkpoint, _ := t["_incident_checkpoint"].(map[string]interface{})
		before, _ := checkpoint["before"].(map[string]interface{})
		if before == nil || checkpoint["match_id"] != matchID || checkpoint["after"] != req.Token {
			return nil, errors.New("Không thể hoàn tác: đã có thao tác hoặc kết quả mới sau lần sửa.")
		}
		t = before
	} else {
		if req.Action != "result" {
			return nil, errors.New("Thao tác xử lý sự cố không hợp lệ.")
		}
		if req.ScoreA < 0 || req.ScoreB < 0 || req.ScoreA > 3 || req.ScoreB > 3 || req.ScoreA+req.ScoreB > 5 || req.ScoreA == req.ScoreB {
			return nil, errors.New("Tỷ số cần xác định một đội thắng; mỗi đội tối đa 3 hiệp, tổng tối đa 5 hiệp.")
		}
		matches, _ := t["matches"].(map[string]interface{})
		match, _ := matches[matchID].(map[string]interface{})
		a, _ := match["team_a"].(map[string]interface{})
		b, _ := match["team_b"].(map[string]interface{})
		if match == nil || a == nil || b == nil {
			return nil, errors.New("Trận chưa có đủ hai đội.")
		}
		if match["battle_running"] == true || match["round_status"] == "BATTLE_RUNNING" {
			return nil, errors.New("Chờ hiệp đang chạy kết thúc trước khi sửa kết quả.")
		}
		nextID, _ := match["next_match_id"].(string)
		next, _ := matches[nextID].(map[string]interface{})
		if next != nil {
			rounds, _ := next["rounds_history"].([]interface{})
			submissions, _ := next["submissions_history"].([]interface{})
			if next["battle_running"] == true || next["status"] == "COMPLETED" || len(rounds) > 0 || len(submissions) > 0 {
				return nil, errors.New("Nhánh tiếp theo đã có bài nộp hoặc kết quả. Không thể tự động thay đổi đội đi tiếp.")
			}
		}
		before := incidentCopy(t)
		winner, winning := "team_a", a
		if req.ScoreB > req.ScoreA {
			winner, winning = "team_b", b
		}
		if winning["disqualified"] == true {
			return nil, errors.New("Không thể xử thắng cho đội đã bị loại.")
		}
		a["rounds_won"], b["rounds_won"] = req.ScoreA, req.ScoreB
		match["status"], match["round_status"] = "COMPLETED", "COMPLETED"
		match["winner"], match["winner_name"] = winner, winning["team_name"]
		match["battle_running"], match["intermission_ends_at"] = false, nil
		match["admin_decision"] = req.Reason
		if next != nil {
			slot, _ := match["next_slot"].(string)
			if slot != "team_a" && slot != "team_b" {
				return nil, errors.New("Nhánh tiếp theo không hợp lệ.")
			}
			advanced := incidentCopy(winning)
			advanced["rounds_won"], advanced["hp"] = 0, 100
			advanced["code_submitted"], advanced["code_valid"], advanced["active_submission_id"] = false, false, nil
			advanced["current_code"], advanced["draft_code"] = "", ""
			next[slot], next["all_teams_ready"] = advanced, false
			if next["team_a"] != nil && next["team_b"] != nil {
				next["status"] = "READY"
			}
			t["status"], t["champion"] = "RUNNING", nil
		} else {
			t["status"], t["champion"] = "FINISHED", winning["team_name"]
		}
		t["_incident_checkpoint"] = map[string]interface{}{"before": before, "after": CorrectionToken(t), "match_id": matchID}
	}
	logs = append(logs, map[string]interface{}{"at": time.Now().UTC().Format(time.RFC3339), "match_id": matchID, "action": req.Action, "reason": req.Reason, "score_a": req.ScoreA, "score_b": req.ScoreB})
	if len(logs) > 50 {
		logs = logs[len(logs)-50:]
	}
	t["incident_log"] = logs
	if err := s.repo.Save(id, t); err != nil {
		return nil, err
	}
	if err := s.repo.SaveToDisk(); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "SUCCESS", "message": "Đã cập nhật kết quả và nhánh đi tiếp. Thao tác được ghi vào nhật ký.", "correction_token": CorrectionToken(t)}, nil
}
