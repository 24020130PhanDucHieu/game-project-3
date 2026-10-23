'use client'

import { useMemo, useState } from 'react'
import { Bug, Check, Copy, GitCompare } from 'lucide-react'
import { diffLines, diffStats } from '@/lib/diff'
import { decodeRule, rulesMask } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Button, EmptyState } from './ui'
import { BASES } from './board-themes'

/** Dựng game_state mẫu mà bot phía Đỏ nhận ở lượt đầu — giúp đội hiểu dữ liệu đầu vào. */
export function sampleGameState(step: any, ruleId?: string) {
  if (!step) return null
  const mask = rulesMask(ruleId)
  const fog = !!(mask & 4)
  const mine = (step.red_pieces || []).filter((p: any) => p.alive !== false)
  const theirs = (step.blue_pieces || []).filter((p: any) => p.alive !== false)
  const cards: Record<string, number> = { ROCK: 0, PAPER: 0, SCISSORS: 0 }
  mine.forEach((p: any) => { if (p.type in cards) cards[p.type]++ })
  return {
    my_hp: 100,
    remaining_cards: cards,
    turn_number: 1,
    ply_number: 1,
    active_side: 'team_a',
    history: [],
    my_pieces: mine.map((p: any) => ({ id: p.id, col: p.col, row: p.row, type: p.type, alive: true })),
    opponent_pieces: theirs.map((p: any) => (fog ? { id: p.id, col: p.col, row: p.row, alive: true } : { id: p.id, col: p.col, row: p.row, type: p.type, alive: true })),
    target: [BASES.blue.col, BASES.blue.row],
    reverse_rule: !!(mask & 2),
    obstacles: step.obstacles || [],
    rules: { id: ruleId || 'STAGE_1_STANDARD', fog, shuffle: !!(mask & 1), reverse: !!(mask & 2), board_size: 9 },
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500) }) }}>
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done ? 'Đã chép' : 'Chép'}
    </Button>
  )
}

/** Bảng gỡ lỗi sau mỗi lần đấu thử: lỗi bot, game_state mẫu, các nước của bot mình. */
export function DebugPanel({ steps, ruleId, botError }: { steps: any[]; ruleId?: string; botError?: string | null }) {
  const [tab, setTab] = useState<'moves' | 'state'>(botError ? 'moves' : 'moves')
  const state = useMemo(() => sampleGameState(steps?.[0], ruleId), [steps, ruleId])
  const myMoves = useMemo(() => (steps || []).filter((s) => s.active_side === 'team_a'), [steps])
  const json = JSON.stringify(state, null, 2)
  const rules = [...decodeRule(ruleId).active]
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Bug className="size-4 text-primary" />Gỡ lỗi bot</p>
        <div className="flex gap-1">
          {(['moves', 'state'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold', tab === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {t === 'moves' ? `Nước của bot (${myMoves.length})` : 'game_state mẫu'}
            </button>
          ))}
        </div>
      </div>
      {botError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300">⚠ Bot lỗi: {botError}</div>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">✓ Bot chạy không lỗi trong trận này{rules.length ? ` · luật: ${rules.join(', ')}` : ''}.</p>
      )}
      {tab === 'moves' ? (
        myMoves.length ? (
          <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
            {myMoves.map((s, i) => (
              <li key={i} className="flex gap-2 rounded-md px-2 py-1 odd:bg-muted/50">
                <span className="w-10 shrink-0 font-mono text-muted-foreground">#{s.step_idx}</span>
                <span className="min-w-0 flex-1">{s.log}</span>
                {s.clash_event?.type && <Badge tone="warning">{s.clash_event.type}</Badge>}
              </li>
            ))}
          </ol>
        ) : <EmptyState title="Bot chưa đi nước nào" hint="Có thể bot lỗi ngay ở lượt đầu — xem thông báo lỗi phía trên." />
      ) : (
        <div className="relative">
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{json}</pre>
          <div className="absolute right-2 top-2"><CopyButton text={json} /></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Đây là dữ liệu bot phía Đỏ nhận ở lượt đầu (dựng lại từ replay). Bot của bạn chỉ cần trả về ROCK / PAPER / SCISSORS.</p>
        </div>
      )}
    </div>
  )
}

/** So sánh hai phiên bản mã nguồn theo dòng. */
export function DiffViewer({ left, right }: { left: { label: string; code: string }; right: { label: string; code: string } }) {
  const lines = useMemo(() => diffLines(left.code || '', right.code || ''), [left.code, right.code])
  const stats = diffStats(lines)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const visible = onlyChanges ? lines.filter((l, i) => l.kind !== 'same' || lines.slice(Math.max(0, i - 2), i + 3).some((x) => x.kind !== 'same')) : lines
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-semibold"><GitCompare className="size-4 text-primary" />{left.label} → {right.label}</span>
        <span className="flex items-center gap-2">
          <Badge tone="success">+{stats.added}</Badge><Badge tone="danger">−{stats.removed}</Badge>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-primary" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />Chỉ phần thay đổi</label>
        </span>
      </div>
      {stats.added + stats.removed === 0 ? <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Hai phiên bản giống hệt nhau.</p> : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border bg-background font-mono text-[12px] leading-relaxed">
          {visible.map((l, i) => (
            <div key={i} className={cn('flex', l.kind === 'add' && 'bg-emerald-500/12', l.kind === 'del' && 'bg-red-500/12')}>
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/70">{l.left ?? ''}</span>
              <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/70">{l.right ?? ''}</span>
              <span className={cn('w-4 shrink-0 select-none text-center', l.kind === 'add' ? 'text-emerald-600' : l.kind === 'del' ? 'text-red-600' : 'text-transparent')}>{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
              <span className="whitespace-pre pr-3">{l.text || ' '}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Biểu đồ đường SVG thuần (không thêm thư viện), dùng cho ELO theo lượt. */
export function LineChart({ points, height = 140, label }: { points: { x: string; y: number }[]; height?: number; label: string }) {
  if (points.length < 2) return <EmptyState title="Chưa đủ dữ liệu để vẽ biểu đồ" hint="Cần ít nhất hai lượt đã chấm." />
  const w = 560
  const pad = 28
  const ys = points.map((p) => p.y)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = Math.max(1, max - min)
  const sx = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1)
  const sy = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${d} L${sx(points.length - 1)},${height - pad} L${sx(0)},${height - pad} Z`
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label}>
        <defs><linearGradient id="elo-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}><line x1={pad} x2={w - pad} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeDasharray="3 4" /><text x={4} y={sy(v) + 4} fontSize="10" fill="var(--muted-foreground)">{Math.round(v)}</text></g>
        ))}
        <path d={area} fill="url(#elo-fill)" />
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3.5" fill="var(--card)" stroke="var(--primary)" strokeWidth="2"><title>{`${p.x}: ${p.y.toFixed(1)}`}</title></circle>)}
        {points.map((p, i) => (points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && <text key={`t${i}`} x={sx(i)} y={height - 8} fontSize="10" textAnchor="middle" fill="var(--muted-foreground)">{p.x}</text>)}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}

/** Thanh tỉ lệ đơn giản cho thống kê thắng/thua theo nhóm. */
export function RatioBars({ rows }: { rows: { label: string; wins: number; total: number }[] }) {
  if (!rows.length) return <EmptyState title="Chưa có dữ liệu" />
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = r.total ? Math.round((r.wins / r.total) * 100) : 0
        return (
          <li key={r.label} className="text-xs">
            <div className="mb-1 flex justify-between gap-2"><span className="min-w-0 truncate font-medium">{r.label}</span><span className="tabular-nums text-muted-foreground">{r.wins}/{r.total} · {pct}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ width: `${pct}%` }} /></div>
          </li>
        )
      })}
    </ul>
  )
}
