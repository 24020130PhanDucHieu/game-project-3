"""Mã hóa gọn một thế cờ thành dict nhỏ (khoảng 130 byte) để gửi cho `solve(task)`.

Khóa ngắn để tiết kiệm bộ nhớ và băng thông:
  b  chuỗi 81 ký tự (hàng trước, 9 ô mỗi hàng): quân của bên đi in HOA (R P S J), quân đối thủ in thường (r p s j) hoặc ? khi bị sương mù che,
     # là vật cản, . là ô trống. Ô (cột c, hàng r) ở vị trí r*9 + c.
  s  bên đi: 0 = Đỏ (đi lên hàng 0, căn cứ đích ở (8,0)), 1 = Xanh (căn cứ đích ở (0,8))
  t  số lượt (turn) hiện tại
  c  số quân mỗi loại của bên đi [Búa, Giấy, Kéo]
  e  số quân mỗi loại của đối thủ [Búa, Giấy, Kéo], hoặc null khi bị sương mù
  h  các lá bài gần nhất của bên đi (tối đa 4, ví dụ "RPS"), g  lá bài gần nhất của đối thủ ("" khi bị sương mù)
"""
LETTER = {"ROCK": "R", "PAPER": "P", "SCISSORS": "S", "JOKER": "J"}
CARD_OF = {"R": "ROCK", "P": "PAPER", "S": "SCISSORS"}
CARD_INDEX = {"R": 0, "P": 1, "S": 2}
SIZE = 9


def encode(state, card=None):
    grid = ["."] * (SIZE * SIZE)
    for col, row in state.get("obstacles", []):
        grid[row * SIZE + col] = "#"
    counts = {"ROCK": 0, "PAPER": 0, "SCISSORS": 0}
    for piece in state["my_pieces"]:
        if piece.get("alive", True):
            grid[piece["row"] * SIZE + piece["col"]] = LETTER.get(piece["type"], "?")
            if piece["type"] in counts:
                counts[piece["type"]] += 1
    enemy = {"ROCK": 0, "PAPER": 0, "SCISSORS": 0}
    fogged = False
    for piece in state["opponent_pieces"]:
        if not piece.get("alive", True):
            continue
        kind = piece.get("type")
        if kind is None:
            fogged = True
            grid[piece["row"] * SIZE + piece["col"]] = "?"
        else:
            grid[piece["row"] * SIZE + piece["col"]] = LETTER.get(kind, "?").lower()
            if kind in enemy:
                enemy[kind] += 1
    history = state.get("history", [])[-4:]
    sample = {
        "b": "".join(grid),
        "s": 1 if state.get("active_side") == "team_b" else 0,
        "t": state.get("turn_number", 1),
        "c": [counts["ROCK"], counts["PAPER"], counts["SCISSORS"]],
        "e": None if fogged else [enemy["ROCK"], enemy["PAPER"], enemy["SCISSORS"]],
        "h": "".join(LETTER[h["my_move"]] for h in history if h.get("my_move") in LETTER),
        "g": "" if fogged else "".join(LETTER[h["opponent_move"]] for h in history if h.get("opponent_move") in LETTER),
    }
    if card is not None:
        sample["m"] = LETTER[card]
    return sample
