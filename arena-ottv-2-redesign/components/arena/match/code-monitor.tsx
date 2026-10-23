'use client'

import { Code2 } from 'lucide-react'
import { Card, CodeBlock, Pill } from '../primitives'

export function CodeMonitor({
  teamAName = 'Đội Đỏ',
  teamBName = 'Đội Xanh',
  teamALang = 'Python 3.10',
  teamBLang = 'C++ 17',
  codeA = `def decide_move(game_state):
    # Chiếm lĩnh trung lộ và phòng thủ căn cứ
    pieces = game_state.get("my_pieces", [])
    return {"piece_id": pieces[0]["id"], "action": "MOVE_FORWARD"}`,
  codeB = `#include <iostream>
int main() {
    // Thuật toán phản đòn tự động
    std::cout << "MOVE 1 4 2 4" << std::endl;
    return 0;
}`,
}: {
  teamAName?: string
  teamBName?: string
  teamALang?: string
  teamBLang?: string
  codeA?: string
  codeB?: string
}) {
  return (
    <details className="group rounded-xl border border-border bg-card p-4 transition">
      <summary className="flex cursor-pointer items-center justify-between font-semibold text-foreground text-sm">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-primary" />
          <span>Mã Lệnh Hai Đội — Giám Sát Trực Tiếp (Admin Live Monitor)</span>
        </div>
        <Pill tone="primary" className="text-[11px]">
          Thời gian thực
        </Pill>
      </summary>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <strong className="text-team-red">{teamAName}</strong>
            <span className="font-mono text-muted-foreground">{teamALang}</span>
          </div>
          <CodeBlock code={codeA} title={`${teamAName} - Bot Source`} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <strong className="text-team-blue">{teamBName}</strong>
            <span className="font-mono text-muted-foreground">{teamBLang}</span>
          </div>
          <CodeBlock code={codeB} title={`${teamBName} - Bot Source`} />
        </div>
      </div>
    </details>
  )
}
