package ai

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Identity là người đang hỏi (lấy từ phiên đăng nhập, không do model hay người dùng tự khai).
type Identity struct {
	Role         string
	StudentID    string
	TeamName     string
	TournamentID string
}

type FAQItem struct {
	ID       string
	Topic    string
	Question string
	Answer   string
}

type TournamentRef struct {
	ID, Name, Status string
}

// Data là phần dữ liệu thật trong database mà công cụ được đọc. Tournament trả bản đã che theo phiên
// (luật chưa công bố chỉ còn publish_at, không lộ mã nguồn hay thông tin riêng).
type Data interface {
	Tournament(id string, who Identity) (map[string]interface{}, error)
	Tournaments() []TournamentRef
	TournamentsOfTeam(studentID string) []string
	PublicFAQ() ([]FAQItem, error)
}

type Toolbox struct {
	KB   *KB
	Data Data
	Now  func() time.Time
}

type ToolDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

func obj(props map[string]interface{}, required ...string) map[string]interface{} {
	s := map[string]interface{}{"type": "object", "properties": props}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func strProp(desc string) map[string]interface{} {
	return map[string]interface{}{"type": "string", "description": desc}
}

const SubmitTool = "submit_answer"

// Defs là danh sách công cụ gửi cho model.
func Defs() []ToolDef {
	tid := strProp("Mã giải (tùy chọn). Bỏ trống để dùng giải của đội đang hỏi.")
	return []ToolDef{
		{"search_knowledge", "Tìm trong tài liệu luật và hướng dẫn chính thức của cuộc thi (luật chơi, luật bổ sung, cách viết bot, quy trình, vòng loại, ELO, chat, webcam, mất mạng...). Trả về các đoạn nguyên văn kèm source_id. Rỗng nghĩa là tài liệu không có thông tin đó.",
			obj(map[string]interface{}{"query": strProp("Từ khóa hoặc câu hỏi cần tìm, tiếng Việt")}, "query")},
		{"list_tournaments", "Liệt kê các giải đấu đang có (mã, tên, trạng thái).", obj(map[string]interface{}{})},
		{"get_stage_rules", "Lấy luật đang áp dụng cho từng vòng của một giải (luật chuẩn hay luật bổ sung nào), kèm việc luật đã công bố hay chưa. Dùng khi hỏi vòng nào dùng luật gì.", obj(map[string]interface{}{"tournament_id": tid})},
		{"get_stage_schedule", "Lấy lịch/cửa sổ thời gian từng vòng của một giải (giờ mở, hạn chót, còn bao lâu). Dùng khi hỏi hạn nộp, giờ thi đấu.", obj(map[string]interface{}{"tournament_id": tid})},
		{"search_faq", "Tìm trong các câu hỏi và trả lời công khai mà ban tổ chức đã đăng.", obj(map[string]interface{}{"query": strProp("Từ khóa hoặc câu hỏi cần tìm")}, "query")},
		{"get_my_status", "Lấy trạng thái các trận của chính đội đang hỏi (đối thủ, hiệp hiện tại, đã nộp bot hợp lệ chưa). Chỉ trả dữ liệu của đội này.", obj(map[string]interface{}{"tournament_id": tid})},
		{"get_server_time", "Lấy giờ hiện tại của máy chủ.", obj(map[string]interface{}{})},
		{SubmitTool, "Gửi câu trả lời cuối cùng. BẮT BUỘC dùng để kết thúc. Mỗi ý trong câu trả lời phải có trích dẫn nguyên văn từ nguồn đã nhận. Nếu công cụ không trả về thông tin trả lời được câu hỏi, đặt needs_human = true và để citations rỗng.",
			obj(map[string]interface{}{
				"answer": strProp("Câu trả lời ngắn gọn bằng tiếng Việt, chỉ gồm thông tin có trong nguồn."),
				"citations": map[string]interface{}{"type": "array", "description": "Các nguồn làm căn cứ cho câu trả lời.", "items": obj(map[string]interface{}{
					"source_id": strProp("source_id do công cụ trả về trong lượt hỏi này"),
					"quote":     strProp("Đoạn trích NGUYÊN VĂN, copy y nguyên từ text của nguồn (8 đến 300 ký tự), chứng minh ý bạn nêu. Cần nhiều đoạn thì chép từng đoạn nguyên văn, nối bằng ..."),
				}, "source_id", "quote")},
				"needs_human": map[string]interface{}{"type": "boolean", "description": "true nếu không có thông tin để trả lời chắc chắn"},
			}, "answer", "citations", "needs_human")},
	}
}

type toolResult struct {
	Sources []Source `json:"sources"`
	Note    string   `json:"note,omitempty"`
}

// Run thực thi một công cụ. Lỗi dữ liệu trả về dưới dạng ghi chú cho model (không làm hỏng cả lượt hỏi).
func (tb *Toolbox) Run(name string, input json.RawMessage, who Identity) (toolResult, error) {
	var args struct {
		Query        string `json:"query"`
		TournamentID string `json:"tournament_id"`
	}
	_ = json.Unmarshal(input, &args)
	now := tb.Now()
	switch name {
	case "search_knowledge":
		hits := tb.KB.Search(args.Query, 4)
		if len(hits) == 0 {
			return toolResult{Sources: []Source{}, Note: "Tài liệu không có thông tin phù hợp với câu tìm này."}, nil
		}
		return toolResult{Sources: hits}, nil
	case "get_server_time":
		return toolResult{Sources: []Source{ServerTime(now)}}, nil
	case "list_tournaments":
		list := tb.Data.Tournaments()
		var out []Source
		for _, t := range list {
			out = append(out, Source{ID: "tournament:" + t.ID, Title: "Giải " + t.Name, Text: fmt.Sprintf("Giải %s, mã %s, trạng thái %s.", t.Name, t.ID, t.Status), Link: "view/bracket"})
		}
		if len(out) == 0 {
			return toolResult{Sources: []Source{}, Note: "Chưa có giải đấu nào."}, nil
		}
		return toolResult{Sources: out}, nil
	case "search_faq":
		items, err := tb.Data.PublicFAQ()
		if err != nil {
			return toolResult{Sources: []Source{}, Note: "Không đọc được hỏi đáp của ban tổ chức."}, nil
		}
		return toolResult{Sources: searchFAQ(items, args.Query, 3), Note: ""}, nil
	case "get_stage_rules", "get_stage_schedule", "get_my_status":
		if name == "get_my_status" && (who.Role != "TEAM" || who.StudentID == "") {
			return toolResult{Sources: []Source{}, Note: "Chỉ tài khoản đội mới có trạng thái trận của riêng mình."}, nil
		}
		tid, note := tb.resolveTournament(args.TournamentID, who)
		if tid == "" {
			return toolResult{Sources: []Source{}, Note: note}, nil
		}
		t, err := tb.Data.Tournament(tid, who)
		if err != nil {
			return toolResult{Sources: []Source{}, Note: "Không tìm thấy giải đấu có mã " + tid + "."}, nil
		}
		var out []Source
		switch name {
		case "get_stage_rules":
			out = StageRuleSources(tid, t, now)
		case "get_stage_schedule":
			out = append(StageScheduleSources(tid, t, now), ServerTime(now))
		default:
			out = MyStatusSources(tid, t, who.StudentID, now)
			if len(out) == 0 {
				return toolResult{Sources: []Source{}, Note: "Đội bạn chưa có trận nào trong giải " + strings.TrimSpace(fmt.Sprint(t["name"])) + "."}, nil
			}
		}
		return toolResult{Sources: out}, nil
	}
	return toolResult{Sources: []Source{}, Note: "Công cụ không tồn tại: " + name}, fmt.Errorf("công cụ không tồn tại: %s", name)
}

// resolveTournament: dùng mã giải được chỉ định, hoặc giải của phiên, hoặc giải duy nhất của đội/hệ thống.
func (tb *Toolbox) resolveTournament(requested string, who Identity) (string, string) {
	if id := strings.TrimSpace(requested); id != "" {
		return id, ""
	}
	if who.TournamentID != "" {
		return who.TournamentID, ""
	}
	if who.StudentID != "" {
		if mine := tb.Data.TournamentsOfTeam(who.StudentID); len(mine) == 1 {
			return mine[0], ""
		} else if len(mine) > 1 {
			return "", "Đội tham gia nhiều giải; hãy gọi list_tournaments rồi chỉ rõ tournament_id."
		}
	}
	if all := tb.Data.Tournaments(); len(all) == 1 {
		return all[0].ID, ""
	}
	return "", "Không xác định được giải. Hãy gọi list_tournaments rồi chỉ rõ tournament_id."
}

func searchFAQ(items []FAQItem, query string, limit int) []Source {
	terms := queryTerms(query)
	if len(terms) == 0 {
		return []Source{}
	}
	type hit struct {
		item  FAQItem
		score int
	}
	var hits []hit
	for _, it := range items {
		if strings.TrimSpace(it.Answer) == "" {
			continue
		}
		bag, bagF := map[string]bool{}, map[string]bool{}
		for _, w := range words(it.Question + " " + it.Answer) {
			bag[w] = true
			bagF[Fold(w)] = true
		}
		matched := 0
		for _, t := range terms {
			if (t.Folded && bagF[t.W]) || (!t.Folded && bag[t.W]) {
				matched++
			}
		}
		need := 1
		if len(terms) >= 3 {
			need = (len(terms) + 1) / 2
		}
		if matched >= need {
			hits = append(hits, hit{it, matched})
		}
	}
	for i := 1; i < len(hits); i++ { // chọn lọc đơn giản: ít phần tử
		for j := i; j > 0 && hits[j].score > hits[j-1].score; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
	out := []Source{}
	for _, h := range hits {
		if len(out) == limit {
			break
		}
		out = append(out, Source{ID: "faq:" + h.item.ID, Title: "Hỏi đáp của ban tổ chức", Text: "Câu hỏi: " + strings.TrimSpace(h.item.Question) + "\nBan tổ chức trả lời: " + strings.TrimSpace(h.item.Answer), Link: "guide/ask"})
	}
	return out
}
