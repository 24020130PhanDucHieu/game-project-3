'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLive } from '../../context'

export const FAMILY_NAME: Record<string, string> = {
  bias: 'Thiên lệch',
  cycle: 'Chu kỳ',
  markov1: 'Phụ thuộc nước trước',
  beat_last: 'Phản đòn',
  markov2: 'Phụ thuộc hai bên',
  noisy_cycle: 'Chu kỳ có nhiễu',
  switcher: 'Đổi sở thích giữa chừng',
  adaptive_freq: 'Đối thủ thích ứng',
  wsls: 'Thắng giữ, thua đổi',
}

export const STEP_LABEL: Record<string, string> = { OPEN: 'Nhận mô hình', LOCKED: 'Khóa bài', RUNNING: 'Chấm trên bộ ẩn', FINISHED: 'Hoàn tất', PROMOTED: 'Vào giải chính' }

export const TECH_SHORT: Record<string, string> = { RULES: 'Luật/heuristic', STATS: 'Thống kê', BANDIT: 'Bandit', RL: 'Học tăng cường', ML: 'Học máy', NN: 'Mạng nơ-ron', ENSEMBLE: 'Kết hợp', OTHER: 'Khác' }

/** Thanh điểm 0–100 có vạch 50 (mức đoán ngẫu nhiên). */
export function ScoreBar({ value, label, note }: { value: number; label: string; note?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="tabular-nums font-semibold">{v.toFixed(1)}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
        <div className={cn('h-full rounded-full transition-[width] duration-500', v >= 65 ? 'bg-emerald-500' : v >= 52 ? 'bg-primary' : 'bg-orange-500')} style={{ width: `${v}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" aria-hidden />
      </div>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}

export function fmt(value: unknown, digits = 1) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

/** Các giải chính của Giải AI (đánh dấu track = AI) và giải đang chọn trong tab Giải AI. */
export function useAiTournaments() {
  const { tournaments } = useLive()
  const list = (tournaments.data || []).filter((t) => t.track === 'AI')
  const key = list.map((t) => t.tournament_id).join(',')
  const [id, setId] = useState('')
  useEffect(() => {
    if (list.length && !list.some((t) => t.tournament_id === id)) setId(list[0].tournament_id)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { list, id, setId, current: list.find((t) => t.tournament_id === id) }
}
