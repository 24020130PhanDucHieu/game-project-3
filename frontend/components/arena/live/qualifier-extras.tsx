'use client'

import { useMemo, useState } from 'react'
import { Ban, Code2, Download, FileClock, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { stamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SkeletonRows, StatusBadge } from './ui'
import { useLive } from './context'
import { CodeViewer, Overlay } from './replay-viewer'

/** Một dòng lịch sử điểm đã chuẩn hoá theo góc nhìn của một đội. */
export type ScoreRow = { key: string; round: number; opponent: string; outcome: 'WIN' | 'LOSS' | 'BYE' | 'PENDING' | 'ERROR'; before: number; after: number; reason?: string }

/** Chuyển các trận vòng loại (Job) thành lịch sử điểm của đội `sid`. */
export function scoreRows(jobs: any[], sid: string, names: Record<string, string> = {}): ScoreRow[] {
  const me = String(sid || '').toUpperCase()
  return jobs
    .filter((j) => String(j.a).toUpperCase() === me || String(j.b).toUpperCase() === me)
    .map((j) => {
      const isA = String(j.a).toUpperCase() === me
      const other = isA ? j.b : j.a
      const before = Number(isA ? j.before_a : j.before_b) || 0
      const after = Number(isA ? j.after_a : j.after_b) || before
      const done = j.status === 'DONE' || j.status === 'COMPLETED'
      const winnerSide = j.winner === 'team_a' || j.winner === j.a ? 'a' : j.winner === 'team_b' || j.winner === j.b ? 'b' : ''
      const outcome: ScoreRow['outcome'] = !other ? 'BYE' : j.error && !done ? 'ERROR' : !done ? 'PENDING' : (winnerSide === 'a') === isA ? 'WIN' : 'LOSS'
      return { key: String(j.id), round: Number(j.round) || 0, opponent: other ? names[other] || j[isA ? 'b_name' : 'a_name'] || other : 'Lượt nghỉ', outcome, before, after, reason: j.reason || j.error }
    })
    .sort((a, b) => a.round - b.round)
}

function Spark({ rows }: { rows: ScoreRow[] }) {
  const points = rows.filter((r) => r.outcome === 'WIN' || r.outcome === 'LOSS')
  if (points.length < 2) return null
  const values = [points[0].before, ...points.map((p) => p.after)]
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const d = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - min) / span) * 32}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <figure className="rounded-xl border border-border bg-muted/30 p-3" aria-label="Biểu đồ ELO">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>ELO qua các lượt</span><span className="tabular-nums">{values[0].toFixed(0)} → <strong className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{values[values.length - 1].toFixed(0)}</strong></span></div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-16 w-full">
        <polyline points={d} fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className={up ? 'stroke-emerald-500' : 'stroke-red-500'} />
      </svg>
    </figure>
  )
}

const OUTCOME: Record<ScoreRow['outcome'], { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  WIN: { label: 'Thắng', tone: 'success' }, LOSS: { label: 'Thua', tone: 'danger' }, BYE: { label: 'Nghỉ', tone: 'neutral' }, PENDING: { label: 'Đang chấm', tone: 'warning' }, ERROR: { label: 'Lỗi chấm', tone: 'danger' },
}

/** Bảng lịch sử tính điểm: đối thủ, kết quả, ELO trước → sau và chênh lệch. */
export function ScoreHistoryTable({ rows }: { rows: ScoreRow[] }) {
  if (!rows.length) return <EmptyState icon={<FileClock className="size-6" />} title="Chưa có trận nào được chấm" hint="Lịch sử điểm hiện sau lượt ghép cặp đầu tiên." />
  return (
    <div className="space-y-3">
      <Spark rows={rows} />
      <DataTable head={['Lượt', 'Đối thủ', 'Kết quả', 'ELO trước', 'ELO sau', '±', 'Ghi chú']}>
        {rows.map((r) => {
          const delta = r.after - r.before
          return (
            <tr key={r.key}>
              <td className="px-3 py-2.5 tabular-nums">{r.round}</td>
              <td className="px-3 py-2.5 font-medium">{r.opponent}</td>
              <td className="px-3 py-2.5"><Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge></td>
              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.before ? r.before.toFixed(1) : '—'}</td>
              <td className="px-3 py-2.5 tabular-nums">{r.after ? r.after.toFixed(1) : '—'}</td>
              <td className={cn('px-3 py-2.5 tabular-nums font-semibold', delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                <span className="inline-flex items-center gap-1">{delta > 0 ? <TrendingUp className="size-3.5" /> : delta < 0 ? <TrendingDown className="size-3.5" /> : null}{delta > 0 ? '+' : ''}{delta.toFixed(1)}</span>
              </td>
              <td className="max-w-xs truncate px-3 py-2.5 text-xs text-muted-foreground" title={r.reason}>{r.reason || '—'}</td>
            </tr>
          )
        })}
      </DataTable>
    </div>
  )
}

/** Admin: toàn bộ trận đã chấm của vòng loại, lọc theo đội và xuất CSV. */
export function AdminScoreHistory({ qid }: { qid: string }) {
  const results = useResource(`q:results:${qid}`, () => arenaApi.getQualifierResults(qid), { ttl: 15_000, refreshMs: 30_000 })
  const [q, setQ] = useState('')
  const items: any[] = results.data?.items || []
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? items.filter((j) => `${j.a} ${j.b} ${j.a_name} ${j.b_name}`.toLowerCase().includes(needle)) : items
  }, [items, q])
  const exportCsv = () => downloadCsv(`lich-su-diem-${dateStamp()}.csv`, ['luot', 'doi_a', 'elo_a_truoc', 'elo_a_sau', 'doi_b', 'elo_b_truoc', 'elo_b_sau', 'doi_thang', 'ly_do'],
    filtered.map((j) => [j.round, `${j.a_name || ''} (${j.a})`, j.before_a, j.after_a, `${j.b_name || ''} (${j.b})`, j.before_b, j.after_b, j.winner === 'team_a' ? j.a : j.winner === 'team_b' ? j.b : j.winner || '', j.reason || j.error || '']))
  return (
    <Card title="Lịch sử tính điểm" subtitle="Mọi trận vòng loại đã chấm: ELO trước và sau của hai đội" action={<div className="flex gap-2"><Field aria-label="Lọc theo đội" placeholder="Lọc MSSV / tên đội" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" /><Button size="sm" variant="secondary" disabled={!filtered.length} onClick={exportCsv}><Download className="size-3.5" />CSV</Button></div>}>
      {results.loading ? <SkeletonRows rows={5} /> : results.error && !results.data ? <ErrorNote message={results.error.message} onRetry={() => void results.reload()} /> : filtered.length ? (
        <DataTable head={['Lượt', 'Đội Đỏ', 'ELO', 'Đội Xanh', 'ELO', 'Kết quả']}>
          {filtered.slice(0, 300).map((j) => {
            const da = Number(j.after_a) - Number(j.before_a), db = Number(j.after_b) - Number(j.before_b)
            const winA = j.winner === 'team_a' || j.winner === j.a
            const done = j.status === 'DONE' || j.status === 'COMPLETED'
            return (
              <tr key={j.id}>
                <td className="px-3 py-2.5 tabular-nums">{j.round}</td>
                <td className={cn('px-3 py-2.5', done && winA && 'font-semibold')}>{j.a_name || j.a}<span className="block font-mono text-[11px] text-muted-foreground">{j.a}</span></td>
                <td className="px-3 py-2.5 tabular-nums text-xs">{Number(j.before_a).toFixed(0)} → {Number(j.after_a).toFixed(0)} <span className={da >= 0 ? 'text-emerald-600' : 'text-red-600'}>({da >= 0 ? '+' : ''}{da.toFixed(1)})</span></td>
                <td className={cn('px-3 py-2.5', done && !winA && 'font-semibold')}>{j.b_name || j.b || 'Lượt nghỉ'}<span className="block font-mono text-[11px] text-muted-foreground">{j.b}</span></td>
                <td className="px-3 py-2.5 tabular-nums text-xs">{j.b ? <>{Number(j.before_b).toFixed(0)} → {Number(j.after_b).toFixed(0)} <span className={db >= 0 ? 'text-emerald-600' : 'text-red-600'}>({db >= 0 ? '+' : ''}{db.toFixed(1)})</span></> : '—'}</td>
                <td className="px-3 py-2.5">{done ? <Badge tone="success">{winA ? j.a_name || j.a : j.b_name || j.b} thắng</Badge> : <StatusBadge status={j.status} />}</td>
              </tr>
            )
          })}
        </DataTable>
      ) : <EmptyState icon={<FileClock className="size-6" />} title="Chưa có trận nào được chấm" />}
    </Card>
  )
}

/** Admin: lịch sử bài nộp của một đội trong vòng loại (xem mã từng bản). */
export function TeamSubmissionsOverlay({ qid, team, onClose }: { qid: string; team: { student_id: string; team_name: string }; onClose: () => void }) {
  const detail = useResource<any>(`q:detail:admin:${qid}:${team.student_id}`, () => arenaApi.getQualifier(qid, team.student_id), { ttl: 10_000 })
  const history: any[] = detail.data?.history || []
  const results: any[] = detail.data?.results || []
  const [viewing, setViewing] = useState<any>(null)
  return (
    <Overlay title={`Bài nộp · ${team.team_name}`} subtitle={`MSSV ${team.student_id} · ${history.length} bản`} onClose={onClose}>
      {detail.loading ? <SkeletonRows rows={5} /> : detail.error ? <ErrorNote message={detail.error.message} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Lịch sử mã nguồn">
            {history.length ? (
              <ol className="space-y-2">
                {history.map((h, i) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="grid size-7 place-items-center rounded-lg bg-muted text-xs font-bold tabular-nums">{history.length - i}</span>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{stamp(h.at)}</span><span className="text-xs text-muted-foreground">{h.language} · <code>{String(h.id).slice(0, 10)}</code>{h.git_commit_hash ? ` · commit ${String(h.git_commit_hash).slice(0, 7)}` : ''}</span></span>
                    <StatusBadge status={h.status || (h.valid ? 'VALID' : 'INVALID')} />
                    {h.code && <Button size="sm" variant="secondary" onClick={() => setViewing({ ...h, team_name: team.team_name, submitted_at: h.at })}><Code2 className="size-3.5" />Xem mã</Button>}
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="Đội chưa nộp bài" />}
          </Card>
          <Card title="Lịch sử tính điểm"><ScoreHistoryTable rows={scoreRows(results, team.student_id)} /></Card>
        </div>
      )}
      {viewing && <CodeViewer submission={viewing} onClose={() => setViewing(null)} />}
    </Overlay>
  )
}

/** Hộp xác nhận loại đội: bắt buộc ghi lý do (hiện cho đội khi họ nộp bài). */
export function BanDialog({ qid, team, onClose }: { qid: string; team: { student_id: string; team_name: string; banned?: boolean }; onClose: () => void }) {
  const { run, busy } = useLive()
  const [reason, setReason] = useState('')
  const unban = !!team.banned
  return (
    <Overlay title={unban ? `Bỏ loại ${team.team_name}?` : `Loại ${team.team_name} khỏi vòng loại?`} subtitle={`MSSV ${team.student_id}`} onClose={onClose}>
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-sm text-muted-foreground">{unban ? 'Đội sẽ được ghép cặp và xếp hạng lại từ lượt tiếp theo.' : 'Đội không được ghép cặp, không có tên trên bảng xếp hạng và không nộp thêm bài được. Lịch sử bài nộp và kết quả cũ vẫn giữ để đối chiếu. Thao tác được ghi vào nhật ký quản trị.'}</p>
        {!unban && <Field label="Lý do (đội sẽ thấy lý do này)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: mã nguồn trùng với đội khác" maxLength={300} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button variant={unban ? 'primary' : 'danger'} disabled={busy || (!unban && !reason.trim())} onClick={() => void run(() => arenaApi.setQualifierBan(qid, team.student_id, !unban, reason.trim()), unban ? 'Đã bỏ loại đội' : 'Đã loại đội khỏi vòng loại', () => { invalidate('q:'); onClose() })}>
            {unban ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />}{unban ? 'Bỏ loại' : 'Loại đội'}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}
