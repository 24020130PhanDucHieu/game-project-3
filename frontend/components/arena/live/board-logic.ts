/** Logic xem bàn cờ dùng chung cho 2D và 3D: tìm quân, ô có thể đi, đường đã đi. Khớp luật di chuyển của engine (board.py). */
export type Cell = [number, number] // [col, row]
export type Side = 'red' | 'blue'
export type PieceInfo = { id: string; side: Side; type: string; col: number; row: number; alive: boolean; steps_left?: number }
export type Highlight = { moves: Cell[]; attacks: Cell[]; path: Cell[] }

export const NO_HIGHLIGHT: Highlight = { moves: [], attacks: [], path: [] }

const BEATS: Record<string, string> = { ROCK: 'SCISSORS', SCISSORS: 'PAPER', PAPER: 'ROCK' }

export function asCells(list: any): Cell[] {
  const out: Cell[] = []
  const walk = (v: any) => {
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') out.push([v[0], v[1]])
    else if (Array.isArray(v)) v.forEach(walk)
  }
  walk(list)
  return out
}

export function findPiece(step: any, id: string | null | undefined): PieceInfo | null {
  if (!id || !step) return null
  for (const [list, side] of [[step.red_pieces, 'red'], [step.blue_pieces, 'blue']] as const) {
    const p = (list || []).find((x: any) => x.id === id)
    if (p) return { id: p.id, side, type: p.type || '?', col: p.col, row: p.row, alive: p.alive !== false, steps_left: p.steps_left }
  }
  return null
}

/** Ô đi được và ô tấn công được ở lượt kế tiếp, theo cách engine chọn nước. */
export function reachable(step: any, piece: PieceInfo | null, reverse = false): { moves: Cell[]; attacks: Cell[] } {
  if (!piece || !piece.alive) return { moves: [], attacks: [] }
  const walls = new Set(asCells(step?.obstacles || step?.mystery_tiles?.obstacles).map(([c, r]) => `${c}:${r}`))
  const own = (piece.side === 'red' ? step?.red_pieces : step?.blue_pieces) || []
  const enemy = (piece.side === 'red' ? step?.blue_pieces : step?.red_pieces) || []
  const occupied = new Set(own.filter((p: any) => p.alive !== false && p.id !== piece.id).map((p: any) => `${p.col}:${p.row}`))
  const dir = piece.side === 'red' ? -1 : 1
  const hor = piece.side === 'red' ? 1 : -1
  const moves = ([[piece.col, piece.row + dir], [piece.col + hor, piece.row], [piece.col + hor, piece.row + dir]] as Cell[])
    .filter(([c, r]) => c >= 0 && c < 9 && r >= 0 && r < 9 && !walls.has(`${c}:${r}`) && !occupied.has(`${c}:${r}`))
  const wins = (a: string, b: string) => (reverse ? BEATS[b] === a : BEATS[a] === b)
  const attacks: Cell[] = enemy
    .filter((p: any) => p.alive !== false && Math.max(Math.abs(p.col - piece.col), Math.abs(p.row - piece.row)) === 1 && !walls.has(`${p.col}:${p.row}`) && (piece.type === 'JOKER' || (p.type && p.type !== '?' && wins(piece.type, p.type))))
    .map((p: any) => [p.col, p.row] as Cell)
  return { moves: moves.filter(([c, r]) => !attacks.some(([ac, ar]) => ac === c && ar === r)), attacks }
}

/** Đường đi của một quân qua các bước đã phát (bỏ các vị trí lặp liên tiếp). */
export function pathOf(history: any[] | undefined, id: string | null | undefined): Cell[] {
  if (!history || !id) return []
  const out: Cell[] = []
  for (const s of history) {
    const p = findPiece(s, id)
    if (!p) continue
    const last = out[out.length - 1]
    if (!last || last[0] !== p.col || last[1] !== p.row) out.push([p.col, p.row])
    if (!p.alive) break
  }
  return out
}

export function highlightFor(step: any, history: any[] | undefined, id: string | null | undefined, reverse = false): Highlight {
  const piece = findPiece(step, id)
  if (!piece) return NO_HIGHLIGHT
  return { ...reachable(step, piece, reverse), path: pathOf(history, id) }
}
