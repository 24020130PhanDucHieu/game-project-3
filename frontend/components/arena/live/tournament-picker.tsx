'use client'

import { Network } from 'lucide-react'
import { Select } from './ui'
import { useLive } from './context'

/** Chọn giải thường đang xem. Giải AI không nằm ở đây: nó có chỗ riêng trong tab Giải AI. */
export function TournamentPicker({ label = 'Giải đang xem', className }: { label?: string; className?: string }) {
  const { tournaments, tournamentId, setTournamentId } = useLive()
  const list = tournaments.data || []
  const normal = list.filter((t) => t.track !== 'AI')
  // Đang ở trong phòng trận của giải AI thì vẫn hiện đúng giải đó để ô chọn không bị trống.
  const current = list.find((t) => t.tournament_id === tournamentId)
  const extra = current && current.track === 'AI' ? current : undefined
  if (!list.length) return null
  return (
    <Select label={label} aria-label="Chọn giải đấu" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} className={className ?? 'min-w-64 max-w-md'}>
      {!normal.length && !extra && <option value="">Chưa có giải thường</option>}
      {normal.map((t) => <option key={t.tournament_id} value={t.tournament_id}>{t.name}</option>)}
      {extra && <option value={extra.tournament_id}>{extra.name} (Giải AI)</option>}
    </Select>
  )
}

/** Nhãn chỉ-đọc cho các trang phụ thuộc giải (Tổng quan, Trận đấu): đang xem giải nào và đổi ở đâu. */
export function CurrentTournamentChip() {
  const { tournaments, tournamentId, navigate } = useLive()
  const current = (tournaments.data || []).find((t) => t.tournament_id === tournamentId)
  if (!current) return null
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="current-tournament">
      <Network className="size-4" aria-hidden />
      Đang xem: <strong className="text-foreground">{current.name}</strong>
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('bracket')}>Đổi giải ở Bảng đấu</button>
    </p>
  )
}
