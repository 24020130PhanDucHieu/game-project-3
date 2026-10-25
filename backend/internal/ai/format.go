package ai

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Giờ hiển thị luôn theo múi giờ Việt Nam để câu trả lời khớp với giờ sinh viên thấy.
var vnZone = time.FixedZone("ICT", 7*3600)

func FormatTime(t time.Time) string { return t.In(vnZone).Format("15:04 02/01/2006") }

func unixTime(sec float64) time.Time {
	return time.Unix(int64(sec), int64((sec-float64(int64(sec)))*1e9))
}

// Duration viết sẵn thành chữ (ví dụ "2 giờ 15 phút") để con số nằm nguyên văn trong nguồn dữ liệu.
func Duration(d time.Duration) string {
	if d < 0 {
		d = -d
	}
	days, hours, mins := int(d.Hours())/24, int(d.Hours())%24, int(d.Minutes())%60
	switch {
	case days > 0:
		return fmt.Sprintf("%d ngày %d giờ %d phút", days, hours, mins)
	case hours > 0:
		return fmt.Sprintf("%d giờ %d phút", hours, mins)
	case mins > 0:
		return fmt.Sprintf("%d phút", mins)
	}
	return "dưới 1 phút"
}

// ServerTime là nguồn dữ liệu "giờ máy chủ".
func ServerTime(now time.Time) Source {
	return Source{ID: "time:now", Title: "Giờ máy chủ", Text: "Giờ máy chủ hiện tại: " + FormatTime(now) + " (giờ Việt Nam, UTC+7).", Link: "guide/rules"}
}

type ruleBit struct {
	Bit         int
	Label, Hint string
}

// Phải khớp frontend/lib/format.ts (ruleBits); test đối chiếu số bit và nhãn.
var ruleBits = []ruleBit{
	{1, "Trộn quân", "Số lượng và vị trí quân được xáo ngẫu nhiên, hai bên đối xứng."},
	{2, "Đảo tương khắc", "Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa."},
	{4, "Sương mù", "Không thấy loại quân của đối thủ (hiện ?)."},
	{8, "Ô bí ẩn", "Một số ô đặc biệt trên bàn kích hoạt hiệu ứng khi quân bước vào."},
	{16, "Chướng ngại ngẫu nhiên", "Mỗi trận sinh ngẫu nhiên các khối đá đối xứng trên bàn; không quân nào đi vào hay xuyên qua được."},
}

var comboRe = regexp.MustCompile(`^COMBO_(\d+)$`)

// RuleLabels giải mã mã luật của vòng thành danh sách tên luật bổ sung đang bật (rỗng = luật chuẩn).
func RuleLabels(ruleID string) []ruleBit {
	var out []ruleBit
	pick := func(mask int) {
		for _, b := range ruleBits {
			if mask&b.Bit != 0 {
				out = append(out, b)
			}
		}
	}
	if m := comboRe.FindStringSubmatch(ruleID); m != nil {
		n, _ := strconv.Atoi(m[1])
		pick(n)
		return out
	}
	switch ruleID {
	case "STAGE_2_MUTATED":
		pick(1)
	case "RULE_REVERSE":
		pick(2)
	case "RULE_FOG":
		pick(4)
	case "RULE_SPECIAL_TILES", "STAGE_SPECIAL_TILES":
		pick(8)
	case "RULE_OBSTACLES", "STAGE_OBSTACLES":
		pick(16)
	}
	return out
}

func num(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}

func text(m map[string]interface{}, key string) string {
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

func sub(m map[string]interface{}, key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	return v
}

func levelNames(t map[string]interface{}) map[int]string {
	out := map[int]string{}
	for _, raw := range sub(t, "matches") {
		m, _ := raw.(map[string]interface{})
		if name := text(m, "round_name"); name != "" {
			out[int(num(m["round_level"]))] = name
		}
	}
	return out
}

func levelsOf(group map[string]interface{}) []int {
	var out []int
	for k := range group {
		if n, err := strconv.Atoi(k); err == nil {
			out = append(out, n)
		}
	}
	sort.Ints(out)
	return out
}

func levelLabel(names map[int]string, level int) string {
	if n := names[level]; n != "" {
		return fmt.Sprintf("%s (vòng %d)", n, level)
	}
	return fmt.Sprintf("Vòng %d", level)
}

// StageRuleSources: luật từng vòng của giải. Dữ liệu phải là bản đã che (redactTournament) nên luật chưa công bố
// chỉ còn publish_at; ở đây nói rõ "chưa công bố" thay vì để model đoán.
func StageRuleSources(tid string, t map[string]interface{}, now time.Time) []Source {
	name := text(t, "name")
	rules := sub(t, "stage_rules")
	names := levelNames(t)
	if len(rules) == 0 {
		return []Source{{ID: "rules:" + tid, Title: "Luật các vòng · " + name, Text: "Giải " + name + " chưa cấu hình luật riêng cho từng vòng, áp dụng luật chuẩn.", Link: "guide/rules"}}
	}
	var out []Source
	for _, level := range levelsOf(rules) {
		r, _ := rules[strconv.Itoa(level)].(map[string]interface{})
		label := levelLabel(names, level)
		var body string
		if r["hidden"] == true {
			at := unixTime(num(r["publish_at"]))
			body = fmt.Sprintf("%s của giải %s: luật chưa được công bố, sẽ công bố lúc %s (còn %s). Chưa thể cho biết luật của vòng này.", label, name, FormatTime(at), Duration(at.Sub(now)))
		} else if labels := RuleLabels(text(r, "rule_id")); len(labels) == 0 {
			body = fmt.Sprintf("%s của giải %s: luật chuẩn, không có luật bổ sung.", label, name)
		} else {
			parts := make([]string, 0, len(labels))
			for _, b := range labels {
				parts = append(parts, b.Label+" ("+b.Hint+")")
			}
			body = fmt.Sprintf("%s của giải %s: luật bổ sung đang bật gồm %s.", label, name, strings.Join(parts, "; "))
		}
		out = append(out, Source{ID: fmt.Sprintf("rules:%s:%d", tid, level), Title: "Luật " + label + " · " + name, Text: body, Link: "guide/rules"})
	}
	return out
}

// StageScheduleSources: cửa sổ thời gian từng vòng, kèm trạng thái và thời gian còn lại đã tính sẵn.
func StageScheduleSources(tid string, t map[string]interface{}, now time.Time) []Source {
	name := text(t, "name")
	schedule := sub(t, "stage_schedule")
	names := levelNames(t)
	if len(schedule) == 0 {
		return []Source{{ID: "schedule:" + tid, Title: "Lịch các vòng · " + name, Text: "Giải " + name + " chưa đặt lịch thời gian cho từng vòng.", Link: "view/match"}}
	}
	var out []Source
	for _, level := range levelsOf(schedule) {
		w, _ := schedule[strconv.Itoa(level)].(map[string]interface{})
		start, end := unixTime(num(w["starts_at"])), unixTime(num(w["ends_at"]))
		label := levelLabel(names, level)
		state := ""
		switch {
		case now.Before(start):
			state = fmt.Sprintf("chưa mở, còn %s nữa mới mở", Duration(start.Sub(now)))
		case now.Before(end):
			state = fmt.Sprintf("đang mở, còn %s nữa là hết hạn", Duration(end.Sub(now)))
		default:
			state = "đã đóng"
		}
		out = append(out, Source{ID: fmt.Sprintf("schedule:%s:%d", tid, level), Title: "Lịch " + label + " · " + name,
			Text: fmt.Sprintf("%s của giải %s: mở từ %s đến %s (giờ Việt Nam); hiện %s.", label, name, FormatTime(start), FormatTime(end), state), Link: "view/match"})
	}
	return out
}

func yn(b bool, yes, no string) string {
	if b {
		return yes
	}
	return no
}

// MyStatusSources: trạng thái các trận của đúng đội đang hỏi (đối thủ và tỉ số là thông tin công khai của trận).
func MyStatusSources(tid string, t map[string]interface{}, studentID string, now time.Time) []Source {
	name := text(t, "name")
	var out []Source
	ids := make([]string, 0)
	matches := sub(t, "matches")
	for id := range matches {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		m, _ := matches[id].(map[string]interface{})
		var mine, other map[string]interface{}
		for _, pair := range [][2]string{{"team_a", "team_b"}, {"team_b", "team_a"}} {
			if team := sub(m, pair[0]); team != nil && strings.EqualFold(text(team, "student_id"), studentID) {
				mine, other = team, sub(m, pair[1])
			}
		}
		if mine == nil {
			continue
		}
		opp := "chưa xác định"
		if other != nil && text(other, "team_name") != "" {
			opp = text(other, "team_name")
		}
		round := text(m, "round_name")
		if round == "" {
			round = id
		}
		status := "chưa bắt đầu"
		switch text(m, "status") {
		case "COMPLETED":
			status = "đã kết thúc"
			if w := text(m, "winner_name"); w != "" {
				status += ", đội thắng là " + w
			}
		case "IN_PROGRESS", "RUNNING":
			status = "đang diễn ra"
		}
		var detail []string
		if text(m, "status") != "COMPLETED" && other != nil {
			detail = append(detail, "hiệp hiện tại là hiệp "+strconv.Itoa(int(num(m["current_round_idx"]))))
			detail = append(detail, "tỉ số hiệp thắng "+strconv.Itoa(int(num(mine["rounds_won"])))+" - "+strconv.Itoa(int(num(other["rounds_won"]))))
			detail = append(detail, "đội bạn "+yn(mine["code_valid"] == true, "đã nộp bot hợp lệ", "chưa nộp bot hợp lệ cho hiệp này"))
			detail = append(detail, "đối thủ "+yn(other["code_valid"] == true, "đã nộp bot hợp lệ", "chưa nộp bot hợp lệ"))
		}
		body := fmt.Sprintf("Trận %s của giải %s: đội bạn đấu với %s; trận %s.", round, name, opp, status)
		if len(detail) > 0 {
			body += " " + strings.Join(detail, "; ") + "."
		}
		out = append(out, Source{ID: fmt.Sprintf("status:%s:%s", tid, id), Title: "Trận " + round + " của đội bạn", Text: body, Link: "view/match"})
	}
	return out
}
