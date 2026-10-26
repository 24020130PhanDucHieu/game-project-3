'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, LineChart, Scale, Sigma, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { arenaApi, type MainEloEvent } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { sameStudent, stamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Card, DataTable, EmptyState, ErrorNote, SkeletonRows, Stat } from '../../ui'
import { useLive } from '../../context'
import { RankBadge } from '../ranking'
import { fmt } from './common'

type Formula = { base: number; k: number; start: number; zero_sum?: boolean; margin?: Record<string, number> }

const expectedOf = (mine: number, opp: number) => 1 / (1 + Math.pow(10, (opp - mine) / 400))

/** Biểu đồ đường tổng quát: nhiều đường, đường tham chiếu, chấm có chú thích khi chỉ chuột vào. */
function Chart({ series, reference, referenceLabel, height = 170, testid }: {
  series: { name: string; color: string; points: { x: number; y: number; tip: string; good?: boolean }[]; dashed?: boolean }[]
  reference?: number; referenceLabel?: string; height?: number; testid?: string
}) {
  const w = 640
  const padL = 40, padR = 12, padT = 12, padB = 22
  const all = series.flatMap((s) => s.points.map((p) => p.y))
  if (reference !== undefined) all.push(reference)
  if (!all.length) return null
  let lo = Math.min(...all), hi = Math.max(...all)
  if (hi - lo < 10) { lo -= 5; hi += 5 }
  const pad = (hi - lo) * 0.12
  lo -= pad; hi += pad
  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)))
  const minX = Math.min(0, ...series.flatMap((s) => s.points.map((p) => p.x)))
  const xs = (x: number) => padL + ((x - minX) / Math.max(1e-9, maxX - minX)) * (w - padL - padR)
  const ys = (y: number) => padT + (1 - (y - lo) / (hi - lo)) * (height - padT - padB)
  const ticks = [0, 0.5, 1].map((k) => lo + (hi - lo) * k)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full rounded-xl border border-border bg-muted/20" role="img" aria-label="Biểu đồ" data-testid={testid}>
      {ticks.map((v) => <g key={v}><line x1={padL} x2={w - padR} y1={ys(v)} y2={ys(v)} stroke="currentColor" strokeOpacity="0.08" /><text x={padL - 6} y={ys(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{Math.round(v)}</text></g>)}
      {reference !== undefined && (
        <g><line x1={padL} x2={w - padR} y1={ys(reference)} y2={ys(reference)} stroke="currentColor" strokeOpacity="0.4" strokeDasharray="5 4" /><text x={w - padR} y={ys(reference) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{referenceLabel}</text></g>
      )}
      {series.map((s) => (
        <g key={s.name}>
          <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '6 5' : undefined} />
          {s.points.map((p, i) => (
            <circle key={i} cx={xs(p.x)} cy={ys(p.y)} r="4.2" fill={p.good === undefined ? s.color : p.good ? '#10b981' : '#ef4444'} stroke="var(--background)" strokeWidth="1.5"><title>{p.tip}</title></circle>
          ))}
        </g>
      ))}
    </svg>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">{items.map(([name, color]) => <li key={name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: color }} />{name}</li>)}</ul>
}

/** Thẻ giải thích: công thức bằng lời, bảng hệ số theo tỉ số, và ví dụ tính bằng số thật (trận gần nhất, hoặc ví dụ minh họa). */
function HowItWorks({ formula, last }: { formula?: Formula; last?: MainEloEvent }) {
  const k = formula?.k ?? 32
  const margin = formula?.margin || { '0': 1.3, '1': 1.15, '2': 1 }
  const ex = last
    ? { mine: last.before, opp: last.opponent_before || 1200, won: last.result === 'win', m: last.margin || 1, label: `Trận gần nhất của đội: ${last.score} trước ${last.opponent_name}` }
    : { mine: 1200, opp: 1300, won: true, m: 1, label: 'Ví dụ minh họa: đội 1200 điểm gặp đội 1300 điểm, thắng 3–2' }
  const e = expectedOf(ex.mine, ex.opp)
  const delta = k * ex.m * ((ex.won ? 1 : 0) - e)
  return (
    <Card icon={<Sigma />} title="ELO được tính thế nào?" subtitle="Ai cũng bắt đầu 1200 điểm. Thắng đối thủ mạnh được nhiều điểm, thua đối thủ yếu mất nhiều điểm">
      <div className="space-y-4 text-sm leading-relaxed" data-testid="elo-how">
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ['1. Kỳ vọng thắng', `Trước trận, máy tính xác suất đội bạn thắng dựa vào chênh lệch ELO hai đội. Chênh 400 điểm thì bên mạnh hơn kỳ vọng thắng khoảng 91%.`],
            ['2. Kết quả thật', 'Thắng trận Bo5 (3 hiệp trước) là 1, thua là 0. Chỉ kết quả cả trận mới tính, không tính riêng từng hiệp.'],
            ['3. Điểm thay đổi', `Điểm đổi = K × M × (kết quả − kỳ vọng). K = ${k} cố định. Đội thua mất đúng số điểm đội thắng nhận, nên tổng ELO không đổi.`],
          ].map(([t, b]) => <li key={t} className="rounded-xl border border-border p-3"><p className="font-semibold">{t}</p><p className="mt-1 text-xs text-muted-foreground">{b}</p></li>)}
        </ol>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Hệ số thưởng M theo tỉ số</p>
            <p className="mt-1 text-xs text-muted-foreground">Thắng đậm được thưởng thêm; thắng sát nút tính như ELO thông thường.</p>
            <table className="mt-2 w-full text-left text-xs"><tbody className="divide-y divide-border">
              {[['3–0', margin['0']], ['3–1', margin['1']], ['3–2', margin['2']]].map(([s, m]) => <tr key={String(s)}><td className="py-1.5 font-semibold">Thắng {s}</td><td className="py-1.5 tabular-nums">M = ×{String(m).replace('.', ',')}</td></tr>)}
            </tbody></table>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="elo-example">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Ví dụ tính bằng số thật</p>
            <p className="mt-1 text-xs text-muted-foreground">{ex.label}</p>
            <ul className="mt-2 space-y-1 text-xs tabular-nums">
              <li>ELO của đội: <strong>{ex.mine.toFixed(1)}</strong> · đối thủ: <strong>{ex.opp.toFixed(1)}</strong></li>
              <li>Kỳ vọng thắng = 1 ÷ (1 + 10^(({ex.opp.toFixed(0)} − {ex.mine.toFixed(0)}) ÷ 400)) = <strong>{(e * 100).toFixed(1)}%</strong></li>
              <li>Kết quả: <strong>{ex.won ? 'thắng (1)' : 'thua (0)'}</strong>, hệ số thưởng M = <strong>×{ex.m}</strong></li>
              <li>Điểm đổi = {k} × {ex.m} × ({ex.won ? 1 : 0} − {e.toFixed(3)}) = <strong className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</strong> → ELO mới <strong>{(ex.mine + delta).toFixed(1)}</strong></li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">ELO Giải AI tính riêng, không lẫn với ELO giải thường và không phụ thuộc điểm vòng loại. Trận nhường đi (không có đối thủ) không được tính.</p>
      </div>
    </Card>
  )
}

function EventsTable({ events }: { events: MainEloEvent[] }) {
  const [open, setOpen] = useState<string>('')
  const list = [...events].reverse()
  return (
    <DataTable head={['', 'Trận', 'Đối thủ', 'Kết quả', 'Kỳ vọng', 'K × M', 'ELO trước → sau', 'Thay đổi']}>
      {list.map((ev) => {
        const key = `${ev.tournament_id}:${ev.match_id}`
        const rounds = ev.rounds || []
        return (
          <Fragment key={key}>
            <tr data-testid="elo-event" className="cursor-pointer" onClick={() => rounds.length && setOpen(open === key ? '' : key)}>
              <td className="w-8 px-3 py-2.5">{rounds.length ? (open === key ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : null}</td>
              <td className="px-3 py-2.5"><span className="block font-medium">{ev.round_name}</span><span className="block text-[11px] text-muted-foreground">{ev.tournament_name} · {stamp(ev.at)}</span></td>
              <td className="px-3 py-2.5"><span className="block">{ev.opponent_name}</span><span className="text-[11px] text-muted-foreground">ELO {Number(ev.opponent_before || 0).toFixed(0)}</span></td>
              <td className="px-3 py-2.5"><Badge tone={ev.result === 'win' ? 'success' : 'danger'}>{ev.result === 'win' ? 'Thắng' : 'Thua'} {ev.score}</Badge></td>
              <td className="px-3 py-2.5 tabular-nums">{(ev.expected * 100).toFixed(0)}%</td>
              <td className="px-3 py-2.5 tabular-nums text-xs">{ev.k || 32} × {ev.margin || 1}</td>
              <td className="px-3 py-2.5 tabular-nums text-xs">{ev.before.toFixed(1)} → <strong>{ev.after.toFixed(1)}</strong></td>
              <td className={cn('px-3 py-2.5 font-semibold tabular-nums', ev.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{ev.delta >= 0 ? '+' : ''}{ev.delta.toFixed(1)}</td>
            </tr>
            {open === key && (
              <tr><td colSpan={8} className="bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold">Điểm từng hiệp của trận này</p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rounds.map((r) => (
                    <li key={r.n} className="rounded-xl border border-border bg-card/70 p-2.5 text-xs">
                      <p className="font-semibold">Hiệp {r.n}: {r.task_name || 'Đề ML'} {r.won ? <Badge tone="success" className="ml-1">Thắng</Badge> : <Badge tone="neutral" className="ml-1">Thua</Badge>}</p>
                      <p className="mt-1 tabular-nums text-muted-foreground">Đội: <strong className="text-foreground">{fmt(r.my_score)}</strong> · Đối thủ: <strong className="text-foreground">{fmt(r.opp_score)}</strong>{r.tie ? ' · hòa điểm, bốc thăm đã lưu' : ''}</p>
                    </li>
                  ))}
                </ul>
              </td></tr>
            )}
          </Fragment>
        )
      })}
    </DataTable>
  )
}

/** Điểm vòng loại theo lượt: điểm công khai, điểm riêng tư (khi được mở) và đường trung bình cộng dồn (điểm xếp hạng). */
function QualifierHistory({ mine }: { mine: any }) {
  const rounds: any[] = mine?.rounds || []
  if (!mine?.registered) return null
  if (!rounds.length) return (
    <Card icon={<LineChart />} title="Điểm vòng loại theo từng lượt chấm"><EmptyState title="Chưa có lượt nào được chấm" hint="Sau khi nộp mô hình hợp lệ và đến lượt chấm, điểm từng lượt sẽ hiện ở đây." /></Card>
  )
  const reveal = !!mine.private_visible
  const avg = (key: 'public' | 'private') => rounds.reduce<{ x: number; y: number; tip: string }[]>((acc, r, i) => {
    const sum = rounds.slice(0, i + 1).reduce((a, x) => a + Number(x[key] || 0), 0)
    acc.push({ x: r.round, y: sum / (i + 1), tip: `Trung bình ${key === 'public' ? 'công khai' : 'riêng tư'} sau lượt ${r.round}: ${(sum / (i + 1)).toFixed(1)}` })
    return acc
  }, [])
  const series = [
    { name: 'Điểm công khai mỗi lượt', color: '#38bdf8', points: rounds.map((r) => ({ x: r.round, y: Number(r.public || 0), tip: `Lượt ${r.round}: công khai ${fmt(r.public)}` })) },
    ...(reveal ? [{ name: 'Điểm riêng tư mỗi lượt (chính thức)', color: '#a78bfa', points: rounds.map((r) => ({ x: r.round, y: Number(r.private || 0), tip: `Lượt ${r.round}: riêng tư ${fmt(r.private)}` })) }, { name: 'Trung bình riêng tư cộng dồn (điểm xếp hạng)', color: '#10b981', dashed: true, points: avg('private') }] : [{ name: 'Trung bình công khai cộng dồn', color: '#10b981', dashed: true, points: avg('public') }]),
  ]
  return (
    <Card icon={<LineChart />} title="Điểm vòng loại theo từng lượt chấm" subtitle={reveal ? 'Điểm xếp hạng chính thức là trung bình điểm riêng tư của các lượt' : 'Điểm riêng tư sẽ hiện khi vòng loại kết thúc; hiện chỉ có điểm công khai'}>
      <div data-testid="qualifier-history">
        <Chart series={series} height={180} />
        <Legend items={series.map((s) => [s.name, s.color])} />
      </div>
    </Card>
  )
}

/** Tab "ELO & lịch sử" của Giải AI. */
export function EloTab({ mine }: { mine: any }) {
  const { session, role } = useLive()
  const ranking = useResource<any[]>('rk:ai', () => arenaApi.getRanking('ai').then((r) => (Array.isArray(r) ? r : [])), { ttl: 15_000, refreshMs: 30_000 })
  const rows = ranking.data || []
  const mineSid = role === 'TEAM' ? session.student_id || '' : ''
  const [picked, setPicked] = useState('')
  const sid = picked || (mineSid && rows.some((r) => sameStudent(r.student_id, mineSid)) ? mineSid : rows[0]?.student_id || mineSid)
  const hist = useResource<any>(sid ? `elo:ai:${sid}` : null, () => arenaApi.getMainEloHistory(sid, 'ai'), { ttl: 8_000, refreshMs: 30_000 })
  const data = hist.data
  const events: MainEloEvent[] = data?.events || []
  const own = !!mineSid && sameStudent(sid, mineSid)
  const points = useMemo(() => {
    const base = [{ x: 0, y: data?.start ?? 1200, tip: 'Khởi điểm 1200' }]
    return base.concat(events.map((e, i) => ({ x: i + 1, y: e.after, tip: `Sau trận ${i + 1} (${e.round_name} gặp ${e.opponent_name}): ${e.after.toFixed(1)} (${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(1)})`, good: e.result === 'win' } as any)))
  }, [events, data?.start])
  const wins = events.filter((e) => e.result === 'win').length
  const peak = events.length ? Math.max(data?.start ?? 1200, ...events.map((e) => e.after)) : data?.start ?? 1200

  return (
    <div className="space-y-6">
      <HowItWorks formula={data?.formula} last={events[events.length - 1]} />

      <Card icon={<Trophy />} title="Xếp hạng ELO giải chính AI" subtitle="Bấm vào một đội để xem lịch sử ELO của đội đó">
        {ranking.loading && !ranking.data ? <SkeletonRows rows={4} /> : ranking.error && !ranking.data ? <ErrorNote message={ranking.error.message} onRetry={() => void ranking.reload()} /> : rows.length ? (
          <DataTable head={['Hạng', 'Đội', 'ELO', 'Thắng / Trận']}>
            {rows.map((r, i) => (
              <tr key={r.student_id} data-testid="elo-rank-row" onClick={() => setPicked(r.student_id)} className={cn('cursor-pointer', sameStudent(r.student_id, sid) && '!bg-primary/10')}>
                <td className="w-14 px-3 py-2"><RankBadge rank={i + 1} /></td>
                <td className="px-3 py-2.5 font-medium">{r.bot_name}{sameStudent(r.student_id, mineSid) && <Badge tone="accent" className="ml-2">Bạn</Badge>}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums">{r.elo_score}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.matches_played}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState icon={<Trophy className="size-6" />} title="Chưa có trận nào kết thúc" hint="ELO giải chính AI xuất hiện sau trận đầu tiên." />}
      </Card>

      <Card icon={<LineChart />} title={`Lịch sử ELO${data?.team_name ? ` · ${data.team_name}` : ''}${own ? ' (đội bạn)' : ''}`} subtitle="Mỗi trận Bo5 là một lần đổi điểm; chấm xanh = thắng, chấm đỏ = thua">
        {!sid ? <EmptyState title="Chưa có đội để xem" /> : hist.loading && !data ? <SkeletonRows rows={4} /> : hist.error && !data ? <ErrorNote message={hist.error.message} onRetry={() => void hist.reload()} /> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="ELO hiện tại" value={data ? Number(data.rating).toFixed(1) : '—'} icon={<Scale className="size-3.5" />} hint={data ? `Khởi điểm ${data.start}` : undefined} />
              <Stat label="Cao nhất" value={peak.toFixed(1)} icon={<TrendingUp className="size-3.5" />} />
              <Stat label="Số trận" value={`${data?.played ?? 0}`} icon={<TrendingDown className="size-3.5" />} hint={data?.played ? `${wins} thắng · ${events.length - wins} thua` : 'Chưa đấu trận nào'} />
              <Stat label="Thay đổi từ đầu" value={data ? `${data.rating - data.start >= 0 ? '+' : ''}${(data.rating - data.start).toFixed(1)}` : '—'} tone={data && data.rating - data.start < 0 ? 'danger' : 'success'} />
            </div>
            {events.length ? (
              <>
                <Chart series={[{ name: 'ELO', color: 'var(--primary)', points }]} reference={data?.start ?? 1200} referenceLabel="khởi điểm 1200" testid="elo-chart" />
                <EventsTable events={events} />
              </>
            ) : <EmptyState icon={<LineChart className="size-6" />} title="Đội chưa đấu trận nào ở giải chính" hint="Khi có trận đầu tiên kết thúc, biểu đồ và bảng từng trận sẽ hiện ở đây." />}
          </div>
        )}
      </Card>

      {own && <QualifierHistory mine={mine} />}
    </div>
  )
}
