'use client'

import { useEffect, useMemo, useState } from 'react'
import { Crown, Flag, Flame, Globe2, Medal, Search, Swords, Trophy, Users } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { sameStudent } from '@/lib/format'
import { Avatar, Badge, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, SectionTitle, Select, SkeletonRows, Tabs } from '../ui'
import { useLive } from '../context'
import { useRanking } from '../shared'

const PAGE = 20

const MEDAL = [
  'from-amber-300 via-yellow-400 to-amber-600 text-amber-950 shadow-amber-500/40',
  'from-slate-200 via-slate-300 to-slate-500 text-slate-800 shadow-slate-400/40',
  'from-orange-300 via-amber-600 to-orange-700 text-orange-950 shadow-orange-500/40',
]

/** Huy hiệu hạng: top 3 là huy chương kim loại có icon, còn lại là số trong vòng tròn. */
export function RankBadge({ rank }: { rank: number }) {
  if (rank >= 1 && rank <= 3) {
    const Icon = rank === 1 ? Crown : Medal
    return <span className={cn('inline-grid size-8 place-items-center rounded-full bg-gradient-to-br shadow-md', MEDAL[rank - 1])} aria-label={`Hạng ${rank}`}><Icon className="size-4" strokeWidth={2.4} /></span>
  }
  return <span className="inline-grid size-8 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground" aria-label={`Hạng ${rank}`}>{rank}</span>
}

export function WinRate({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', v >= 60 ? 'bg-emerald-500' : v >= 40 ? 'bg-primary' : 'bg-orange-500')} style={{ width: `${v}%` }} /></span>
      <span className="tabular-nums text-xs text-muted-foreground">{v}%</span>
    </span>
  )
}

export function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display truncate text-lg font-extrabold tabular-nums">{value}</p></div>
    </div>
  )
}

const PILLAR = [
  { h: 'h-44 md:h-52', grad: 'from-amber-200/90 via-amber-400/55 to-amber-600/25', edge: 'ring-amber-300/70', glow: 'shadow-[0_0_60px_-10px_rgba(251,191,36,.7)]', delay: '0.25s' },
  { h: 'h-32 md:h-36', grad: 'from-slate-100/80 via-slate-300/45 to-slate-500/20', edge: 'ring-slate-300/60', glow: 'shadow-[0_0_44px_-12px_rgba(203,213,225,.6)]', delay: '0.05s' },
  { h: 'h-24 md:h-28', grad: 'from-orange-200/80 via-orange-400/45 to-orange-700/20', edge: 'ring-orange-300/60', glow: 'shadow-[0_0_40px_-12px_rgba(251,146,60,.6)]', delay: '0.45s' },
]

export function Podium({ rows }: { rows: any[] }) {
  if (rows.length < 3) return null
  // Thứ tự hiển thị: hạng 2 – hạng 1 – hạng 3.
  const order = [{ row: rows[1], place: 2 }, { row: rows[0], place: 1 }, { row: rows[2], place: 3 }]
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-primary/20 via-card/80 to-card px-3 pt-8 md:px-10" aria-label="Top 3">
      <div className="hero-grid absolute inset-0 opacity-50" aria-hidden />
      <div className="aurora-blob pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-amber-300/25 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-3 items-end gap-2 md:gap-6">
        {order.map(({ row, place }) => {
          const style = PILLAR[place - 1]
          const name = row.bot_name || row.team_name
          return (
            <div key={row.student_id} className="flex flex-col items-center text-center">
              <div className="podium-person flex flex-col items-center" style={{ animationDelay: `calc(${style.delay} + .35s)` }}>
                {place === 1 && <Crown className="mb-1 size-8 text-amber-400 drop-shadow-[0_0_14px_rgba(251,191,36,.9)]" aria-hidden />}
                <Avatar name={name} size={place === 1 ? 'xl' : 'lg'} ring={place === 1 ? 'gold' : undefined} />
                <p className="font-display mt-2 max-w-full truncate text-sm font-extrabold md:text-lg">{name}</p>
                <p className="text-[11px] text-muted-foreground">{row.student_id}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="gradient-text font-display text-xl font-black tabular-nums md:text-2xl">{row.elo_score ?? Math.round(row.elo)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ELO</span>
                </div>
                <p className="mb-2 mt-0.5 rounded-full bg-muted/70 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{row.wins ?? 0} thắng / {row.matches_played ?? row.played ?? 0} trận</p>
              </div>
              <div className={cn('podium-pillar podium-shine relative flex w-full items-start justify-center overflow-hidden rounded-t-2xl bg-gradient-to-b ring-1 backdrop-blur-sm', style.h, style.grad, style.edge, style.glow)} style={{ animationDelay: style.delay }} aria-label={`Hạng ${place}`}>
                <span className="font-display pointer-events-none absolute -bottom-4 select-none text-[7rem] font-black leading-none text-white/20 md:text-[9rem]" aria-hidden>{place}</span>
                <span className="relative mt-3"><RankBadge rank={place} /></span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
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
      {ranking.data && ranking.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat icon={<Users className="size-5" />} label="Đội có xếp hạng" value={ranking.data.length} />
          <SummaryStat icon={<Trophy className="size-5" />} label="ELO cao nhất" value={`${ranking.data[0]?.elo_score ?? '—'} · ${ranking.data[0]?.bot_name ?? ''}`} />
          <SummaryStat icon={<Swords className="size-5" />} label="Tổng trận đã đấu" value={Math.round(ranking.data.reduce((s: number, r: any) => s + (Number(r.matches_played) || 0), 0) / 2)} />
        </div>
      )}
      {!q && ranking.data && <Podium rows={ranking.data.slice(0, 3)} />}
      <Card
        title="Bảng xếp hạng giải chính"
        subtitle="ELO tính theo từng trận Bo5 đã kết thúc ở giải chính (K=32). Mọi đội bắt đầu từ 1200, độc lập với ELO vòng loại"
        action={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm đội hoặc MSSV" aria-label="Tìm đội" className="w-56 rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>}
      >
        {ranking.loading ? <SkeletonRows rows={8} /> : slice.length ? (
          <>
            <DataTable head={['#', 'Đội', 'MSSV', 'ELO', 'Thắng / Trận', 'Tỉ lệ thắng']}>
              {slice.map((r) => {
                const own = sameStudent(r.student_id, session.student_id)
                return (
                  <tr key={r.student_id} className={cn(r.rank === 1 && 'bg-gradient-to-r from-amber-400/15 to-transparent', r.rank === 2 && 'bg-gradient-to-r from-slate-300/15 to-transparent', r.rank === 3 && 'bg-gradient-to-r from-orange-400/15 to-transparent', own && '!bg-primary/10')}>
                    <td className="w-14 px-3 py-2"><RankBadge rank={r.rank} /></td>
                    <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><Avatar name={r.bot_name} size="sm" />{r.bot_name}</span>{own && <Badge tone="accent" className="ml-2">Bạn</Badge>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.student_id}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{r.elo_score}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.matches_played}</td>
                    <td className="px-3 py-2.5"><WinRate value={r.win_rate} /></td>
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
  const items: any[] = data?.items || []

  return (
    <div className="space-y-5">
      {qualifiers.data?.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Flag className="size-4 text-primary" />Xếp hạng vòng loại · ELO cập nhật theo từng lượt ghép cặp</p>
          <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="w-64">
            {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </Select>
        </div>
      ) : null}
      {!qualifiers.loading && !qualifiers.data?.length ? <Card><EmptyState title="Chưa có vòng loại" /></Card> : ranking.loading ? <Card><SkeletonRows rows={8} /></Card> : ranking.error && !data ? <ErrorNote message={ranking.error.message} onRetry={() => void ranking.reload()} /> : items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryStat icon={<Users className="size-5" />} label="Đội trên bảng" value={data?.total ?? items.length} />
            <SummaryStat icon={<Trophy className="size-5" />} label="ELO cao nhất" value={`${Number(items[0]?.elo).toFixed(1)} · ${items[0]?.team_name ?? ''}`} />
            <SummaryStat icon={<Flame className="size-5" />} label="Vào giải chính" value={topK ? `Top ${topK}` : '—'} />
          </div>
          {page === 1 && items.length >= 3 && <Podium rows={items.slice(0, 3)} />}
          <Card icon={<Flag />} title="Bảng xếp hạng vòng loại" subtitle="Mỗi trang 50 đội; bằng ELO thì xét độ khó đối thủ">
            <DataTable head={['#', 'Đội', 'MSSV', 'ELO', 'Thắng / Trận', 'Tỉ lệ thắng', 'Lượt nghỉ', '']}>
              {items.map((r) => {
                const own = sameStudent(r.student_id, session.student_id)
                const qualified = topK > 0 && r.rank <= topK
                return (
                  <tr key={r.student_id} className={cn(r.rank === 1 && 'bg-gradient-to-r from-amber-400/15 to-transparent', r.rank === 2 && 'bg-gradient-to-r from-slate-300/15 to-transparent', r.rank === 3 && 'bg-gradient-to-r from-orange-400/15 to-transparent', own && '!bg-primary/10')}>
                    <td className="w-14 px-3 py-2"><RankBadge rank={r.rank} /></td>
                    <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><Avatar name={r.team_name} size="sm" />{r.team_name}</span>{own && <Badge tone="accent" className="ml-2">Bạn</Badge>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.student_id}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{Number(r.elo).toFixed(1)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.played}</td>
                    <td className="px-3 py-2.5"><WinRate value={r.played ? Math.round((r.wins / r.played) * 100) : 0} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{r.byes}</td>
                    <td className="px-3 py-2.5">{qualified && <Badge tone="success"><Flame className="size-3" />Vào giải chính</Badge>}</td>
                  </tr>
                )
              })}
            </DataTable>
            <Pagination page={page} pageSize={data?.page_size || 50} total={data?.total ?? items.length} onChange={setPage} />
          </Card>
        </>
      ) : <Card><EmptyState title="Chưa có kết quả" hint="Bảng xếp hạng có sau khi vòng loại bắt đầu chấm." /></Card>}
    </div>
  )
}

export function RankingView() {
  const [mode, setMode] = useState<'global' | 'qualifier'>('global')
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Thành tích" title="Xếp hạng">
        <Tabs value={mode} onChange={setMode} tabs={[{ id: 'global', label: 'Giải chính', icon: <Globe2 className="size-4" /> }, { id: 'qualifier', label: 'Vòng loại', icon: <Flag className="size-4" /> }]} />
      </SectionTitle>
      {mode === 'global' ? <GlobalRanking /> : <QualifierRanking />}
    </div>
  )
}
