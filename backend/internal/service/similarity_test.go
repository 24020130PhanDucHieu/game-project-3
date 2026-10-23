package service

import "testing"

const original = `def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    history = game_state.get("history", [])
    counter = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    if history:
        last = history[-1].get("opponent_move")
        pick = counter.get(last)
        if pick and cards.get(pick, 0) > 0:
            return pick
    best = max(cards, key=lambda c: cards[c])
    for c in ("ROCK", "PAPER", "SCISSORS"):
        if cards.get(c, 0) > 0 and c != best:
            return c
    return best
`

// Đổi tên biến, thêm chú thích, đổi chuỗi và khoảng trắng — vẫn là cùng một bài.
const renamed = `# bot của đội tôi, viết hoàn toàn độc lập :)
def decide_move(s):
    """chiến thuật phản đòn"""
    hand = s.get("remaining_cards", {})   # quân còn lại
    past = s.get("history", [])
    beat = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    if past:
        prev = past[-1].get("opponent_move")
        choice = beat.get(prev)
        if choice and hand.get(choice, 0) > 0:
            return choice
    top = max(hand, key=lambda x: hand[x])
    for x in ("ROCK", "PAPER", "SCISSORS"):
        if hand.get(x, 0) > 0 and x != top:
            return x
    return top
`

const different = `import random

def decide_move(state):
    turn = state.get("turn_number", 1)
    cards = state.get("remaining_cards", {})
    available = [c for c, n in cards.items() if n > 0]
    if not available:
        return "ROCK"
    if turn % 3 == 0 and "SCISSORS" in available:
        return "SCISSORS"
    while True:
        pick = random.choice(available)
        if pick != "PAPER" or len(available) == 1:
            return pick
`

func TestSimilarityCatchesRenamedCopyButNotDifferentBot(t *testing.T) {
	docs := []SimilarityDoc{
		{ID: "A", Code: original, Language: "PYTHON"},
		{ID: "B", Code: renamed, Language: "PYTHON"},
		{ID: "C", Code: different, Language: "PYTHON"},
	}
	pairs := CompareAll(docs, 0, 10)
	score := map[string]float64{}
	for _, p := range pairs {
		score[p.A+p.B] = p.Score
	}
	if score["AB"] < 0.9 {
		t.Fatalf("renamed copy should score >= 0.9, got %v (%v)", score["AB"], pairs)
	}
	if score["AC"] > 0.3 || score["BC"] > 0.3 {
		t.Fatalf("different bots should score < 0.3, got AC=%v BC=%v", score["AC"], score["BC"])
	}
}

func TestSimilarityIgnoresSharedTemplate(t *testing.T) {
	template := "def decide_move(game_state):\n    cards = game_state.get(\"remaining_cards\", {})\n    for card in (\"ROCK\", \"PAPER\", \"SCISSORS\"):\n        if cards.get(card, 0) > 0:\n            return card\n    return \"ROCK\"\n"
	docs := []SimilarityDoc{}
	for _, id := range []string{"t1", "t2", "t3", "t4", "t5", "t6"} {
		docs = append(docs, SimilarityDoc{ID: id, Code: template, Language: "PYTHON"})
	}
	if pairs := CompareAll(docs, 0.5, 50); len(pairs) != 0 {
		t.Fatalf("an unchanged official template shared by many teams must not raise alarms: %v", pairs)
	}
}

func TestSimilarityCpp(t *testing.T) {
	a := "#include <iostream>\nint main(){ std::string s; std::getline(std::cin, s); int x = 0; for (int i=0;i<3;i++) x += i; if (x > 2) std::cout << \"ROCK\"; else std::cout << \"PAPER\"; return 0; }"
	b := "#include <iostream>\n// sao chép\nint main(){ std::string input; std::getline(std::cin, input); int total = 0; for (int k=0;k<3;k++) total += k; if (total > 2) std::cout << \"ROCK\"; else std::cout << \"PAPER\"; return 0; }"
	pairs := CompareAll([]SimilarityDoc{{ID: "a", Code: a, Language: "CPP"}, {ID: "b", Code: b, Language: "CPP"}}, 0, 5)
	if len(pairs) != 1 || pairs[0].Score < 0.9 {
		t.Fatalf("renamed C++ copy not detected: %v", pairs)
	}
}
