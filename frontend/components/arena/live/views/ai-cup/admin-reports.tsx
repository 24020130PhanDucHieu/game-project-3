'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, Eye, EyeOff, Plus, Trophy } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { fromLocalInput, shortTime, toLocalInput } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Select, SkeletonRows, TextArea } from '../../ui'
import { useLive } from '../../context'
import { fmt, useAiTournaments } from './common'
import { AdminMainTasks } from './main-tasks-admin'

function CreateMain({ onCreated }: { onCreated: (id: string) => void }) {
  const { run, tournaments, busy } = useLive()
  const [name, setName] = useState('')
  const [size, setSize] = useState('8')
  const [mode, setMode] = useState('TASK')
  return (
    <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1.4fr_auto] sm:items-end" onSubmit={(e) => {
      e.preventDefault()
      void run(async () => {
        const created: any = await arenaApi.createTournament({ name: name.trim(), num_teams: Number(size), track: 'AI', mode: mode === 'TASK' ? 'TASK' : '' })
        const id = created?.tournament_id || created?.tournament?.tournament_id
        invalidate('tl')
        await tournaments.reload()
        if (id) onCreated(id)
        setName('')
      }, `Đã tạo giải chính AI “${name.trim()}”`)
    }}>
      <Field label="Tên giải chính AI" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} data-testid="ai-main-create-name" />
      <Select label="Số đội (bằng Top K)" value={size} onChange={(e) => setSize(e.target.value)}>{[4, 8, 16, 32].map((n) => <option key={n} value={n}>{n} đội</option>)}</Select>
      <Select label="Dạng hiệp đấu" value={mode} onChange={(e) => setMode(e.target.value)}><option value="TASK">Đề ML bốc từ kho</option><option value="BOARD">Bàn cờ 9×9</option></Select>
      <Button type="submit" disabled={busy || !name.trim()} data-testid="ai-main-create"><Plus className="size-4" />Tạo giải chính AI</Button>
    </form>
  )
}

function ScoreForm({ tid, row, criteria, locked, onDone }: { tid: string; row: any; criteria: any[]; locked: boolean; onDone: () => void }) {
  const { run, busy } = useLive()
  const [scores, setScores] = useState<string[]>(() => criteria.map((_, i) => String(row.mine?.scores?.[i] ?? '')))
  const [comment, setComment] = useState(row.mine?.comment || '')
  const valid = scores.every((s) => s !== '' && Number.isInteger(Number(s)) && Number(s) >= 0 && Number(s) <= 10)
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      {row.report ? (
        <>
          <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-3 text-sm" data-testid="ai-admin-report-text">{row.report.summary}</div>
          {row.report.repo_url && <p className="text-xs">Kho mã: <a href={row.report.repo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{row.report.repo_url}</a></p>}
        </>
      ) : <p className="text-sm text-muted-foreground">Đội chưa nộp báo cáo.</p>}
      {row.report && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {criteria.map((c, i) => (
              <Field key={c.id} label={`${c.name} (0–10)`} type="number" min={0} max={10} step={1} value={scores[i]} disabled={locked} onChange={(e) => setScores(scores.map((s, k) => (k === i ? e.target.value : s)))} data-testid={`ai-score-${c.id}`} />
            ))}
          </div>
          <TextArea label="Nhận xét (đội sẽ thấy sau khi công bố, không kèm tên giám khảo)" rows={3} maxLength={1000} value={comment} disabled={locked} onChange={(e) => setComment(e.target.value)} data-testid="ai-score-comment" />
          <Button disabled={busy || locked || !valid} onClick={() => void run(() => arenaApi.scoreAiMainReport(tid, row.student_id, { scores: scores.map(Number), comment }), 'Đã lưu điểm', () => { invalidate('ai:'); onDone() })} data-testid="ai-score-save"><ClipboardCheck className="size-4" />Lưu điểm của tôi</Button>
          {locked && <p className="text-xs text-muted-foreground">Điểm đã công bố; hủy công bố để sửa.</p>}
        </>
      )}
    </div>
  )
}

export function AdminAiReports() {
  const { run, confirm, busy } = useLive()
  const { list, id, setId } = useAiTournaments()
  const detail = useResource<any>(id ? `t:ai:admin-detail:${id}` : null, () => arenaApi.getTournament(id), { ttl: 8_000, refreshMs: 20_000 })
  const data = useResource<any>(id ? `ai:admin-reports:${id}` : null, () => arenaApi.getAiMainReports(id), { ttl: 5_000, refreshMs: 15_000 })
  const [deadline, setDeadline] = useState('')
  const [open, setOpen] = useState('')
  const cfg = data.data?.config
  useEffect(() => { setDeadline(cfg?.deadline ? toLocalInput(cfg.deadline) : '') }, [cfg?.deadline, id])
  const criteria: any[] = data.data?.criteria || []
  const items: any[] = data.data?.items || []
  const save = (published: boolean) => run(() => arenaApi.configAiMainReport(id, { deadline: deadline ? fromLocalInput(deadline) : 0, published }), published ? 'Đã công bố điểm báo cáo' : 'Đã cập nhật cấu hình báo cáo', () => { invalidate('ai:'); invalidate('certs'); invalidate('rk') })
  return (
    <Card icon={<Trophy />} title="Giải chính AI và báo cáo kỹ thuật" subtitle="Tạo giải chính cho Top K của vòng loại AI, đặt hạn báo cáo, chấm rubric và công bố điểm">
      <div className="space-y-6">
        <CreateMain onCreated={setId} />
        {!list.length ? <EmptyState title="Chưa có giải chính AI" hint="Tạo giải chính rồi dùng “Chốt đội” ở vòng loại AI để nạp Top K vào giải." /> : (
          <div className="space-y-5">
            <Select label="Giải chính AI" value={id} onChange={(e) => setId(e.target.value)} className="max-w-md">{list.map((x) => <option key={x.tournament_id} value={x.tournament_id}>{x.name}</option>)}</Select>
            {detail.data?.round_mode === 'TASK' && <AdminMainTasks tid={id} />}
            {data.loading && !data.data ? <SkeletonRows rows={4} /> : data.error && !data.data ? <ErrorNote message={data.error.message} onRetry={() => void data.reload()} /> : (
              <>
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
                  <Field label="Hạn nộp báo cáo (để trống = không giới hạn)" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="min-w-64" disabled={cfg?.published} data-testid="ai-report-deadline" />
                  <Button variant="secondary" disabled={busy || cfg?.published} onClick={() => void save(false)} data-testid="ai-report-config-save">Lưu hạn</Button>
                  {cfg?.published
                    ? <Button variant="secondary" disabled={busy} onClick={async () => { if (await confirm({ title: 'Hủy công bố điểm?', message: 'Các đội sẽ không còn thấy điểm báo cáo cho tới khi công bố lại. Giấy chứng nhận Giải Kỹ thuật đã phát (nếu có) vẫn giữ nguyên.', confirmLabel: 'Hủy công bố' })) void save(false) }}><EyeOff className="size-4" />Hủy công bố</Button>
                    : <Button disabled={busy} onClick={async () => { if (await confirm({ title: 'Công bố điểm báo cáo?', message: 'Các đội thấy điểm và nhận xét; đội cao nhất nhận Giải Kỹ thuật cùng giấy chứng nhận. Sau đó không sửa điểm được nữa trừ khi hủy công bố.', confirmLabel: 'Công bố' })) void save(true) }} data-testid="ai-report-publish"><Eye className="size-4" />Công bố điểm</Button>}
                  <Badge tone={cfg?.published ? 'success' : 'warning'}>{cfg?.published ? `Đã công bố ${shortTime(cfg.published_at)}` : 'Chưa công bố'}</Badge>
                </div>
                <DataTable head={['Đội', 'Báo cáo', 'Điểm của bạn /50', 'Trung bình /50', 'Giám khảo', '']}>
                  {items.map((r) => [
                    <tr key={r.student_id} data-testid="ai-admin-report-row">
                      <td className="px-3 py-2.5 font-medium">{r.team_name}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.student_id}</span></td>
                      <td className="px-3 py-2.5">{r.report ? <Badge tone="success">Đã nộp</Badge> : <Badge>Chưa nộp</Badge>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.mine ? r.mine.scores.reduce((a: number, b: number) => a + b, 0) : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.judges ? fmt(r.score, 1) : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.judges}</td>
                      <td className="px-3 py-2.5 text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(open === r.student_id ? '' : r.student_id)} data-testid="ai-admin-report-open">{open === r.student_id ? 'Đóng' : r.report ? 'Đọc và chấm' : 'Xem'}</Button></td>
                    </tr>,
                    open === r.student_id && <tr key={`${r.student_id}-d`}><td colSpan={6} className="p-3"><ScoreForm tid={id} row={r} criteria={criteria} locked={!!cfg?.published} onDone={() => void data.reload()} /></td></tr>,
                  ])}
                </DataTable>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
