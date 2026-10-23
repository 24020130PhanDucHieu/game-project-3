'use client'

import { useEffect, useState } from 'react'
import { Crown } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { sameStudent } from '@/lib/format'
import { Avatar, Badge, StatusBadge } from './ui'
import { useLive } from './context'

/** Giờ chuẩn theo server (bù lệch đồng hồ máy), cập nhật mỗi giây. */
export function useNow(tickMs = 1000): number {
  const time = useResource<number>('server-time', async () => {
    const before = Date.now()
    const response = await arenaApi.getServerTime()
    const latency = (Date.now() - before) / 2
    return response.server_time_ms + latency - Date.now()
  }, { ttl: 300_000 })
  const offset = time.data ?? 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(timer)
  }, [tickMs])
  return now + offset
}

export function useRanking() {
  return useResource<any[]>('rk', () => arenaApi.getRanking().then((r) => (Array.isArray(r) ? r : [])), { ttl: 30_000, refreshMs: 60_000 })
}

export function useHistory() {
  return useResource<any[]>('mh', () => arenaApi.getMatchHistory().then((r) => (Array.isArray(r) ? r : [])), { ttl: 30_000, refreshMs: 60_000 })
}

/** Backend trả winner_name = "Hòa" khi trận chưa có đội thắng; Bo5 không có hòa nên đó là trận đang diễn ra. */
export function historyWinner(item: any): { done: boolean; name: string } {
  const name = String(item?.winner_name || '')
  return { done: !!name && name !== 'Hòa', name }
}

export function winnerSide(match: any): 'team_a' | 'team_b' | null {
  if (!match?.winner) return null
  if (match.winner === 'team_a' || match.winner === 'team_b') return match.winner
  return null
}

export function TeamLine({ team, won, own, side }: { team: any; won?: boolean; own?: boolean; side?: 'red' | 'blue' }) {
  const score = team?.rounds_won ?? 0
  return (
    <div className="flex items-center gap-2.5">
      {team ? <Avatar name={team.team_name} size="sm" ring={won ? 'gold' : side} /> : <span className="size-7 shrink-0 rounded-xl border border-dashed border-border" aria-hidden />}
      <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-sm', won ? 'font-extrabold' : 'font-medium', !team && 'italic text-muted-foreground')}>
        <span className="truncate">{team?.team_name || 'Chờ đội'}</span>
        {won && <Crown className="size-3.5 shrink-0 text-amber-400" aria-label="Đội thắng" />}
        {own && <span className="shrink-0 rounded bg-primary/20 px-1.5 text-[10px] font-bold text-primary">BẠN</span>}
      </span>
      <span className={cn('font-display min-w-7 rounded-lg px-2 text-center text-base font-extrabold tabular-nums', won ? 'bg-amber-400/20 text-amber-500 dark:text-amber-300' : 'bg-muted text-foreground')}>{team ? score : '–'}</span>
    </div>
  )
}

export function MatchCard({ id, match, onOpen, selected, compact }: { id: string; match: any; onOpen?: (id: string) => void; selected?: boolean; compact?: boolean }) {
  const { session } = useLive()
  const won = winnerSide(match)
  const ownA = sameStudent(match.team_a?.student_id, session.student_id)
  const ownB = sameStudent(match.team_b?.student_id, session.student_id)
  const live = match.status === 'IN_PROGRESS' || match.round_status === 'BATTLE_RUNNING'
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag
      {...(onOpen ? { onClick: () => onOpen(id), type: 'button' as const } : {})}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border bg-card/90 p-3 text-left',
        onOpen && 'card-lift focus-visible:outline-2 focus-visible:outline-ring',
        selected ? 'border-primary glow' : 'border-border',
        !selected && (ownA || ownB) && 'border-primary/50',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', live ? 'bg-emerald-400' : won ? 'bg-amber-400' : 'bg-primary/40')} aria-hidden />
      <div className="mb-2.5 flex items-center justify-between gap-2 pl-1.5">
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{match.title || match.round_name || id}</span>
        {!compact && (live ? <Badge tone="success"><span className="animate-live size-1.5 rounded-full bg-emerald-400" aria-hidden />TRỰC TIẾP</Badge> : <StatusBadge status={match.status} />)}
      </div>
      <div className="space-y-2 pl-1.5">
        <TeamLine team={match.team_a} won={won === 'team_a'} own={ownA} side="red" />
        <TeamLine team={match.team_b} won={won === 'team_b'} own={ownB} side="blue" />
      </div>
    </Tag>
  )
}

export function PageNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{children}</div>
}
