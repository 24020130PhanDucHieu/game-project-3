'use client'

import { useEffect, useState } from 'react'
import { ScanSearch, ShieldAlert, ShieldCheck } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Select, SkeletonRows } from '../../ui'
import { useLive } from '../../context'
import { DiffViewer } from '../../bot-insights'

function scoreTone(score: number) {
  return score >= 0.9 ? 'danger' : score >= 0.8 ? 'warning' : 'info'
}

function PairDetail({ source, id, pair, onDone }: { source: 'qualifier' | 'tournament'; id: string; pair: any; onDone: () => void }) {
  const { run, busy } = useLive()
  const [note, setNote] = useState(pair.review?.note || '')
  const codes = useResource<any>(`sim:pair:${source}:${id}:${pair.a.student_id}:${pair.b.student_id}`, () => arenaApi.getSimilarityPair(source, id, pair.a.student_id, pair.b.student_id), { ttl: 60_000 })
  const review = (status: 'CLEARED' | 'SUSPECT') => run(() => arenaApi.reviewSimilarity({ source, id, a: pair.a.student_id, b: pair.b.student_id, status, note }), status === 'SUSPECT' ? 'Đã đánh dấu nghi vấn' : 'Đã đánh dấu không vấn đề', onDone)
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">{pair.a.team_name} <span className="text-muted-foreground">({pair.a.student_id})</span> ↔ {pair.b.team_name} <span className="text-muted-foreground">({pair.b.student_id})</span></p>
      {codes.loading ? <SkeletonRows rows={4} /> : codes.error && !codes.data ? <ErrorNote message={codes.error.message} /> : codes.data && (
        <DiffViewer left={{ label: codes.data.a.team_name, code: codes.data.a.code }} right={{ label: codes.data.b.team_name, code: codes.data.b.code }} />
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Ghi chú của giám khảo" className="min-w-64 flex-1" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="VD: cùng nhóm học, đã xác minh…" />
        <Button variant="secondary" disabled={busy} onClick={() => void review('CLEARED')}><ShieldCheck className="size-4" />Không vấn đề</Button>
        <Button variant="danger" disabled={busy} onClick={() => void review('SUSPECT')}><ShieldAlert className="size-4" />Nghi vấn</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Điểm giống được tính sau khi bỏ chú thích, chuỗi và tên biến; mã mẫu dùng chung bởi nhiều đội được bỏ qua. Đây là gợi ý để con người xem xét, không phải kết luận gian lận.</p>
    </div>
  )
}

export function AntiCheatTab() {
  const { qualifiers, aiEvents, tournaments, qualifierId, tournamentId } = useLive()
  const [source, setSource] = useState<'qualifier' | 'tournament'>('qualifier')
  const [id, setId] = useState('')
  const [min, setMin] = useState(0.7)
  const [open, setOpen] = useState('')
  useEffect(() => { setId(source === 'qualifier' ? qualifierId : tournamentId); setOpen('') }, [source, qualifierId, tournamentId])
  const report = useResource<any>(id ? `sim:${source}:${id}:${min}` : null, () => arenaApi.getSimilarity(source, id, min), { ttl: 30_000 })
  const options = source === 'qualifier' ? [...(qualifiers.data || []).map((q) => [q.id, q.name]), ...(aiEvents.data || []).map((q) => [q.id, `[Giải AI] ${q.name}`])] : (tournaments.data || []).map((t) => [t.tournament_id, t.track === 'AI' ? `[Giải chính AI] ${t.name}` : t.name])

  return (
    <Card title="Chống gian lận — độ giống mã nguồn" subtitle="So sánh bài hợp lệ mới nhất của các đội ở vòng loại (kể cả vòng loại Giải AI) hoặc bài hiện tại trong các trận của giải chính. Mã mẫu mà nhiều đội cùng dùng được bỏ qua." action={<ScanSearch className="size-4 text-muted-foreground" />}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_220px] sm:items-end">
          <Select label="Nguồn" value={source} onChange={(e) => setSource(e.target.value as 'qualifier' | 'tournament')}>
            <option value="qualifier">Vòng loại</option><option value="tournament">Giải chính</option>
          </Select>
          <Select label={source === 'qualifier' ? 'Vòng loại' : 'Giải'} value={id} onChange={(e) => setId(e.target.value)}>
            {options.length ? options.map(([v, l]) => <option key={v} value={v}>{l}</option>) : <option value="">Chưa có dữ liệu</option>}
          </Select>
          <label className="text-xs font-semibold text-muted-foreground">Ngưỡng giống: {Math.round(min * 100)}%
            <input type="range" min={0.5} max={0.95} step={0.05} value={min} onChange={(e) => setMin(Number(e.target.value))} className="mt-2 w-full accent-primary" aria-label="Ngưỡng giống" />
          </label>
        </div>
        {!id ? <EmptyState icon={<ScanSearch className="size-7" />} title="Chưa chọn nguồn để kiểm tra" hint="Chọn vòng loại hoặc giải ở ô phía trên. Cần ít nhất hai đội đã nộp bài hợp lệ thì mới so sánh được." />
        : report.loading ? <SkeletonRows rows={5} /> : report.error && !report.data ? <ErrorNote message={report.error.message} onRetry={() => void report.reload()} /> : report.data && (
          <>
            <p className="text-xs text-muted-foreground">Đã so {report.data.documents} bài · {report.data.pairs.length} cặp vượt ngưỡng (tối đa 200).{report.data.documents < 2 ? ' Cần ít nhất hai bài hợp lệ để so sánh.' : ''}</p>
            {report.data.pairs.length ? (
              <DataTable head={['Đội A', 'Đội B', 'Giống', 'Bao phủ', 'Ngôn ngữ', 'Đánh giá', '']}>
                {report.data.pairs.map((p: any) => {
                  const key = `${p.a.student_id}|${p.b.student_id}`
                  return [
                    <tr key={key} className={cn(open === key && 'bg-primary/5')}>
                      <td className="px-3 py-2.5"><span className="block font-medium">{p.a.team_name}</span><span className="font-mono text-[11px] text-muted-foreground">{p.a.student_id}</span></td>
                      <td className="px-3 py-2.5"><span className="block font-medium">{p.b.team_name}</span><span className="font-mono text-[11px] text-muted-foreground">{p.b.student_id}</span></td>
                      <td className="px-3 py-2.5"><Badge tone={scoreTone(p.score)}>{Math.round(p.score * 100)}%</Badge></td>
                      <td className="px-3 py-2.5 tabular-nums text-xs">{Math.round(p.containment * 100)}%</td>
                      <td className="px-3 py-2.5 text-xs">{p.a.language}{p.a.language !== p.b.language ? ` / ${p.b.language}` : ''}</td>
                      <td className="px-3 py-2.5">{p.review ? <Badge tone={p.review.status === 'SUSPECT' ? 'danger' : 'success'}>{p.review.status === 'SUSPECT' ? 'Nghi vấn' : 'Không vấn đề'} · {p.review.by}</Badge> : <Badge>Chưa xem</Badge>}</td>
                      <td className="px-3 py-2.5 text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(open === key ? '' : key)}>{open === key ? 'Đóng' : 'So sánh'}</Button></td>
                    </tr>,
                    open === key && (
                      <tr key={`${key}-detail`}><td colSpan={7} className="p-3"><PairDetail source={source} id={id} pair={p} onDone={() => invalidate('sim:')} /></td></tr>
                    ),
                  ]
                })}
              </DataTable>
            ) : <EmptyState icon={<ShieldCheck className="size-7" />} title="Không có cặp nào vượt ngưỡng" hint="Thử hạ ngưỡng để xem các cặp giống ít hơn." />}
          </>
        )}
      </div>
    </Card>
  )
}
