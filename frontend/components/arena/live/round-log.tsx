'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Flag, Handshake, Info, ListTree, Orbit, ScrollText, Skull, Sparkles, Swords, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIECE_LABEL, PieceIcon } from './piece-icons'

type Side = 'red' | 'blue'
type Kind = 'move' | 'capture' | 'draw' | 'special' | 'pass' | 'win' | 'system' | 'info'
type Entry = { key: number; kind: Kind; side?: Side; text: string; piece?: string; target?: string; cell?: string; special?: 'warp' | 'trap' | 'evolve'; tag?: string; step?: number; time?: string }

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]️?\s*/gu
const SIDE = (name: string): Side => (/đỏ/i.test(name) ? 'red' : 'blue')

/** Phân loại một dòng nhật ký của engine thành sự kiện có cấu trúc để hiển thị đẹp. */
export function parseLog(lines: unknown[]): Entry[] {
  let step = 0
  const parsed = lines.map((raw, key): Entry => {
    const line = (typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(EMOJI, '').trim()
    const stamped = /^\[(\d{2}:\d{2}:\d{2})\]\s*\[([^\]]+)\]\s*(.*)$/.exec(line)
    if (stamped) {
      const win = /thắng/i.test(stamped[2]) || /^Kết Quả/i.test(stamped[2])
      return { key, kind: win ? 'win' : 'system', time: stamped[1], tag: stamped[2], text: stamped[3] } as Entry
    }
    const move = /^Đội (Đỏ|Xanh) điều quân \((\w+)\) tới \[(\d+),\s*(\d+)\]/.exec(line)
    if (move) return { key, kind: 'move', side: SIDE(move[1]), piece: move[2], cell: `${move[3]},${move[4]}`, step: ++step, text: line }
    const cap = /^Đội (Đỏ|Xanh) \((\w+)\) thắng va chạm với \((\w+)\) tại \[(\d+),\s*(\d+)\]/.exec(line)
    if (cap) return { key, kind: 'capture', side: SIDE(cap[1]), piece: cap[2], target: cap[3], cell: `${cap[4]},${cap[5]}`, step: ++step, text: line }
    const draw = /^Quân \((\w+)\) của Đội (Đỏ|Xanh) gặp quân cùng loại tại \[(\d+),\s*(\d+)\]/.exec(line)
    if (draw) return { key, kind: 'draw', side: SIDE(draw[2]), piece: draw[1], cell: `${draw[3]},${draw[4]}`, step: ++step, text: line }
    if (/Cổng Dịch Chuyển/i.test(line)) return { key, kind: 'special', special: 'warp', side: /Đội (Đỏ|Xanh)/.exec(line) ? SIDE(/Đội (Đỏ|Xanh)/.exec(line)![1]) : undefined, step: ++step, text: line.replace(/^\[[^\]]+\]\s*/, '') }
    if (/BẪY|bẫy/.test(line)) return { key, kind: 'special', special: 'trap', step: ++step, text: line.replace(/^\[[^\]]+\]\s*/, '') }
    if (/Tiến Hóa/i.test(line)) return { key, kind: 'special', special: 'evolve', step: ++step, text: line.replace(/^\[[^\]]+\]\s*/, '') }
    if (/không có ô di chuyển hợp lệ/i.test(line)) return { key, kind: 'pass', side: SIDE(/Đội (Đỏ|Xanh)/.exec(line)?.[1] || 'Đỏ'), step: ++step, text: line }
    if (/^Đi lần lượt/i.test(line)) return { key, kind: 'system', tag: 'Luật trận', text: line }
    if (/thắng:|chiếm căn cứ|quét sạch/i.test(line)) return { key, kind: 'win', text: line }
    return { key, kind: 'info', text: line }
  })
  // Kết quả hiệp luôn nằm cuối nhật ký, sau các nước đi.
  return [...parsed.filter((e) => e.kind !== 'win'), ...parsed.filter((e) => e.kind === 'win')]
}

const FILTERS: { id: 'all' | 'red' | 'blue' | 'clash' | 'event'; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'red', label: 'Đội Đỏ' }, { id: 'blue', label: 'Đội Xanh' }, { id: 'clash', label: 'Va chạm' }, { id: 'event', label: 'Sự kiện' },
]

function PieceChip({ type, side }: { type?: string; side?: Side }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 align-middle text-[11px] font-bold text-white shadow-sm',
      side === 'red' ? 'bg-red-500' : side === 'blue' ? 'bg-blue-500' : 'bg-slate-500')}>
      <PieceIcon type={type} className="size-3.5" strokeWidth={2.4} />{PIECE_LABEL[type || ''] || type}
    </span>
  )
}
const Cell = ({ at }: { at?: string }) => at ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">({at})</code> : null
const Who = ({ side, red, blue }: { side?: Side; red: string; blue: string }) => <strong className={side === 'red' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}>{side === 'red' ? red : blue}</strong>

function Row({ e, red, blue }: { e: Entry; red: string; blue: string }) {
  let tone = e.side === 'red' ? 'bg-red-500 text-white' : e.side === 'blue' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'
  let icon: ReactNode = <Info className="size-3.5" />
  let body: ReactNode = e.text
  let accent = ''
  switch (e.kind) {
    case 'move':
      icon = <ArrowRight className="size-3.5" />
      body = <><Who side={e.side} red={red} blue={blue} /> điều <PieceChip type={e.piece} side={e.side} /> tới ô <Cell at={e.cell} /></>
      break
    case 'capture':
      icon = <Swords className="size-3.5" />
      accent = e.side === 'red' ? 'border-l-red-500 bg-red-500/[0.06]' : 'border-l-blue-500 bg-blue-500/[0.06]'
      body = <><Who side={e.side} red={red} blue={blue} /> <PieceChip type={e.piece} side={e.side} /> <span className="font-semibold">thắng</span> <PieceChip type={e.target} side={e.side === 'red' ? 'blue' : 'red'} /> tại <Cell at={e.cell} /></>
      break
    case 'draw':
      icon = <Handshake className="size-3.5" />
      body = <>Hai quân <PieceChip type={e.piece} side={e.side} /> cùng loại gặp nhau tại <Cell at={e.cell} />: <span className="font-semibold">hòa</span>, quân tấn công lùi về</>
      break
    case 'special':
      icon = e.special === 'warp' ? <Orbit className="size-3.5" /> : e.special === 'trap' ? <Skull className="size-3.5" /> : <Sparkles className="size-3.5" />
      tone = e.special === 'warp' ? 'bg-violet-500 text-white' : e.special === 'trap' ? 'bg-rose-600 text-white' : 'bg-emerald-500 text-white'
      accent = 'border-l-violet-400 bg-violet-500/[0.07]'
      body = <>{e.text}</>
      break
    case 'pass':
      icon = <Zap className="size-3.5" />
      body = <span className="text-muted-foreground"><Who side={e.side} red={red} blue={blue} /> không có nước đi hợp lệ, bỏ lượt</span>
      break
    case 'win':
      icon = <Trophy className="size-3.5" />
      tone = 'bg-amber-500 text-white'
      accent = 'border-l-amber-400 bg-amber-500/10'
      body = <span className="font-semibold">{e.text}</span>
      break
    case 'system':
      icon = <Flag className="size-3.5" />
      tone = 'bg-primary/15 text-primary'
      body = <><span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{e.tag}</span>{e.text}</>
      break
    default:
      body = <span className="text-muted-foreground">{e.text}</span>
  }
  return (
    <li className={cn('relative flex items-start gap-3 border-l-2 border-transparent py-1.5 pl-3 pr-2', accent)}>
      <span className={cn('relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-card', tone)}>{icon}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">{body}</div>
      <span className="mt-1 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground/70">{e.step ? `#${e.step}` : e.time || ''}</span>
    </li>
  )
}

/**
 * Nhật ký hiệp dạng dòng thời gian: mỗi nước đi/va chạm/sự kiện là một dòng có biểu tượng quân, màu đội và ô cờ;
 * lọc theo đội, va chạm, sự kiện; có tóm tắt số nước, số quân bị ăn và sự kiện đặc biệt.
 */
export function RoundLog({ logs, redName = 'Đội Đỏ', blueName = 'Đội Xanh', defaultOpen = true, maxHeight = 'max-h-96' }: { logs: unknown[]; redName?: string; blueName?: string; defaultOpen?: boolean; maxHeight?: string }) {
  const entries = useMemo(() => parseLog(logs), [logs])
  const [open, setOpen] = useState(defaultOpen)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const stats = useMemo(() => ({
    moves: entries.filter((e) => e.kind === 'move' || e.kind === 'capture' || e.kind === 'draw').length,
    red: entries.filter((e) => e.kind === 'capture' && e.side === 'red').length,
    blue: entries.filter((e) => e.kind === 'capture' && e.side === 'blue').length,
    special: entries.filter((e) => e.kind === 'special').length,
  }), [entries])
  const shown = entries.filter((e) => {
    if (filter === 'all') return true
    if (filter === 'red' || filter === 'blue') return e.side === filter
    if (filter === 'clash') return e.kind === 'capture' || e.kind === 'draw'
    return e.kind === 'special' || e.kind === 'win' || e.kind === 'system'
  })
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm" aria-label="Nhật ký hiệp">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 bg-gradient-to-r from-primary/[0.08] to-transparent px-4 py-3 text-left">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><ScrollText className="size-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Nhật ký hiệp</span><span className="block text-xs text-muted-foreground">{entries.length} dòng · {stats.moves} nước đi</span></span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="grid grid-cols-3 gap-px bg-border text-center text-xs">
            {[[`${redName} ăn`, stats.red, 'text-red-600 dark:text-red-400'], [`${blueName} ăn`, stats.blue, 'text-blue-600 dark:text-blue-400'], ['Sự kiện đặc biệt', stats.special, 'text-violet-600 dark:text-violet-400']].map(([label, value, color]) => (
              <div key={String(label)} className="bg-card px-2 py-2"><p className={cn('font-display text-lg font-extrabold tabular-nums', String(color))}>{value}</p><p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pt-3" role="tablist" aria-label="Lọc nhật ký">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground')}>{f.label}</button>
            ))}
          </div>
          <ol className={cn('relative mt-2 overflow-y-auto px-3 pb-3', maxHeight)}>
            <span className="pointer-events-none absolute bottom-3 left-[1.6rem] top-3 w-px bg-border" aria-hidden />
            {shown.length ? shown.map((e) => <Row key={e.key} e={e} red={redName} blue={blueName} />) : (
              <li className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><ListTree className="size-4" />Không có dòng nào khớp bộ lọc.</li>
            )}
          </ol>
        </div>
      )}
    </section>
  )
}
