'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, LineChart, Scale, Sigma, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { arenaApi, type MainEloEvent } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { sameStudent, stamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCountUp, useReducedMotion } from '@/lib/motion'
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

const OUTCOMES = [
  { id: 'w0', label: 'Thắng 3–0', won: true, loser: 0 },
  { id: 'w1', label: 'Thắng 3–1', won: true, loser: 1 },
  { id: 'w2', label: 'Thắng 3–2', won: true, loser: 2 },
  { id: 'l2', label: 'Thua 2–3', won: false, loser: 2 },
  { id: 'l1', label: 'Thua 1–3', won: false, loser: 1 },
  { id: 'l0', label: 'Thua 0–3', won: false, loser: 0 },
] as const

const vi = (n: number, d = 1) => n.toFixed(d).replace('.', ',')

/** Máy tính ELO tương tác: kéo thanh trượt, chọn kết quả, thấy ngay xác suất kỳ vọng, điểm đổi và công thức điền số. */
function HowItWorks({ formula, last }: { formula?: Formula; last?: MainEloEvent }) {
  const reduced = useReducedMotion()
  const k = formula?.k ?? 32
  const margin = formula?.margin || { '0': 1.3, '1': 1.15, '2': 1 }
  const seed = last ? { mine: Math.round(last.before), opp: Math.round(last.opponent_before || 1200), outcome: (last.result === 'win' ? 'w' : 'l') + String(Math.min(2, Math.max(0, Number(last.score?.split(':')[last.result === 'win' ? 1 : 0]) || 0))) } : { mine: 1200, opp: 1300, outcome: 'w2' }
  const [mine, setMine] = useState(seed.mine)
  const [opp, setOpp] = useState(seed.opp)
  const [outcome, setOutcome] = useState<string>(seed.outcome)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('arena.elo.how') !== 'closed' } catch { return true } })
  const toggle = () => setOpen((v) => { try { localStorage.setItem('arena.elo.how', v ? 'closed' : 'open') } catch { /* bỏ qua */ } return !v })
  const o = OUTCOMES.find((x) => x.id === outcome) || OUTCOMES[2]
  const e = expectedOf(mine, opp)
  const m = Number(margin[String(o.loser)] ?? 1)
  const delta = k * m * ((o.won ? 1 : 0) - e)
  const shownE = useCountUp(e * 100, reduced, 450)
  const shownDelta = useCountUp(delta, reduced, 450)
  const next = mine + delta
  const up = delta >= 0
  return (
    <Card icon={<Sigma />} title="ELO được tính thế nào?" subtitle="Thử kéo thanh trượt và chọn kết quả: số liệu bên phải đổi ngay"
      action={<button type="button" onClick={toggle} className="text-xs font-semibold text-primary hover:underline" aria-expanded={open}>{open ? 'Thu gọn' : 'Mở ra'}</button>}>
      {open && (
        <div className="space-y-5" data-testid="elo-how">
          <p className="text-sm leading-relaxed text-muted-foreground">Ai cũng bắt đầu <strong className="text-foreground">1200</strong> điểm. Thắng đối thủ <strong className="text-foreground">mạnh hơn</strong> được nhiều điểm; thua đối thủ <strong className="text-foreground">yếu hơn</strong> mất nhiều điểm. Mỗi trận Bo5 đổi điểm một lần, đội thua mất đúng số điểm đội thắng nhận nên <strong className="text-foreground">tổng ELO không đổi</strong>.</p>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
              {([['ELO của đội bạn', mine, setMine, 'var(--primary)'], ['ELO của đối thủ', opp, setOpp, '#f59e0b']] as const).map(([label, value, set, color]) => (
                <label key={label} className="block text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center justify-between"><span>{label}</span><span className="font-display text-lg font-extrabold tabular-nums text-foreground">{value}</span></span>
                  <input type="range" min={800} max={1800} step={5} value={value} onChange={(ev) => set(Number(ev.target.value))} className="mt-1 w-full" style={{ accentColor: color }} aria-label={label} data-testid={label.includes('bạn') ? 'elo-mine' : 'elo-opp'} />
                </label>
              ))}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Kết quả trận Bo5</p>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Kết quả trận">
                  {OUTCOMES.map((x) => (
                    <button key={x.id} type="button" role="radio" aria-checked={outcome === x.id} onClick={() => setOutcome(x.id)} data-testid={`elo-out-${x.id}`}
                      className={cn('rounded-xl border px-2 py-2 text-xs font-bold transition-all duration-150 active:scale-95', outcome === x.id ? (x.won ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300') : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40')}>
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
              {last && <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => { setMine(seed.mine); setOpp(seed.opp); setOutcome(seed.outcome) }}>Dùng số của trận gần nhất của đội</button>}
            </div>

            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="elo-example" aria-live="polite">
              <p className="text-xs font-semibold text-muted-foreground">1 · Kỳ vọng thắng của đội bạn</p>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="bar-fill h-full rounded-full transition-[width] duration-500" style={{ width: `${e * 100}%` }} /></div>
                <span className="font-display w-16 text-right text-xl font-extrabold tabular-nums">{vi(shownE, 0)}%</span>
              </div>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">2 · Điểm thay đổi</p>
              <p className={cn('font-display text-5xl font-black tabular-nums transition-colors', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} data-testid="elo-delta">{up ? '+' : ''}{vi(shownDelta)}</p>
              <p className="mt-1 flex items-center gap-2 text-sm tabular-nums"><span className="text-muted-foreground">ELO mới:</span><strong>{vi(mine, 0)}</strong><span className="text-muted-foreground">→</span><strong className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{vi(next)}</strong></p>
              <div className="mt-3 space-y-1 rounded-xl bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed tabular-nums">
                <p><span className="text-muted-foreground">Kỳ vọng E = 1 ÷ (1 + 10^((</span><span className="text-amber-600 dark:text-amber-300">{opp}</span><span className="text-muted-foreground"> − </span><span className="text-primary">{mine}</span><span className="text-muted-foreground">) ÷ 400))</span> = <strong>{vi(e, 3)}</strong></p>
                <p><span className="text-muted-foreground">Điểm đổi = K × M × (kết quả − E)</span></p>
                <p>= <span title="K cố định">{k}</span> × <span title="Hệ số theo tỉ số" className="text-fuchsia-600 dark:text-fuchsia-300">{vi(m, 2)}</span> × (<span title="Thắng = 1, thua = 0">{o.won ? 1 : 0}</span> − {vi(e, 3)}) = <strong className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{up ? '+' : ''}{vi(delta, 2)}</strong></p>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">K = {k} (cố định) · M là hệ số thưởng theo tỉ số hiệp (xem bên dưới).</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="elo-margins">
            <span className="font-semibold text-muted-foreground">Hệ số thưởng M cho đội thắng:</span>
            {[['3–0', margin['0']], ['3–1', margin['1']], ['3–2', margin['2']]].map(([sc, mm]) => <span key={String(sc)} className="rounded-full border border-border bg-card/60 px-2.5 py-1 font-bold tabular-nums">{sc} <span className="text-fuchsia-600 dark:text-fuchsia-300">×{vi(Number(mm), 2)}</span></span>)}
            <span className="text-muted-foreground">· Thắng sát nút tính như ELO thông thường.</span>
          </div>
          <p className="text-xs text-muted-foreground">ELO Giải AI tính riêng, không lẫn ELO giải thường và không phụ thuộc điểm vòng loại. Trận nhường đi (không có đối thủ) không tính.</p>
        </div>
      )}
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
