'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, Clock, Sparkles, Target, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCountUp, useReducedMotion } from '@/lib/motion'
import { useModalLayer } from '@/lib/scroll-lock'
import type { TaskCheckResult } from '@/lib/offline-engine'
import { Button, ProgressRing, Tabs } from '../../ui'
import { Board } from '../../board'
import { BOARD_THEMES } from '../../board-themes'
import { PIECE_LABEL } from '../../piece-icons'
import { fmt } from './common'
import { PredictionStage } from './prediction-stage'

/** Dữ liệu cần để vẽ hình minh họa, lấy từ đề đã tải và kết quả chấm thử. */
export type CheckVisualData = {
  result: TaskCheckResult
  samples: { b: string; s: number; t: number }[]
  classes: string[]
  regression: boolean
  /** Điểm khi đoán mò (100/số lớp với phân loại, 0 với hồi quy) để so sánh. */
  chance: number
}

/** Gom thế cờ kiểm tra (theo chỉ số mẫu) cùng tên lớp để vẽ. */
export function visualFrom(task: { meta: any; train: { X: any[] } }, result: TaskCheckResult): CheckVisualData {
  const samples = (result.val_idx || []).map((i) => {
    const x = task.train.X[i] || {}
    return { b: String(x.b || '.'.repeat(81)), s: Number(x.s) || 0, t: Number(x.t) || 0 }
  })
  const classes = (task.meta?.classes || []).map(String)
  const regression = !!task.meta?.regression
  return { result, samples, classes, regression, chance: regression ? 0 : 100 / Math.max(2, classes.length || Number(task.meta?.n_classes) || 2) }
}

const THEME = BOARD_THEMES[0]
const PIECE_TYPE: Record<string, string> = { R: 'ROCK', P: 'PAPER', S: 'SCISSORS', J: 'JOKER' }

/** Chuỗi 81 ký tự → bước bàn cờ cho `Board`: chữ hoa là quân bên đi, chữ thường là đối thủ, ? là quân bị che, # là vật cản. */
export function boardToStep(b: string, s: number) {
  const mine: any[] = []
  const theirs: any[] = []
  const obstacles: [number, number][] = []
  for (let i = 0; i < 81; i++) {
    const ch = b[i] || '.'
    const row = Math.floor(i / 9)
    const col = i % 9
    if (ch === '#') obstacles.push([col, row])
    else if (ch === '?') theirs.push({ id: `t${i}`, row, col, type: undefined, alive: true })
    else if (/[A-Z]/.test(ch)) mine.push({ id: `m${i}`, row, col, type: PIECE_TYPE[ch], alive: true })
    else if (/[a-z]/.test(ch)) theirs.push({ id: `t${i}`, row, col, type: PIECE_TYPE[ch.toUpperCase()], alive: true })
  }
  return s === 0 ? { red_pieces: mine, blue_pieces: theirs, obstacles } : { red_pieces: theirs, blue_pieces: mine, obstacles }
}

/** Bàn cờ thu nhỏ: khung tối có viền sáng, quân tròn phát sáng đỏ/xanh theo bên đi, vật cản là đá xám. */
export function MiniBoard({ b, s, ring, title, onClick }: { b: string; s: number; ring?: 'ok' | 'bad'; title?: string; onClick?: () => void }) {
  const mine = s === 0 ? THEME.red : THEME.blue
  const theirs = s === 0 ? THEME.blue : THEME.red
  const glow = ring === 'ok' ? '#34d399' : ring === 'bad' ? '#f87171' : 'transparent'
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-label={title || 'Thế cờ'}
      role={onClick ? undefined : 'img'}
      className={cn('relative inline-block rounded-xl p-[3px] text-left transition-transform duration-200', onClick && 'cursor-zoom-in hover:-translate-y-0.5 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}
      style={{ background: `linear-gradient(135deg, ${glow}, ${THEME.frame}55)`, boxShadow: ring ? `0 6px 18px -8px ${glow}` : undefined }}
    >
      <span className="block rounded-[9px] p-[3px]" style={{ background: THEME.backdrop }}>
        <span className="grid grid-cols-9 gap-px overflow-hidden rounded-md" style={{ background: THEME.backdrop }}>
          {Array.from({ length: 81 }, (_, i) => {
            const ch = b[i] || '.'
            const upper = ch >= 'A' && ch <= 'Z'
            const lower = ch >= 'a' && ch <= 'z'
            const piece = upper || lower
            const base = (i + Math.floor(i / 9)) % 2 ? THEME.cellB : THEME.cellA
            return (
              <span key={i} className="relative flex size-[13px] items-center justify-center sm:size-[15px]" style={{ background: base }}>
                {piece && (
                  <span className="grid size-[11px] place-items-center rounded-full text-[6px] font-black leading-none text-white sm:size-[13px] sm:text-[7px]"
                    style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${upper ? mine : theirs} 55%, #fff), ${upper ? mine : theirs} 60%)`, boxShadow: `0 0 5px ${upper ? mine : theirs}aa` }}>{ch.toUpperCase()}</span>
                )}
                {ch === '#' && <span className="size-[10px] rounded-[3px] bg-slate-500 shadow-inner sm:size-[12px]" />}
                {ch === '?' && <span className="grid size-[11px] place-items-center rounded-full bg-slate-400/80 text-[7px] font-black text-slate-900 sm:size-[13px]">?</span>}
              </span>
            )
          })}
        </span>
      </span>
      {ring && (
        <span className={cn('absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-white shadow-lg ring-2 ring-background', ring === 'ok' ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden>
          {ring === 'ok' ? <Check className="size-3" strokeWidth={3.5} /> : <XIcon className="size-3" strokeWidth={3.5} />}
        </span>
      )}
    </Wrapper>
  )
}

/** Đường mất mát: vùng tô gradient, lưới mờ, tự vẽ ra dần; càng đi xuống nghĩa là mô hình càng học được. */
export function LossChart({ points, live = false }: { points: number[]; live?: boolean }) {
  const reduced = useReducedMotion()
  if (points.length < 2) return null
  const w = 360
  const h = 110
  const padX = 6
  const padY = 10
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const xs = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2)
  const ys = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2)
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${h - 2} L${xs(0).toFixed(1)},${h - 2} Z`
  const last = points[points.length - 1]
  const drop = max > 0 ? Math.round((1 - last / max) * 100) : 0
  return (
    <figure className="space-y-2" data-testid="check-loss">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{live ? 'Đang huấn luyện…' : 'Đường học của mô hình'}</p>
        {!live && drop > 0 && <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">sai số giảm {drop}%</span>}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full rounded-xl border border-border bg-muted/30" role="img" aria-label="Đường mất mát khi huấn luyện" preserveAspectRatio="none">
        <defs>
          <linearGradient id="loss-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => <line key={k} x1="0" x2={w} y1={h * k} y2={h * k} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 5" />)}
        <path d={area} fill="url(#loss-fill)" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className={live || reduced ? undefined : 'draw-line'} vectorEffect="non-scaling-stroke" />
        <circle cx={xs(points.length - 1)} cy={ys(last)} r="4" fill="var(--primary)" className={live ? 'animate-pulse' : undefined} />
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">Sai số từ {max.toFixed(3)} xuống {last.toFixed(3)} sau {points.length} vòng huấn luyện.</figcaption>
    </figure>
  )
}

function Confusion({ data }: { data: CheckVisualData }) {
  const { y_true = [], preds = [] } = data.result
  const k = Math.max(data.classes.length, ...y_true.map((v) => v + 1), ...preds.map((v) => v + 1), 2)
  const m = Array.from({ length: k }, () => Array<number>(k).fill(0))
  y_true.forEach((t, i) => { const p = Math.round(preds[i]); if (m[t] && m[t][p] !== undefined) m[t][p]++ })
  const name = (i: number) => data.classes[i] || `Lớp ${i}`
  let worst: { t: number; p: number; n: number } | null = null
  m.forEach((row, t) => row.forEach((n, p) => { if (t !== p && n > 0 && (!worst || n > worst.n)) worst = { t, p, n } }))
  const wrong = worst as { t: number; p: number; n: number } | null
  return (
    <div className="space-y-2" data-testid="check-confusion">
      <p className="text-xs font-semibold">Mô hình nhầm ở đâu?</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `minmax(0,1.1fr) repeat(${k}, minmax(0,1fr))` }}>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">thật ↓ · đoán →</span>
        {m.map((_, j) => <span key={j} className="px-1 text-center text-[11px] font-semibold text-muted-foreground">{name(j)}</span>)}
        {m.map((row, i) => {
          const total = row.reduce((a, b) => a + b, 0) || 1
          return [
            <span key={`h${i}`} className="self-center text-[11px] font-semibold text-muted-foreground">{name(i)}</span>,
            ...row.map((v, j) => {
              const share = v / total
              const good = i === j
              return (
                <span key={`${i}-${j}`} className={cn('grid place-items-center rounded-xl px-1 py-2.5 text-center leading-tight transition-transform hover:scale-[1.04]', good ? 'text-emerald-950 dark:text-emerald-50' : 'text-red-950 dark:text-red-50')}
                  style={{ background: `color-mix(in oklab, ${good ? '#10b981' : '#ef4444'} ${Math.round(share * 78) + (v ? 10 : 0)}%, transparent)`, boxShadow: good && share > 0.5 ? '0 0 0 1px #10b98166' : undefined }}>
                  <span className="text-base font-extrabold tabular-nums">{v}</span>
                  <span className="text-[10px] opacity-75">{Math.round(share * 100)}%</span>
                </span>
              )
            }),
          ]
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{wrong ? `Dễ nhầm nhất: thật “${name(wrong.t)}” nhưng đoán “${name(wrong.p)}” (${wrong.n} lần).` : 'Mô hình không nhầm lần nào trên các thế này.'}</p>
    </div>
  )
}

function Scatter({ data }: { data: CheckVisualData }) {
  const { y_true = [], preds = [] } = data.result
  if (!y_true.length) return null
  const all = [...y_true, ...preds]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = hi - lo || 1
  const size = 260
  const pad = 16
  const px = (v: number) => pad + ((v - lo) / span) * (size - pad * 2)
  const py = (v: number) => size - pad - ((v - lo) / span) * (size - pad * 2)
  return (
    <figure className="space-y-2" data-testid="check-scatter">
      <p className="text-xs font-semibold">Mô hình đoán so với thực tế</p>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] rounded-xl border border-border bg-muted/30" role="img" aria-label="Dự đoán so với giá trị thật">
        <defs>
          <linearGradient id="scatter-diag" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="var(--primary)" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => <g key={k}><line x1={size * k} x2={size * k} y1="0" y2={size} stroke="currentColor" strokeOpacity="0.07" /><line y1={size * k} y2={size * k} x1="0" x2={size} stroke="currentColor" strokeOpacity="0.07" /></g>)}
        <line x1={px(lo)} y1={py(lo)} x2={px(hi)} y2={py(hi)} stroke="url(#scatter-diag)" strokeWidth="2" strokeDasharray="5 5" />
        {y_true.map((t, i) => {
          const off = Math.min(1, Math.abs(preds[i] - t) / (span * 0.35))
          return <circle key={i} cx={px(t)} cy={py(preds[i])} r="3.6" fill={`color-mix(in oklab, #ef4444 ${Math.round(off * 100)}%, #10b981)`} fillOpacity="0.8" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.6" />
        })}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">Mỗi chấm là một thế cờ: ngang = giá trị thật, dọc = mô hình đoán. Chấm xanh nằm sát đường chéo là đoán gần đúng, chấm đỏ lệch xa.</figcaption>
    </figure>
  )
}

type Mark = { sample: { b: string; s: number; t: number }; truth: number; pred: number; ok: boolean }

/** Xem một thế cờ cỡ lớn kèm đáp án thật và dự đoán; duyệt trước/sau, đóng bằng Esc. */
function BoardDialog({ marks, index, onIndex, onClose, name }: { marks: Mark[]; index: number; onIndex: (i: number) => void; onClose: () => void; name: (i: number) => string }) {
  const m = marks[index]
  useModalLayer(onClose)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex(Math.min(marks.length - 1, index + 1))
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [index, marks.length, onIndex])
  const step = useMemo(() => (m ? boardToStep(m.sample.b, m.sample.s) : null), [m])
  if (!m || !step || typeof document === 'undefined') return null
  const mover = m.sample.s === 0 ? 'Đỏ' : 'Xanh'
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} data-testid="check-dialog">
      <div role="dialog" aria-modal="true" aria-label="Chi tiết thế cờ" className="surface animate-in fade-in-0 zoom-in-95 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border p-5 duration-200">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-display text-lg font-extrabold">Thế cờ {index + 1}/{marks.length} · lượt {m.sample.t} · {mover} đi</p>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Đóng"><XIcon className="size-4" /></Button>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center">
          <Board step={step} theme={THEME} size="md" />
          <div className="space-y-3">
            <div className={cn('rounded-2xl border p-4', m.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10')}>
              <p className={cn('flex items-center gap-2 text-sm font-extrabold', m.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{m.ok ? <Check className="size-4" strokeWidth={3} /> : <XIcon className="size-4" strokeWidth={3} />}{m.ok ? 'Mô hình đoán ĐÚNG' : 'Mô hình đoán SAI'}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-[11px] text-muted-foreground">Đáp án thật</dt><dd className="font-display text-lg font-extrabold">{name(m.truth)}</dd></div>
                <div><dt className="text-[11px] text-muted-foreground">Mô hình đoán</dt><dd className="font-display text-lg font-extrabold">{name(m.pred)}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-border p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Cách đọc bàn cờ</p>
              <p>Quân của bên đi là {mover}; quân đối thủ cùng loại ({Object.values(PIECE_LABEL).slice(0, 3).join(', ')}). Dấu “?” là quân bị sương mù che, khối xám là vật cản.</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft className="size-4" />Trước</Button>
              <Button variant="secondary" size="sm" disabled={index >= marks.length - 1} onClick={() => onIndex(index + 1)}>Sau<ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const CONFETTI = ['#ff4d6d', '#35c9ff', '#ffe066', '#7dffb2', '#b388ff']

/** Hình minh họa kết quả chấm thử: vòng điểm sinh động, nhận xét, thế cờ lọc đúng/sai bấm xem lớn, bản đồ nhầm lẫn, đường học. */
export function CheckVisual({ data }: { data: CheckVisualData }) {
  const reduced = useReducedMotion()
  const { result, samples, classes, regression, chance } = data
  const score = Number.isFinite(result.score) ? result.score : 0
  const shown = useCountUp(score, reduced)
  const marks: Mark[] = useMemo(() => {
    const t = result.y_true || []
    const p = result.preds || []
    return samples.map((sample, i) => ({ sample, truth: t[i], pred: regression ? p[i] : Math.round(p[i]), ok: regression ? p[i] === t[i] : Math.round(p[i]) === t[i] }))
      .filter((m) => Number.isFinite(m.truth) && Number.isFinite(m.pred))
  }, [samples, result, regression])
  const correct = marks.filter((m) => m.ok).length
  const [filter, setFilter] = useState<'all' | 'ok' | 'bad'>('all')
  const [limit, setLimit] = useState(24)
  const [open, setOpen] = useState<number | null>(null)
  const [spotlight, setSpotlight] = useState(0)
  const current = Math.min(spotlight, Math.max(0, marks.length - 1))
  const focused = marks[current]
  const focusedStep = useMemo(() => focused ? boardToStep(focused.sample.b, focused.sample.s) : null, [focused])
  useEffect(() => { setSpotlight(0); setOpen(null); setLimit(24) }, [data])
  const name = (i: number) => classes[i] || `Lớp ${i}`
  const list = useMemo(() => {
    const filtered = marks.filter((m) => (filter === 'all' ? true : filter === 'ok' ? m.ok : !m.ok))
    return filter === 'all' ? [...filtered.filter((m) => !m.ok), ...filtered.filter((m) => m.ok)] : filtered
  }, [marks, filter])
  useEffect(() => { setLimit(24); setOpen(null) }, [filter])

  const lead = Math.round(score - chance)
  const level = score >= 80 ? { text: 'Xuất sắc', color: '#8b5cf6' } : score >= (regression ? 50 : chance + 20) ? { text: 'Khá tốt', color: '#10b981' } : score > chance + (regression ? 5 : 3) ? { text: 'Hơn đoán mò một chút', color: '#f59e0b' } : { text: 'Chưa hơn đoán mò', color: '#ef4444' }
  const mae = regression && marks.length ? (result.y_true || []).reduce((a, t, i) => a + Math.abs((result.preds?.[i] ?? 0) - t), 0) / marks.length : 0
  const tiles: [string, string, React.ReactNode][] = regression
    ? [['Sai số trung bình', mae.toFixed(2), <Target key="i" className="size-3.5" />], ['Thời gian chạy', `${(result.elapsed_ms / 1000).toFixed(1)} giây`, <Clock key="i" className="size-3.5" />], ['Mẫu để học', String(result.n_train), <Sparkles key="i" className="size-3.5" />], ['Mẫu kiểm tra', String(result.n_val), <Check key="i" className="size-3.5" />]]
    : [['Đoán đúng', `${correct}/${marks.length}`, <Check key="i" className="size-3.5" />], ['Đoán sai', String(marks.length - correct), <XIcon key="i" className="size-3.5" />], ['Thời gian chạy', `${(result.elapsed_ms / 1000).toFixed(1)} giây`, <Clock key="i" className="size-3.5" />], ['Mẫu để học', String(result.n_train), <Sparkles key="i" className="size-3.5" />]]

  return (
    <div className="space-y-5" data-testid="check-visual">
      <div className="relative overflow-hidden rounded-3xl border border-border p-5" style={{ background: `radial-gradient(70% 120% at 0% 0%, ${level.color}2e, transparent 70%), linear-gradient(180deg, color-mix(in oklab, ${level.color} 7%, var(--card)), var(--card))` }}>
        {score >= 80 && !reduced && Array.from({ length: 22 }, (_, i) => (
          <span key={i} aria-hidden className="confetti pointer-events-none absolute top-0 h-3 w-1.5 rounded-sm" style={{ left: `${(i * 4.7) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 8) * 0.2}s`, animationDuration: `${2.4 + (i % 5) * 0.4}s` }} />
        ))}
        <div className="relative flex flex-wrap items-center gap-6">
          <div style={{ ['--primary' as string]: level.color }}><ProgressRing value={Math.min(100, Math.max(0, shown))} max={100} size={132} label="Điểm ước lượng" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">Điểm ước lượng</p>
            <p className="font-display text-5xl font-black leading-none tabular-nums" style={{ color: level.color }} data-testid="check-visual-score">{fmt(shown)}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold" style={{ background: `${level.color}22`, color: level.color }}><Sparkles className="size-4" aria-hidden />{level.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{regression ? 'Điểm tính theo R² trên các mẫu kiểm tra. Mốc 0 tương ứng không hơn cách dự đoán trung bình đáp án; đây không phải tỷ lệ đoán đúng.' : lead > 0 ? `Cao hơn đoán mò ${lead} điểm (đoán mò được khoảng ${Math.round(chance)}).` : `Chưa hơn mức đoán mò (khoảng ${Math.round(chance)} điểm). Thử thêm đặc trưng hoặc huấn luyện lâu hơn.`}</p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map(([label, value, icon]) => (
            <div key={label} className="rounded-2xl border border-border/70 bg-background/55 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><span className="text-primary">{icon}</span>{label}</p>
              <p className="font-display mt-0.5 text-lg font-extrabold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {focused && focusedStep && <PredictionStage step={focusedStep} index={current} total={marks.length} side={focused.sample.s} truth={regression ? String(focused.truth) : name(focused.truth)} prediction={regression ? String(focused.pred) : name(focused.pred)} error={regression ? Math.abs(focused.pred - focused.truth) : undefined} onIndex={setSpotlight} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="space-y-5">
          {result.fit_log && result.fit_log.length > 1 && <LossChart points={result.fit_log} />}
          {!regression && marks.length > 0 && <Confusion data={data} />}
          {regression && <Scatter data={data} />}
        </div>

        {!regression && marks.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold">Từng thế cờ <span className="text-xs font-normal text-muted-foreground">· bấm vào để xem lớn và đáp án</span></p>
              <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'all', label: `Tất cả ${marks.length}` }, { id: 'ok', label: `Đúng ${correct}` }, { id: 'bad', label: `Sai ${marks.length - correct}` }]} />
            </div>
            <div className="flex flex-wrap gap-2.5" data-testid="check-boards">
              {list.slice(0, limit).map((m, i) => (
                <div key={`${filter}-${i}`} className={reduced ? undefined : 'animate-fade-up'} style={reduced ? undefined : { animationDelay: `${Math.min(i, 24) * 22}ms`, animationFillMode: 'backwards' }}>
                  <MiniBoard b={m.sample.b} s={m.sample.s} ring={m.ok ? 'ok' : 'bad'} title={`Thật: ${name(m.truth)} · Mô hình đoán: ${name(m.pred)}`} onClick={() => setOpen(i)} />
                </div>
              ))}
            </div>
            {list.length > limit && limit < 96 && <Button variant="secondary" size="sm" onClick={() => setLimit((n) => Math.min(96, n + 24))}>Xem thêm {Math.min(24, list.length - limit)} thế ({list.length - limit} còn lại)</Button>}
            {list.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Không có thế nào trong nhóm này.</p>}
          </div>
        )}
      </div>
      {open !== null && <BoardDialog marks={list} index={Math.min(open, list.length - 1)} onIndex={setOpen} onClose={() => setOpen(null)} name={name} />}
    </div>
  )
}
