'use client'

import { useEffect, useState } from 'react'
import { Award, CalendarClock, FileText, Lock, Medal, Save, ShieldCheck } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { shortTime, sameStudent } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Select, SkeletonRows, TextArea } from '../../ui'
import { useLive } from '../../context'
import { RankBadge } from '../ranking'
import { fmt, useAiTournaments } from './common'

/** Thanh điểm tiêu chí 0–10. */
export function CriterionBar({ name, value }: { name: string; value: number }) {
  const v = Math.max(0, Math.min(10, Number(value) || 0))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs"><span className="truncate">{name}</span><span className="tabular-nums font-semibold">{fmt(v, 1)}/10</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${v * 10}%` }} /></div>
    </div>
  )
}

function Rubric({ criteria }: { criteria: any[] }) {
  return (
    <Card icon={<ShieldCheck />} title="Tiêu chí chấm" subtitle="Giám khảo chấm 5 tiêu chí, mỗi tiêu chí 0–10; điểm kỹ thuật là trung bình điểm tổng (tối đa 50) của các giám khảo">
      <ul className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        {criteria.map((c) => <li key={c.id} className="rounded-xl border border-border p-3"><p className="font-semibold">{c.name}</p><p className="mt-1 text-xs text-muted-foreground">{c.hint}</p></li>)}
      </ul>
    </Card>
  )
}

function ReportForm({ tid, data, reload }: { tid: string; data: any; reload: () => void }) {
  const { run } = useLive()
  const [summary, setSummary] = useState('')
  const [repo, setRepo] = useState('')
  useEffect(() => { setSummary(data.report?.summary || ''); setRepo(data.report?.repo_url || '') }, [data.report?.summary, data.report?.repo_url, tid])
  const cfg = data.config || {}
  const now = Date.now() / 1000
  const closed = !!cfg.published || (cfg.deadline > 0 && now >= cfg.deadline)
  const len = [...summary].length
  const { min, max } = data.limits
  return (
    <Card icon={<FileText />} title="Báo cáo kỹ thuật của đội" subtitle="Nêu kỹ thuật, dữ liệu huấn luyện, cách đánh giá, hạn chế và các lưu ý đạo đức"
      action={data.report ? <Badge tone="success">Đã nộp · {shortTime(data.report.updated_at)}</Badge> : <Badge tone="warning">Chưa nộp</Badge>}>
      <div className="space-y-3">
        <TextArea label={`Nội dung báo cáo (${min}–${max} ký tự)`} rows={12} value={summary} maxLength={max} disabled={closed} onChange={(e) => setSummary(e.target.value)} data-testid="ai-report-text"
          placeholder={'1. Ý tưởng và kỹ thuật\n2. Dữ liệu và cách huấn luyện\n3. Cách đánh giá (trên dữ liệu chưa thấy)\n4. Điểm yếu đã biết\n5. Cách tái lập kết quả'} />
        <p className={`text-xs tabular-nums ${len < min ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`} data-testid="ai-report-count">{len} / {max} ký tự{len < min ? ` · cần thêm ${min - len}` : ''}</p>
        <Field label="Liên kết kho mã (tùy chọn)" placeholder="https://github.com/…" value={repo} maxLength={300} disabled={closed} onChange={(e) => setRepo(e.target.value)} data-testid="ai-report-repo" />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={closed || len < min} onClick={() => void run(() => arenaApi.saveAiMainReport(tid, { summary, repo_url: repo }), 'Đã lưu báo cáo kỹ thuật', () => { invalidate('ai:'); reload() })} data-testid="ai-report-save"><Save className="size-4" />Lưu báo cáo</Button>
          {!closed && len < min && <span className="text-xs text-amber-700 dark:text-amber-300">Chưa lưu được: cần thêm {min - len} ký tự.</span>}
          {closed && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{cfg.published ? 'Điểm đã công bố nên báo cáo bị khóa.' : 'Đã hết hạn nộp báo cáo.'}</span>}
          {!closed && cfg.deadline > 0 && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />Hạn nộp {shortTime(cfg.deadline)}. Có thể sửa lại đến hạn.</span>}
        </div>
      </div>
    </Card>
  )
}

function Feedback({ feedback, criteria }: { feedback: any; criteria: any[] }) {
  return (
    <Card icon={<Award />} title="Điểm và nhận xét của giám khảo" subtitle={`${feedback.judges} giám khảo đã chấm`}>
      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <div className="rounded-xl bg-primary/10 p-4 text-center"><p className="text-xs text-muted-foreground">Điểm kỹ thuật</p><p className="font-display text-4xl font-black tabular-nums" data-testid="ai-feedback-score">{fmt(feedback.score, 1)}</p><p className="text-xs text-muted-foreground">trên 50</p></div>
        <div className="grid gap-3 sm:grid-cols-2">{criteria.map((c, i) => <CriterionBar key={c.id} name={c.name} value={feedback.criteria?.[i] ?? 0} />)}</div>
      </div>
      {feedback.comments?.length > 0 && <ul className="mt-4 space-y-2 text-sm">{feedback.comments.map((m: string, i: number) => <li key={i} className="rounded-xl border border-border bg-muted/30 p-3">{m}</li>)}</ul>}
    </Card>
  )
}

export function ReportTab() {
  const { role, session } = useLive()
  const { list, id, setId, current } = useAiTournaments()
  const mine = useResource<any>(id ? `ai:report:${role}:${session.student_id || ''}:${id}` : null, () => arenaApi.getAiMainReport(id), { ttl: 5_000, refreshMs: 20_000 })
  const board = useResource<any>(id ? `ai:scoreboard:${id}` : null, () => arenaApi.getAiMainScoreboard(id), { ttl: 8_000, refreshMs: 20_000 })
  if (mine.error && !mine.data && role === 'TEAM') return <ErrorNote message={mine.error.message} onRetry={() => void mine.reload()} />
  if (!list.length) return <Card><EmptyState icon={<FileText className="size-7" />} title="Chưa có giải chính AI" hint="Báo cáo kỹ thuật được nộp ở giải chính AI, sau khi vòng loại AI chốt đội." /></Card>
  const data = mine.data
  const criteria: any[] = data?.criteria || board.data?.criteria || []
  const rows: any[] = board.data?.items || []
  return (
    <div className="space-y-6">
      {list.length > 1 && <Select aria-label="Chọn giải chính AI" value={id} onChange={(e) => setId(e.target.value)} className="w-full sm:w-72">{list.map((x) => <option key={x.tournament_id} value={x.tournament_id}>{x.name}</option>)}</Select>}
      {data && criteria.length > 0 && <Rubric criteria={criteria} />}
      {role === 'TEAM' && data && (data.eligible ? <ReportForm tid={id} data={data} reload={() => void mine.reload()} /> : (
        <Card><EmptyState icon={<FileText className="size-6" />} title="Đội bạn không thi đấu ở giải chính AI này" hint={`Chỉ các đội được chốt từ vòng loại AI vào “${current?.name || 'giải chính AI'}” mới nộp báo cáo.`} /></Card>
      ))}
      {role === 'TEAM' && data?.feedback && <Feedback feedback={data.feedback} criteria={criteria} />}
      {role === 'GUEST' && <Card><p className="text-sm text-muted-foreground">Đăng nhập bằng tài khoản đội để nộp báo cáo kỹ thuật. Bảng điểm bên dưới công khai sau khi giám khảo công bố.</p></Card>}
      {role === 'ADMIN' && <Card><p className="text-sm text-muted-foreground">Ban giám khảo chấm báo cáo trong Quản trị Admin → Giải AI → Báo cáo kỹ thuật.</p></Card>}
      <Card icon={<Medal />} title="Bảng điểm kỹ thuật" subtitle="Đội điểm cao nhất nhận Giải Kỹ thuật và giấy chứng nhận riêng">
        {board.loading && !board.data ? <SkeletonRows rows={3} /> : !board.data?.published ? (
          <EmptyState icon={<Lock className="size-6" />} title="Chưa công bố" hint="Điểm báo cáo kỹ thuật được công bố khi giám khảo chấm xong." />
        ) : (
          <div className="space-y-4">
            {rows[0] && <div className="flex items-center gap-3 rounded-xl bg-amber-400/15 p-3 text-sm font-semibold text-amber-800 dark:text-amber-200" data-testid="ai-tech-award"><Award className="size-5" />{board.data.award}: {rows[0].team_name} ({fmt(rows[0].score, 1)}/50)</div>}
            <DataTable head={['Hạng', 'Đội', 'Điểm /50', 'Giám khảo', ...criteria.map((c) => c.name), 'Kho mã']}>
              {rows.map((r) => (
                <tr key={r.student_id} data-testid="ai-tech-row" className={sameStudent(r.student_id, session.student_id) ? '!bg-primary/10' : undefined}>
                  <td className="w-14 px-3 py-2"><RankBadge rank={r.rank} /></td>
                  <td className="px-3 py-2.5 font-medium">{r.team_name}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.score, 1)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.judges}</td>
                  {r.criteria.map((v: number, i: number) => <td key={i} className="px-3 py-2.5 tabular-nums text-muted-foreground">{fmt(v, 1)}</td>)}
                  <td className="px-3 py-2.5 text-xs">{r.repo_url ? <a href={r.repo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Mở</a> : '—'}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </Card>
    </div>
  )
}
