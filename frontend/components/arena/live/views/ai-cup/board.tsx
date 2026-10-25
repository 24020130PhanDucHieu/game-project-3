'use client'

import { useState } from 'react'
import { EyeOff, Flame, ListOrdered, LineChart, Lock, Trophy, Users } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { sameStudent } from '@/lib/format'
import { Avatar, Badge, Card, DataTable, EmptyState, SkeletonRows, Tabs } from '../../ui'
import { useLive } from '../../context'
import { Podium, RankBadge, SummaryStat } from '../ranking'
import { FAMILY_NAME, ScoreBar, TECH_SHORT, fmt } from './common'

function Board({ eventId, which, mineId }: { eventId: string; which: 'public' | 'private'; mineId?: string }) {
  const board = useResource<any>(`q:ai:board:${which}:${eventId}`, () => arenaApi.getAiCupLeaderboard(eventId, which), { ttl: 8_000, refreshMs: 15_000 })
  const items: any[] = board.data?.items || []
  if (board.loading && !board.data) return <Card><SkeletonRows rows={6} /></Card>
  if (board.error && !board.data) {
    const hidden = (board.error as { status?: number }).status === 403
    return (
      <Card>
        <EmptyState icon={hidden ? <Lock className="size-6" /> : <ListOrdered className="size-6" />} title={hidden ? 'Bảng riêng tư chưa mở' : 'Chưa tải được bảng điểm'}
          hint={hidden ? 'Bảng này mở khi vòng loại kết thúc, để mọi đội cùng biết kết quả thật trên bộ đề ẩn cùng lúc.' : board.error.message} />
      </Card>
    )
  }
  if (!items.length) return <Card><EmptyState icon={<ListOrdered className="size-6" />} title="Chưa có điểm" hint="Bảng điểm xuất hiện sau khi lượt chấm đầu tiên hoàn tất." /></Card>
  const priv = which === 'private'
  const best = items[0]
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat icon={<Users className="size-5" />} label="Mô hình đã được chấm" value={board.data?.total ?? items.length} />
        <SummaryStat icon={<Trophy className="size-5" />} label={priv ? 'Điểm riêng tư cao nhất' : 'Điểm công khai cao nhất'} value={`${fmt(best.score)} · ${best.team_name}`} />
        <SummaryStat icon={<Flame className="size-5" />} label="Lượt đã chấm" value={`${board.data?.applied_round ?? 0}/${board.data?.rounds ?? '—'}`} />
      </div>
      {items.length >= 3 && <Podium rows={items.slice(0, 3)} value={(r) => fmt(r.score)} unit="điểm" sub={(r) => `${r.rounds} lượt${r.technique ? ` · ${TECH_SHORT[r.technique] || r.technique}` : ''}`} />}
      <Card icon={<ListOrdered />} title={priv ? 'Bảng riêng tư (kết quả chính thức)' : 'Bảng công khai'} subtitle={priv ? 'Xếp theo điểm riêng tư trung bình: 60% đọc đối thủ ở bộ ẩn + 40% bàn cờ' : 'Xếp theo điểm trên bộ đối thủ công khai; chưa phải kết quả chính thức'}>
        <DataTable head={priv ? ['Hạng', 'Đội', 'Điểm riêng tư', 'Đọc đối thủ (ẩn)', 'Bàn cờ', 'Công khai', 'Chênh lệch', 'Kỹ thuật'] : ['Hạng', 'Đội', 'Điểm công khai', 'Số lượt', 'Kỹ thuật']}>
          {items.map((r) => (
            <tr key={r.student_id} data-testid="ai-board-row" className={cn(r.rank === 1 && 'bg-gradient-to-r from-amber-400/15 to-transparent', r.rank === 2 && 'bg-gradient-to-r from-slate-300/15 to-transparent', r.rank === 3 && 'bg-gradient-to-r from-orange-400/15 to-transparent', sameStudent(r.student_id, mineId) && '!bg-primary/10')}>
              <td className="w-14 px-3 py-2"><RankBadge rank={r.rank} /></td>
              <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><Avatar name={r.team_name} size="sm" />{r.team_name}</span>{sameStudent(r.student_id, mineId) && <Badge tone="accent" className="ml-2">Bạn</Badge>}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.student_id}</span></td>
              {priv ? (
                <>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.private)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt(r.reading)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt(r.board)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt(r.public)}</td>
                  <td className={cn('px-3 py-2.5 tabular-nums', Number(r.gap) > 8 ? 'font-semibold text-orange-600 dark:text-orange-400' : 'text-muted-foreground')} title="Công khai trừ đọc đối thủ ở bộ ẩn: lớn nghĩa là quá khớp bộ công khai">{Number(r.gap) > 0 ? '+' : ''}{fmt(r.gap)}</td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.score)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.rounds}</td>
                </>
              )}
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.technique ? TECH_SHORT[r.technique] || r.technique : '—'}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  )
}

export function MyResults({ mine }: { mine: any }) {
  if (!mine?.registered) return null
  const rounds: any[] = mine.rounds || []
  const reveal = !!mine.private_visible
  return (
    <Card icon={<LineChart />} title="Kết quả của đội bạn" subtitle={reveal ? 'Đã mở cả điểm riêng tư' : 'Chi tiết riêng tư sẽ mở khi vòng loại kết thúc'}>
      {mine.banned && <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">Đội đã bị loại khỏi vòng loại{mine.ban_reason ? `: ${mine.ban_reason}` : '.'}</p>}
      {!rounds.length ? <EmptyState title="Chưa có lượt nào được chấm" hint={mine.locked ? 'Mô hình của bạn đã khóa và đang chờ tới lượt chấm.' : 'Hãy nộp mô hình hợp lệ trước hạn để được chấm.'} /> : (
        <div className="space-y-4">
          <DataTable head={reveal ? ['Lượt', 'Công khai', 'Đọc đối thủ (ẩn)', 'Bàn cờ', 'Điểm riêng tư', 'Thời gian chấm'] : ['Lượt', 'Điểm công khai', 'Thời gian chấm']}>
            {rounds.map((r) => (
              <tr key={r.round} data-testid="ai-my-round">
                <td className="px-3 py-2.5 tabular-nums">#{r.round}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.public)}</td>
                {reveal && <><td className="px-3 py-2.5 tabular-nums">{fmt(r.reading)}</td><td className="px-3 py-2.5 tabular-nums">{fmt(r.board)}</td><td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.private)}</td></>}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.elapsed_ms ? `${(r.elapsed_ms / 1000).toFixed(1)} giây` : '—'}</td>
              </tr>
            ))}
          </DataTable>
          {rounds[rounds.length - 1]?.failed && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">Mô hình không chạy được ở lượt gần nhất: {rounds[rounds.length - 1].failed}</p>}
          {rounds.some((r) => r.notes?.length) && (
            <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">{[...new Set(rounds.flatMap((r) => r.notes || []))].map((n: any) => <li key={n}>• {n}</li>)}</ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Bộ công khai · lượt gần nhất</p>
              {Object.entries(rounds[rounds.length - 1].families_public || {}).map(([k, v]) => <ScoreBar key={k} label={FAMILY_NAME[k] || k} value={v as number} />)}
            </div>
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{!reveal && <EyeOff className="size-3.5" />}Bộ ẩn · lượt gần nhất</p>
              {reveal ? Object.entries(rounds[rounds.length - 1].families_private || {}).map(([k, v]) => <ScoreBar key={k} label={FAMILY_NAME[k] || k} value={v as number} />) : <p className="text-sm text-muted-foreground">Chi tiết từng nhóm đối thủ ẩn chỉ công bố khi kết thúc để không ai suy ngược đề.</p>}
              {reveal && rounds[rounds.length - 1].bosses && Object.keys(rounds[rounds.length - 1].bosses).length > 0 && (
                <div className="space-y-3 border-t border-border pt-3">{Object.entries(rounds[rounds.length - 1].bosses).map(([k, v]) => <ScoreBar key={k} label={`Bàn cờ · boss ${k}`} value={v as number} />)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export function BoardTab({ eventId, event, mine, mineId }: { eventId: string; event: any; mine: any; mineId?: string }) {
  const finished = event.status === 'FINISHED' || event.status === 'PROMOTED'
  const [which, setWhich] = useState<'public' | 'private'>(finished ? 'private' : 'public')
  return (
    <div className="space-y-6">
      <Tabs<'public' | 'private'> value={which} onChange={setWhich} tabs={[{ id: 'public', label: 'Bảng công khai', icon: <ListOrdered className="size-4" /> }, { id: 'private', label: finished ? 'Bảng riêng tư (chính thức)' : 'Bảng riêng tư (chưa mở)', icon: finished ? <Trophy className="size-4" /> : <Lock className="size-4" /> }]} />
      <Board eventId={eventId} which={which} mineId={mineId} />
      <MyResults mine={mine} />
    </div>
  )
}

