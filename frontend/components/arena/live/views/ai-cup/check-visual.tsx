'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useCountUp, useReducedMotion } from '@/lib/motion'
import type { TaskCheckResult } from '@/lib/offline-engine'
import { ScoreBar, fmt } from './common'

/** Dữ liệu cần để vẽ hình minh họa, lấy từ đề đã tải và kết quả chấm thử. */
export type CheckVisualData = {
  result: TaskCheckResult
  samples: { b: string; s: number; t: number }[]
  classes: string[]
  regression: boolean
}

/** Gom thế cờ kiểm tra (theo chỉ số mẫu) cùng tên lớp để vẽ. */
export function visualFrom(task: { meta: any; train: { X: any[] } }, result: TaskCheckResult): CheckVisualData {
  const samples = (result.val_idx || []).map((i) => {
    const x = task.train.X[i] || {}
    return { b: String(x.b || '.'.repeat(81)), s: Number(x.s) || 0, t: Number(x.t) || 0 }
  })
  return { result, samples, classes: (task.meta?.classes || []).map(String), regression: !!task.meta?.regression }
}

const PIECE_COLOR = { red: '#ef4444', blue: '#3b82f6' }

/** Bàn cờ thu nhỏ vẽ từ chuỗi 81 ký tự: hoa = quân bên đi, thường = đối thủ, ? = bị che, # = vật cản. */
export function MiniBoard({ b, s, ring, title }: { b: string; s: number; ring?: 'ok' | 'bad'; title?: string }) {
  const mine = s === 0 ? PIECE_COLOR.red : PIECE_COLOR.blue
  const theirs = s === 0 ? PIECE_COLOR.blue : PIECE_COLOR.red
  return (
    <div
      title={title}
      role="img"
      aria-label={title || 'Thế cờ'}
      className={cn('inline-block rounded-md p-[2px] ring-2', ring === 'ok' ? 'ring-emerald-500' : ring === 'bad' ? 'ring-red-500' : 'ring-transparent', 'bg-muted/60')}
    >
      <div className="grid grid-cols-9 gap-px overflow-hidden rounded-[3px] bg-border/60">
        {Array.from({ length: 81 }, (_, i) => {
          const ch = b[i] || '.'
          const upper = ch >= 'A' && ch <= 'Z'
          const lower = ch >= 'a' && ch <= 'z'
          const piece = upper || lower
          return (
            <span
              key={i}
              className={cn('flex size-[9px] items-center justify-center text-[6px] font-bold leading-none text-white sm:size-[10px]', (i + (i / 9 | 0)) % 2 ? 'bg-background' : 'bg-muted')}
              style={piece ? { background: upper ? mine : theirs } : ch === '#' ? { background: '#64748b' } : ch === '?' ? { background: '#94a3b8' } : undefined}
            >
              {piece ? ch.toUpperCase() : ch === '?' ? '?' : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Đường mất mát: càng đi xuống nghĩa là mô hình càng học được. */
export function LossChart({ points, live = false }: { points: number[]; live?: boolean }) {
  if (points.length < 2) return null
  const w = 320
  const h = 90
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const coords = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - 6 - ((v - min) / span) * (h - 14)}`)
  return (
    <figure className="space-y-1" data-testid="check-loss">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full max-w-md" role="img" aria-label="Đường mất mát khi huấn luyện">
        <polyline points={coords.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="3.5" fill="var(--primary)" className={live ? 'animate-pulse' : undefined} />
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {live ? 'Đang huấn luyện…' : 'Đường học'}: sai số từ {max.toFixed(3)} xuống {points[points.length - 1].toFixed(3)} sau {points.length} vòng
      </figcaption>
    </figure>
  )
}

function Confusion({ data }: { data: CheckVisualData }) {
  const { y_true = [], preds = [] } = data.result
  const k = Math.max(data.classes.length, ...y_true.map((v) => v + 1), ...preds.map((v) => v + 1), 2)
  const m = Array.from({ length: k }, () => Array<number>(k).fill(0))
  y_true.forEach((t, i) => { const p = Math.round(preds[i]); if (m[t] && m[t][p] !== undefined) m[t][p]++ })
  const rowMax = m.map((row) => Math.max(1, ...row))
  const name = (i: number) => data.classes[i] || `Lớp ${i}`
  return (
    <div className="space-y-1" data-testid="check-confusion">
      <p className="text-xs font-semibold">Ma trận nhầm lẫn (hàng: đáp án thật · cột: mô hình đoán)</p>
      <table className="border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr><th />{m.map((_, j) => <th key={j} className="px-1 font-medium text-muted-foreground">đoán {name(j)}</th>)}</tr>
        </thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              <th className="pr-1 text-right font-medium text-muted-foreground">thật {name(i)}</th>
              {row.map((v, j) => (
                <td key={j} className={cn('min-w-12 rounded-md px-2 py-1.5 font-semibold tabular-nums', i === j ? 'text-emerald-900 dark:text-emerald-100' : 'text-red-900 dark:text-red-100')}
                  style={{ background: `color-mix(in oklab, ${i === j ? '#10b981' : '#ef4444'} ${Math.round((v / rowMax[i]) * 70) + (v ? 12 : 0)}%, transparent)` }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const size = 240
  const pad = 14
  const px = (v: number) => pad + ((v - lo) / span) * (size - pad * 2)
  const py = (v: number) => size - pad - ((v - lo) / span) * (size - pad * 2)
  return (
    <figure className="space-y-1" data-testid="check-scatter">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px] rounded-xl border border-border bg-muted/30" role="img" aria-label="Dự đoán so với giá trị thật">
        <line x1={px(lo)} y1={py(lo)} x2={px(hi)} y2={py(hi)} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 4" />
        {y_true.map((t, i) => <circle key={i} cx={px(t)} cy={py(preds[i])} r="3" fill="var(--primary)" fillOpacity="0.65" />)}
      </svg>
      <figcaption className="text-xs text-muted-foreground">Mỗi chấm là một thế cờ: ngang = giá trị thật, dọc = mô hình đoán. Chấm càng sát đường chéo nét đứt càng đúng.</figcaption>
    </figure>
  )
}

/** Hình minh họa kết quả chấm thử: điểm chạy lên, từng thế cờ đoán đúng/sai, ma trận nhầm lẫn hoặc đồ thị dự đoán, đường học. */
export function CheckVisual({ data }: { data: CheckVisualData }) {
  const reduced = useReducedMotion()
  const { result, samples, classes, regression } = data
  const shown = useCountUp(Number.isFinite(result.score) ? result.score : 0, reduced)
  const marks = useMemo(() => {
    const t = result.y_true || []
    const p = result.preds || []
    return samples.map((sample, i) => ({ sample, truth: t[i], pred: Math.round(p[i]), ok: Math.round(p[i]) === t[i] }))
  }, [samples, result])
  const correct = marks.filter((m) => m.ok).length
  const name = (i: number) => classes[i] || `Lớp ${i}`
  return (
    <div className="space-y-4" data-testid="check-visual">
      <div>
        <p className="font-display text-4xl font-black tabular-nums" data-testid="check-visual-score">{fmt(shown)}</p>
        <ScoreBar value={Math.min(100, Math.max(0, shown))} label="Điểm ước lượng" />
      </div>
      {result.fit_log && result.fit_log.length > 1 && <LossChart points={result.fit_log} />}
      {!regression && marks.length > 0 && (
        <>
          <p className="text-sm font-semibold">
            Đoán đúng {correct}/{marks.length} thế cờ <span className="text-xs font-normal text-muted-foreground">(viền xanh = đúng, viền đỏ = sai; chỉ vào ô để xem đáp án)</span>
          </p>
          <div className="flex flex-wrap gap-2" data-testid="check-boards">
            {marks.slice(0, 48).map((m, i) => (
              <div key={i} className={reduced ? undefined : 'animate-fade-up'} style={reduced ? undefined : { animationDelay: `${Math.min(i, 30) * 25}ms`, animationFillMode: 'backwards' }}>
                <MiniBoard b={m.sample.b} s={m.sample.s} ring={m.ok ? 'ok' : 'bad'} title={`Thật: ${name(m.truth)} · Mô hình đoán: ${name(m.pred)}`} />
              </div>
            ))}
          </div>
          {marks.length > 48 && <p className="text-xs text-muted-foreground">Hiện 48 thế đầu; điểm tính trên cả {marks.length} thế.</p>}
          <Confusion data={data} />
        </>
      )}
      {regression && <Scatter data={data} />}
    </div>
  )
}
