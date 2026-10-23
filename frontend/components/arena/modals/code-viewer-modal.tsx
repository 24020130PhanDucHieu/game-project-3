'use client'

import { CodeBlock, Modal, Pill } from '../primitives'

export function CodeViewerModal({
  open,
  onClose,
  title = 'Mã Nguồn Đã Khóa',
  meta = 'Round 1 · Khóa lúc 14:02:15 23/10/2026',
  teamName = 'Đội Cú Đêm K69',
  lang = 'Python 3.10',
  status = 'VALID',
  code = `def decide_move(game_state):
    """
    Thuật toán chiến thuật Oẳn Tù Tì V2 trên bàn cờ 9x9.
    Ưu tiên:
    1. Ăn quân địch nếu thắng tương khắc
    2. Đột kích căn cứ đối phương tại [8, 0] hoặc [0, 8]
    3. Tránh va chạm với quân khắc chế
    """
    my_pieces = game_state.get("my_pieces", [])
    opp_pieces = game_state.get("opponent_pieces", [])
    
    # Duyệt tìm quân có thể tấn công an toàn
    for p in my_pieces:
        r, c, weapon = p["row"], p["col"], p["weapon"]
        for opp in opp_pieces:
            dist = abs(opp["row"] - r) + abs(opp["col"] - c)
            if dist == 1:
                # Kiểm tra khắc chế Búa > Kéo > Bao > Búa
                if (weapon == "ROCK" and opp["weapon"] == "SCISSORS") or \\
                   (weapon == "SCISSORS" and opp["weapon"] == "PAPER") or \\
                   (weapon == "PAPER" and opp["weapon"] == "ROCK"):
                    return {"piece_id": p["id"], "target": [opp["row"], opp["col"]]}

    # Nếu không có va chạm nguy hiểm, tiến quân về căn cứ
    first = my_pieces[0] if my_pieces else None
    if first:
        return {"piece_id": first["id"], "target": [first["row"] - 1, first["col"]]}

    return {"weapon": "ROCK"}
`,
}: {
  open: boolean
  onClose: () => void
  title?: string
  meta?: string
  teamName?: string
  lang?: string
  status?: string
  code?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={meta} size="lg">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Đội nộp:</span>
            <strong>{teamName}</strong>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-muted-foreground">{lang}</span>
            <Pill tone={status === 'VALID' ? 'success' : 'warning'} dot>
              {status === 'VALID' ? 'Hợp lệ (Sandbox Passed)' : status}
            </Pill>
          </div>
        </div>

        <CodeBlock code={code} title={`source.${lang.toLowerCase().includes('py') ? 'py' : 'cpp'}`} />
      </div>
    </Modal>
  )
}
