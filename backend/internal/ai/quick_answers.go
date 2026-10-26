package ai

import "strings"

// Chỉ khớp trọn câu hỏi phổ biến. Không áp dụng cho câu hỏi về một vòng/đội
// cụ thể hoặc câu có chỉ thị thêm. Nội dung luôn đọc từ KB hiện tại.
var quickQuestions = map[string]string{
	"ban co co kich thuoc bao nhieu va moi ben co may quan": "kb:luat-co-ban#ban-co-va-quan-co",
	"ban co co kich thuoc bao nhieu moi ben co may quan":    "kb:luat-co-ban#ban-co-va-quan-co",
	"ban co co kich thuoc bao nhieu":                        "kb:luat-co-ban#ban-co-va-quan-co",
	"ban co bao nhieu o":                                    "kb:luat-co-ban#ban-co-va-quan-co",
	"moi ben co may quan":                                   "kb:luat-co-ban#ban-co-va-quan-co",
	"luat suong mu hoat dong the nao":                       "kb:luat-bo-sung#suong-mu",
	"luat suong mu la gi":                                   "kb:luat-bo-sung#suong-mu",
	"quan joker di duoc toi da bao nhieu buoc":              "kb:luat-bo-sung#quan-joker",
	"bua thang gi keo thang gi":                             "kb:luat-co-ban#quan-nao-thang-quan-nao",
	"mot tran bo5 thang may hiep thi di tiep":               "kb:luat-co-ban#the-thuc-tran-bo5",
}

func (a *Agent) quickAnswer(question string) (Result, bool) {
	if !a.PrefetchKnowledge || a.Tools == nil || a.Tools.KB == nil {
		return Result{}, false
	}
	id, ok := quickQuestions[strings.Join(words(Fold(question)), " ")]
	if !ok {
		return Result{}, false
	}
	for _, chunk := range a.Tools.KB.chunks {
		if chunk.ID != id {
			continue
		}
		_, content, found := strings.Cut(chunk.Text, "\n")
		if !found {
			return Result{}, false
		}
		answer := strings.TrimSpace(content)
		if id == "kb:luat-co-ban#ban-co-va-quan-co" {
			parts := strings.SplitAfter(answer, ". ")
			if len(parts) >= 2 {
				answer = strings.TrimSpace(strings.Join(parts[:2], ""))
			}
		}
		if !quoteInSource(answer, chunk.Text) {
			return Result{}, false
		}
		return Result{Answer: answer, Sources: []CitedSource{{ID: id, Title: chunk.Title, Quote: answer, Link: chunk.Link}}, Cacheable: true, ToolsUsed: []string{"search_knowledge(exact_question)"}}, true
	}
	return Result{}, false
}
