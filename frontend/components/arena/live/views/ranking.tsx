'use client'

import { useEffect, useMemo, useState } from 'react'
import { Crown, Search } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { sameStudent } from '@/lib/format'
import { Avatar, Badge, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, SectionTitle, Select, SkeletonRows, Tabs } from '../ui'
import { useLive } from '../context'
import { useRanking } from '../shared'

const PAGE = 20

function Podium({ rows }: { rows: any[] }) {
  if (rows.length < 3) return null
  const slots = [
    { row: rows[1], place: 2, h: 'h-28', medal: '🥈', tint: 'from-slate-300/25 to-slate-300/5', ring: undefined },
    { row: rows[0], place: 1, h: 'h-40', medal: '🥇', tint: 'from-amber-300/35 to-amber-300/5', ring: 'gold' as const },
    { row: rows[2], place: 3, h: 'h-24', medal: '🥉', tint: 'from-orange-400/25 to-orange-400/5', ring: undefined },
  ]
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-primary/15 to-card/80 px-4 pt-8 md:px-10">
      <div className="hero-grid absolute inset-0 -z-0 opacity-60" aria-hidden />
      <div className="relative grid grid-cols-3 items-end gap-3 md:gap-6">
        {slots.map(({ row, place, h, medal, tint, ring }) => (
          <div key={row.student_id} className="flex flex-col items-center text-center">
            <Avatar name={row.bot_name || row.team_name} size={place === 1 ? 'xl' : 'lg'} ring={ring} />
            <p className="font-display mt-2 max-w-full truncate text-sm font-extrabold md:text-base">{row.bot_name || row.team_name}</p>
            <p className="gradient-text font-display text-lg font-black tabular-nums">{row.elo_score ?? Math.round(row.elo)}</p>
            <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-2xl border border-b-0 border-border bg-gradient-to-b pt-3 text-3xl', h, tint, place === 1 && 'glow-gold')} aria-label={`Hạng ${place}`}>{medal}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GlobalRanking() {
  const { session } = useLive()
  const ranking = useRanking()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = (ranking.data || []).map((r, i) => ({ ...r, rank: i + 1 }))
    return needle ? all.filter((r) => `${r.bot_name} ${r.student_id}`.toLowerCase().includes(needle)) : all
  }, [ranking.data, q])
  useEffect(() => setPage(1), [q])
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div className="space-y-5">
      {ranking.error && !ranking.data && <ErrorNote message={ranking.error.message} onRetry={() => void ranking.reload()} />}
      {!q && ranking.data && <Podium rows={ranking.data.slice(0, 3)} />}
      <Card
        title="Bảng xếp hạng toàn hệ thống"
        subtitle="ELO cộng từ kết quả các trận Bo5 đã hoàn tất ở mọi giải"
        action={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm đội hoặc MSSV" aria-label="Tìm đội" className="w-56 rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>}
      >
        {ranking.loading ? <SkeletonRows rows={8} /> : slice.length ? (
          <>
            <DataTable head={['#', 'Đội', 'MSSV', 'ELO', 'Thắng / Trận', 'Tỉ lệ thắng']}>
              {slice.map((r) => {
                const own = sameStudent(r.student_id, session.student_id)
                return (
                  <tr key={r.student_id} className={cn(own && 'bg-primary/10')}>
                    <td className="w-12 px-3 py-2.5 font-bold tabular-nums">{r.rank <= 3 ? <Crown className={cn('size-4', r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : 'text-orange-500')} aria-label={`Hạng ${r.rank}`} /> : r.rank}</td>
                    <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><Avatar name={r.bot_name} size="sm" />{r.bot_name}</span>{own && <Badge tone="accent" className="ml-2">Bạn</Badge>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.student_id}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{r.elo_score}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.matches_played}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.win_rate}%</td>
                  </tr>
                )
              })}
            </DataTable>
            <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
          </>
        ) : <EmptyState title={q ? 'Không tìm thấy đội phù hợp' : 'Chưa có dữ liệu xếp hạng'} hint={q ? undefined : 'Bảng xếp hạng xuất hiện sau khi có trận Bo5 hoàn tất.'} />}
      </Card>
    </div>
  )
}

function QualifierRanking() {
  const { qualifiers, qualifierId, setQualifierId, session } = useLive()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [qualifierId])
  const event = qualifiers.data?.find((q) => q.id === qualifierId)
  const ranking = useResource(
    qualifierId ? `q:rank:${qualifierId}:${page}` : null,
    () => arenaApi.getQualifierRanking(qualifierId, page),
    { ttl: 10_000, refreshMs: event?.status === 'RUNNING' ? 10_000 : 30_000 },
  )
  const data = ranking.data
  const topK = event?.top_k || 0

  return (
    <Card
      title="Xếp hạng vòng loại"
      subtitle="Mỗi trang 50 đội; ELO cập nhật theo từng lượt ghép cặp"
      action={qualifiers.data?.length ? (
        <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="w-56">
          {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </Select>
      ) : undefined}
    >
      {!qualifiers.loading && !qualifiers.data?.length ? <EmptyState title="Chưa có vòng loại" /> : ranking.loading ? <SkeletonRows rows={8} /> : ranking.error && !data ? <ErrorNote message={ranking.error.message} onRetry={() => void ranking.reload()} /> : data?.items.length ? (
        <>
          <DataTable head={['#', 'Đội', 'MSSV', 'ELO', 'Thắng / Trận', 'Lượt nghỉ', '']}>
            {data.items.map((r) => {
              const own = sameStudent(r.student_id, session.student_id)
              const qualified = topK > 0 && r.rank <= topK
              return (
                <tr key={r.student_id} className={cn(own && 'bg-primary/10', qualified && 'font-medium')}>
                  <td className="w-12 px-3 py-2.5 font-bold tabular-nums">{r.rank}</td>
                  <td className="px-3 py-2.5">{r.team_name}{own && <Badge tone="accent" className="ml-2">Bạn</Badge>}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.student_id}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{Number(r.elo).toFixed(1)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.played}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.byes}</td>
                  <td className="px-3 py-2.5">{qualified && <Badge tone="success">Vào giải chính</Badge>}</td>
                </tr>
              )
            })}
          </DataTable>
          <Pagination page={page} pageSize={data.page_size || 50} total={data.total} onChange={setPage} />
        </>
      ) : <EmptyState title="Chưa có kết quả" hint="Bảng xếp hạng có sau khi vòng loại bắt đầu chấm." />}
    </Card>
  )
}

export function RankingView() {
  const [mode, setMode] = useState<'global' | 'qualifier'>('global')
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Thành tích" title="Xếp hạng">
        <Tabs value={mode} onChange={setMode} tabs={[{ id: 'global', label: 'Toàn hệ thống' }, { id: 'qualifier', label: 'Vòng loại' }]} />
      </SectionTitle>
      {mode === 'global' ? <GlobalRanking /> : <QualifierRanking />}
    </div>
  )
}
