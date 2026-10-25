/** Mô hình mẫu cho Giải AI. Chỉ đọc game_state["history"], nên chạy được cả ở vòng loại AI lẫn trận bàn cờ thật. */

export const FREQ_TEMPLATE = `# Mô hình mẫu 1 — đếm tần suất.
# Ý tưởng: đối thủ hay ra nước nào nhất thì ta ra nước thắng nước đó.
# Lưu ý: mỗi lần được gọi, bot chạy trong một phạm vi MỚI (không nhớ biến cũ),
# nên mọi thông tin phải suy ra từ game_state["history"].

BEATS = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}


def decide_move(game_state):
    history = game_state.get("history", [])
    seen = [h.get("opponent_move") for h in history if h.get("opponent_move")]
    if len(seen) < 3:
        return "ROCK"
    counts = {}
    for move in seen:
        counts[move] = counts.get(move, 0) + 1
    most_common = max(counts, key=lambda m: counts[m])
    return BEATS[most_common]
`

export const MARKOV_TEMPLATE = `# Mô hình mẫu 2 — bảng đếm theo ngữ cảnh (Markov) có lùi dần.
# Ý tưởng: đối thủ thường ra nước gì SAU KHI (nước vừa rồi của họ, nước vừa rồi của ta) là một cặp cụ thể?
# Nếu ngữ cảnh dài chưa đủ dữ liệu thì lùi về ngữ cảnh ngắn hơn, rồi về tần suất chung.
import random

BEATS = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
MOVES = ("ROCK", "PAPER", "SCISSORS")


def predict(history):
    """Dự đoán nước kế tiếp của đối thủ, hoặc None nếu chưa đủ dữ liệu."""
    opp = [h.get("opponent_move") for h in history if h.get("opponent_move")]
    me = [h.get("my_move") for h in history if h.get("opponent_move")]
    if len(opp) < 4:
        return None
    table2, table1, total = {}, {}, {}
    for i in range(1, len(opp)):
        k2, k1 = (opp[i - 1], me[i - 1]), opp[i - 1]
        table2.setdefault(k2, {})
        table2[k2][opp[i]] = table2[k2].get(opp[i], 0) + 1
        table1.setdefault(k1, {})
        table1[k1][opp[i]] = table1[k1].get(opp[i], 0) + 1
        total[opp[i]] = total.get(opp[i], 0) + 1
    for table, key in ((table2, (opp[-1], me[-1])), (table1, opp[-1])):
        counts = table.get(key)
        if counts and sum(counts.values()) >= 3:
            return max(counts, key=lambda m: counts[m])
    return max(total, key=lambda m: total[m])


def decide_move(game_state):
    guess = predict(game_state.get("history", []))
    if guess is None:
        return random.choice(MOVES)
    return BEATS[guess]
`

export const AI_TEMPLATES = [
  { id: 'freq', label: 'Mẫu 1: đếm tần suất', code: FREQ_TEMPLATE },
  { id: 'markov', label: 'Mẫu 2: Markov có lùi dần', code: MARKOV_TEMPLATE },
]
