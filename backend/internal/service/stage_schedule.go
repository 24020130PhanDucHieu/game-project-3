package service

import (
	"errors"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"time"
)

type StageWindow struct {
	Level    int     `json:"level"`
	StartsAt float64 `json:"starts_at"`
	EndsAt   float64 `json:"ends_at"`
}

func number(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

func CanStartStage(tournament, match map[string]interface{}, now time.Time) error {
	level := int(number(match["round_level"]))
	matches, _ := tournament["matches"].(map[string]interface{})
	for _, raw := range matches {
		previous, _ := raw.(map[string]interface{})
		if int(number(previous["round_level"])) < level && previous["status"] != "COMPLETED" {
			return errors.New("Vòng trước chưa hoàn tất. Chưa thể bắt đầu vòng này.")
		}
	}
	schedule, _ := tournament["stage_schedule"].(map[string]interface{})
	window, _ := schedule[strconv.Itoa(level)].(map[string]interface{})
	if window == nil {
		return nil
	}
	unix := float64(now.UnixMilli()) / 1000
	if unix < number(window["starts_at"]) {
		return errors.New("Chưa đến giờ mở vòng đấu đã đặt trong lịch.")
	}
	if unix >= number(window["ends_at"]) {
		return errors.New("Đã hết thời gian vòng đấu. Ban tổ chức cần gia hạn lịch trước khi bắt đầu hiệp mới.")
	}
	return nil
}

func (s *TournamentService) SetStageSchedule(id string, windows []StageWindow) (map[string]interface{}, error) {
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
		return nil, errors.New("Giải đã hoàn tất, không thể thay đổi lịch.")
	}
	matches, _ := tournament["matches"].(map[string]interface{})
	levels := map[int]bool{}
	played := map[int]bool{}
	for _, raw := range matches {
		match, _ := raw.(map[string]interface{})
		level := int(number(match["round_level"]))
		levels[level] = true
		history, _ := match["rounds_history"].([]interface{})
		if len(history) > 0 || match["battle_running"] == true {
			played[level] = true
		}
	}
	if len(windows) > len(levels) {
		return nil, errors.New("Lịch chứa vòng không tồn tại.")
	}
	sort.Slice(windows, func(i, j int) bool { return windows[i].Level < windows[j].Level })
	schedule := map[string]interface{}{}
	previousEnd := float64(0)
	now := float64(time.Now().UnixMilli()) / 1000
	old, _ := tournament["stage_schedule"].(map[string]interface{})
	for _, w := range windows {
		key := strconv.Itoa(w.Level)
		if !levels[w.Level] || schedule[key] != nil || math.IsNaN(w.StartsAt) || math.IsNaN(w.EndsAt) || math.IsInf(w.StartsAt, 0) || math.IsInf(w.EndsAt, 0) || w.StartsAt <= 0 || w.EndsAt <= w.StartsAt || w.EndsAt > 253402300799 {
			return nil, errors.New("Vòng đấu hoặc khoảng thời gian không hợp lệ. Giờ kết thúc phải sau giờ bắt đầu.")
		}
		if w.StartsAt < previousEnd {
			return nil, errors.New("Thời gian các vòng không được chồng nhau.")
		}
		window := map[string]interface{}{"starts_at": w.StartsAt, "ends_at": w.EndsAt}
		if played[w.Level] && !reflect.DeepEqual(window, old[key]) {
			oldWindow, _ := old[key].(map[string]interface{})
			if oldWindow == nil {
				if w.StartsAt > now || w.EndsAt <= now {
					return nil, errors.New("Vòng đang thi đấu: giờ mở phải ở quá khứ và giờ đóng ở tương lai.")
				}
			} else if w.StartsAt != number(oldWindow["starts_at"]) || w.EndsAt < number(oldWindow["ends_at"]) || w.EndsAt <= now {
				return nil, fmt.Errorf("Vòng %d đã thi đấu. Chỉ có thể gia hạn giờ kết thúc, giữ giờ bắt đầu.", w.Level)
			}
		}
		schedule[key] = window
		previousEnd = w.EndsAt
	}
	for level := range played {
		key := strconv.Itoa(level)
		if old[key] != nil && schedule[key] == nil {
			return nil, errors.New("Không thể xóa lịch vòng đã thi đấu.")
		}
	}
	tournament["stage_schedule"] = schedule
	if err = s.repo.Save(id, tournament); err != nil {
		return nil, err
	}
	if err = s.repo.SaveToDisk(); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "SUCCESS", "stage_schedule": schedule}, nil
}
