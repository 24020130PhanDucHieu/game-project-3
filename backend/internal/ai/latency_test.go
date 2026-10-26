package ai

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestPrefetchedKnowledgeAllowsOneModelCall(t *testing.T) {
	m := &scripted{turns: []Response{turn(submit("Bàn cờ có kích thước 9×9.", false, [2]string{boardID, boardQuote}))}}
	a := newAgent(t, m)
	a.PrefetchKnowledge = true
	res, err := a.Ask(context.Background(), "bàn cờ bao nhiêu ô", Identity{Role: "TEAM", StudentID: "A1"})
	if err != nil || res.NeedsHuman || len(res.Sources) != 1 || !res.Cacheable || len(m.got) != 1 {
		t.Fatalf("tra trước phải cho phép trả lời có nguồn trong một lượt: %+v err=%v calls=%d", res, err, len(m.got))
	}
	var input struct {
		Question  string     `json:"question"`
		Knowledge toolResult `json:"preloaded_knowledge"`
	}
	if json.Unmarshal([]byte(m.got[0].Messages[0].Content.(string)), &input) != nil || input.Question != "bàn cờ bao nhiêu ô" || len(input.Knowledge.Sources) == 0 {
		t.Fatalf("model phải nhận câu hỏi và nguồn thật đã tìm: %+v", input)
	}
}

func TestPrefetchStillRejectsFabricatedSourcesAndNumbers(t *testing.T) {
	for _, answer := range []Block{
		submit("Bàn cờ 20×20.", false, [2]string{boardID, boardQuote}),
		submit("Bàn cờ 9×9.", false, [2]string{"kb:invented", boardQuote}),
	} {
		m := &scripted{turns: []Response{turn(answer)}}
		a := newAgent(t, m)
		a.PrefetchKnowledge = true
		res, err := a.Ask(context.Background(), "bàn cờ bao nhiêu ô", Identity{Role: "TEAM"})
		if err != nil || !res.NeedsHuman || res.Cacheable {
			t.Fatalf("tra trước không được bỏ kiểm chứng: %+v err=%v", res, err)
		}
	}
}

func TestCanceledQuestionDoesNotCallModel(t *testing.T) {
	m := &scripted{}
	a := newAgent(t, m)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := a.Ask(ctx, "bàn cờ", Identity{Role: "TEAM"})
	if !errors.Is(err, context.Canceled) || len(m.got) != 0 {
		t.Fatalf("yêu cầu hủy không được gọi model: err=%v calls=%d", err, len(m.got))
	}
}
