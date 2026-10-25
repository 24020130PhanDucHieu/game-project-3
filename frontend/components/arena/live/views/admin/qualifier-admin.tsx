'use client'

import { useEffect, useState } from 'react'
import { Ban, FileCode2, Flag, Pause, Play, Plus, ShieldCheck, Snowflake, Trash2, Trophy, UserRoundPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, ProgressBar, Select, SkeletonRows, StatusBadge } from '../../ui'
import { useLive } from '../../context'
import { AdminScoreHistory, BanDialog, TeamSubmissionsOverlay } from '../../qualifier-extras'
import { AdminAiBoard } from '../ai-cup/admin-board'
import { AdminAiReports } from '../ai-cup/admin-reports'

const FILTERS = [['', 'Tất cả'], ['NOT_SUBMITTED', 'Chưa nộp'], ['PENDING', 'Đang kiểm tra'], ['VALID', 'Hợp lệ'], ['INVALID', 'Không hợp lệ'], ['LOCKED', 'Đã khóa'], ['BANNED', 'Bị loại']]

function ConfigForm({ event, ai }: { event?: any; ai?: boolean }) {
  const { run, setQualifierId, setAiEventId } = useLive()
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [rounds, setRounds] = useState('5')
  const [topK, setTopK] = useState('8')
  const [gitMode, setGitMode] = useState(false)
  const [template, setTemplate] = useState('')
  useEffect(() => {
    setName(event?.name || ''); setDeadline(toLocalInput(event?.deadline)); setRounds(String(event?.rounds || 5)); setTopK(String(event?.top_k || 8)); setGitMode(!!event?.git_mode); setTemplate(event?.git_template_url || '')
  }, [event])
  const payload = () => ({ name: name.trim(), deadline: fromLocalInput(deadline), rounds: Number(rounds), top_k: Number(topK), git_mode: ai ? false : gitMode, git_template_url: ai ? '' : template.trim(), ...(ai ? { kind: 'AI' } : {}) })
  const editable = !event || event.status === 'OPEN'
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên vòng loại" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
        <Field label="Hạn nộp bài (phải ở tương lai)" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!editable} />
        <Field label={ai ? 'Số lượt chấm (1–100)' : 'Số lượt ghép cặp (1–100)'} type="number" min={1} max={100} value={rounds} onChange={(e) => setRounds(e.target.value)} disabled={!editable} />
        <Select label="Số đội vào giải chính" value={topK} onChange={(e) => setTopK(e.target.value)} disabled={!editable}><option value="8">Top 8</option><option value="16">Top 16</option><option value="32">Top 32</option></Select>
      </div>
      {!ai && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={gitMode} disabled={!editable} onChange={(e) => setGitMode(e.target.checked)} />Bắt buộc nộp bài kèm commit GitHub</label>}
      {!ai && gitMode && <Field label="Repo mẫu (tùy chọn)" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="https://github.com/…" disabled={!editable} />}
      {!editable && <p className="text-xs text-muted-foreground">Vòng loại đã khóa — không thể đổi cấu hình.</p>}
      <div className="flex gap-2">
        {event ? (
          <Button disabled={!editable || !name.trim() || !deadline} onClick={() => void run(() => arenaApi.configureQualifier(event.id, payload()), 'Đã cập nhật cấu hình', () => invalidate('q'))}>Lưu cấu hình</Button>
        ) : (
          <Button disabled={!name.trim() || !deadline} onClick={() => void run(async () => { const created: any = await arenaApi.createQualifier(payload()); if (created?.id) (ai ? setAiEventId : setQualifierId)(created.id) }, ai ? 'Đã tạo vòng loại AI' : 'Đã tạo vòng loại', () => invalidate('ql'))} data-testid="create-qualifier"><Plus className="size-4" />{ai ? 'Tạo vòng loại AI' : 'Tạo vòng loại'}</Button>
        )}
      </div>
    </div>
  )
}

function Operations({ event, ai }: { event: any; ai?: boolean }) {
  const { run, confirm, busy, tournaments, tournamentId } = useLive()
  const [target, setTarget] = useState(tournamentId)
  const [botCount, setBotCount] = useState('20')
  const [reopenAt, setReopenAt] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => setTarget(tournamentId), [tournamentId])
  const id = event.id
  const act = (action: string, success: string, payload: Record<string, unknown> = {}) => run(() => arenaApi.qualifierAction(id, action, payload), success, () => { invalidate('q'); invalidate('ql'); invalidate('t:'); invalidate('tl') })
  const s = event.status
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy || !['OPEN', 'CLOSING', 'LOCKED'].includes(s)} onClick={async () => { if (await confirm({ title: 'Khóa bài ngay?', message: 'Lấy bản hợp lệ cuối cùng của mỗi đội. Không nhận thêm bài sau thao tác này (có thể mở lại nếu chưa ghép cặp).', confirmLabel: 'Khóa bài' })) void act('freeze', 'Đã khóa bài') }}><Snowflake className="size-4" />Khóa bài</Button>
        <Button disabled={busy || !['LOCKED', 'PAUSED'].includes(s)} onClick={() => void act('start', 'Đã bắt đầu ghép cặp và chấm')}><Play className="size-4" />{ai ? 'Bắt đầu / tiếp tục chấm' : 'Bắt đầu / tiếp tục ghép cặp'}</Button>
        <Button variant="secondary" disabled={busy || s !== 'RUNNING'} onClick={() => void act('pause', 'Đã yêu cầu tạm dừng sau lượt hiện tại')}><Pause className="size-4" />Tạm dừng</Button>
      </div>
      {event.eligible < event.top_k && ['LOCKED', 'PAUSED'].includes(s) && <p className="text-xs text-amber-700 dark:text-amber-300">Mới có {event.eligible} đội đủ điều kiện, cần tối thiểu {event.top_k} để bắt đầu.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold">Gia hạn nộp bài</h4>
          <Field label="Hạn mới" type="datetime-local" value={reopenAt} onChange={(e) => setReopenAt(e.target.value)} />
          <Field label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="secondary" disabled={busy || !reopenAt || reason.trim().length < 3 || !['OPEN', 'CLOSING', 'LOCKED'].includes(s)} onClick={() => void act('reopen', 'Đã gia hạn nộp bài', { deadline: fromLocalInput(reopenAt), reason })}>Gia hạn / mở lại</Button>
        </div>
        <div className="space-y-3 rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold">Bot thử nghiệm</h4>
          <Field label="Số bot tạo thêm" type="number" min={1} value={botCount} onChange={(e) => setBotCount(e.target.value)} hint="Dùng để kiểm tra tải/ghép cặp, đánh dấu là bot thử nghiệm." />
          <Button variant="secondary" disabled={busy || !Number(botCount)} onClick={() => void act('test-bots', `Đã tạo ${botCount} bot thử nghiệm`, { count: Number(botCount) })}><UserRoundPlus className="size-4" />Tạo bot thử</Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="size-4 text-amber-500" />Chốt đội vào giải chính</h4>
        <p className="text-xs text-muted-foreground">Chọn một giải còn trống có đúng {event.top_k} chỗ. Top {event.top_k} theo {ai ? 'điểm riêng tư' : 'ELO'} sẽ được ghi danh và xếp cặp.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Giải đích" className="min-w-64 flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Chọn giải —</option>
            {tournaments.data?.filter((t) => t.num_teams === event.top_k && (ai ? t.track === 'AI' : t.track !== 'AI')).map((t) => <option key={t.tournament_id} value={t.tournament_id}>{t.name} · {t.num_teams} đội</option>)}
          </Select>
          <Button disabled={busy || !target || s !== 'FINISHED'} onClick={async () => { if (await confirm({ title: 'Chốt đội đi tiếp?', message: 'Chỉ làm được một lần cho mỗi vòng loại và giải đích phải còn trống.', confirmLabel: 'Chốt đội' })) void act('promote', 'Đã chuyển đội vào giải chính', { tournament_id: target }) }}>Chốt đội</Button>
        </div>
        {s !== 'FINISHED' && s !== 'PROMOTED' && <p className="text-xs text-muted-foreground">Chỉ chốt được khi vòng loại ở trạng thái “Hoàn tất”.</p>}
      </div>
    </div>
  )
}

function Teams({ id, ai }: { id: string; ai?: boolean }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  useEffect(() => setPage(1), [id, q, filter])
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = window.setTimeout(() => setDebounced(q), 350); return () => window.clearTimeout(t) }, [q])
  const teams = useResource(`q:teams:${id}:${page}:${debounced}:${filter}`, () => arenaApi.getQualifierTeams(id, { page, q: debounced, filter }), { ttl: 8_000, refreshMs: 20_000 })
  const data = teams.data
  const [viewing, setViewing] = useState<any>(null)
  const [banning, setBanning] = useState<any>(null)
  return (
    <Card title="Đội tham gia" action={<div className="flex flex-wrap gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm MSSV / tên đội" aria-label="Tìm đội" className="w-48 rounded-xl border border-input bg-background px-3 py-2 text-sm" /><Select aria-label="Lọc trạng thái" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>}>
      {teams.loading ? <SkeletonRows rows={6} /> : teams.error && !data ? <ErrorNote message={teams.error.message} onRetry={() => void teams.reload()} /> : data?.items.length ? (
        <>
          <DataTable head={ai ? ['MSSV', 'Đội', 'Trạng thái bài', 'Điểm công khai / riêng tư', 'Lượt chấm', ''] : ['MSSV', 'Đội', 'Trạng thái bài', 'ELO', 'Thắng / Trận', '']}>
            {data.items.map((t) => (
              <tr key={t.student_id} className={t.banned ? 'opacity-70' : undefined}>
                <td className="px-3 py-2.5 font-mono text-xs">{t.student_id}</td>
                <td className="px-3 py-2.5 font-medium">{t.team_name}{t.test_bot && <Badge className="ml-2">Bot thử</Badge>}{t.banned && t.ban_reason && <span className="block text-[11px] font-normal text-red-600 dark:text-red-400">Lý do: {t.ban_reason}</span>}</td>
                <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
                {ai ? (
                  <>
                    <td className="px-3 py-2.5 tabular-nums">{t.ai_rounds ? `${Number(t.ai_public).toFixed(1)} / ${Number(t.ai_private).toFixed(1)}` : '—'}{t.technique && <span className="ml-2 text-[11px] text-muted-foreground">{t.technique}</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">{t.ai_rounds}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5 tabular-nums">{Number(t.elo).toFixed(1)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{t.wins}/{t.played}</td>
                  </>
                )}
                <td className="px-3 py-2.5"><div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setViewing(t)}><FileCode2 className="size-3.5" />Bài nộp</Button>
                  {!t.test_bot && (t.banned
                    ? <Button size="sm" variant="ghost" onClick={() => setBanning(t)}><ShieldCheck className="size-3.5" />Bỏ loại</Button>
                    : <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => setBanning(t)}><Ban className="size-3.5" />Loại</Button>)}
                </div></td>
              </tr>
            ))}
          </DataTable>
          <Pagination page={page} pageSize={data.page_size || 50} total={data.total} onChange={setPage} />
        </>
      ) : <EmptyState title="Không có đội phù hợp" />}
      {viewing && <TeamSubmissionsOverlay qid={id} team={viewing} onClose={() => setViewing(null)} />}
      {banning && <BanDialog qid={id} team={banning} onClose={() => setBanning(null)} />}
    </Card>
  )
}

export function QualifierAdminTab({ ai }: { ai?: boolean }) {
  const live0 = useLive()
  const { run, confirm, busy } = live0
  const qualifiers = ai ? live0.aiEvents : live0.qualifiers
  const qualifierId = ai ? live0.aiEventId : live0.qualifierId
  const setQualifierId = ai ? live0.setAiEventId : live0.setQualifierId
  const [creating, setCreating] = useState(false)
  const event = qualifiers.data?.find((q) => q.id === qualifierId)
  const detail = useResource<any>(qualifierId ? `q:detail:admin:${qualifierId}` : null, () => arenaApi.getQualifier(qualifierId), { ttl: 5_000, refreshMs: 8_000 })
  const live = detail.data?.event ?? event

  return (
    <div className="space-y-6">
      <Card title={ai ? 'Vòng loại Giải AI' : 'Vòng loại'} action={<><Button size="sm" variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)}><Plus className="size-4" />{creating ? 'Đóng' : 'Tạo mới'}</Button></>}>
        {creating ? <ConfigForm ai={ai} /> : qualifiers.data?.length ? (
          <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)}>
            {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name} · {q.status}</option>)}
          </Select>
        ) : <EmptyState icon={<Flag className="size-7" />} title={ai ? 'Chưa có vòng loại Giải AI' : 'Chưa có vòng loại'} action={<Button onClick={() => setCreating(true)} data-testid="open-create">{ai ? 'Tạo vòng loại AI' : 'Tạo vòng loại'}</Button>} />}
      </Card>

      {!creating && live && (
        <>
          <Card title={live.name} action={<><StatusBadge status={live.status} /><Button size="sm" variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa vòng loại “${live.name}”?`, message: 'Toàn bộ đội, bài nộp và kết quả của vòng loại sẽ bị xóa.', danger: true, confirmLabel: 'Xóa' })) void run(() => arenaApi.deleteQualifier(live.id), 'Đã xóa vòng loại', () => { invalidate('q'); invalidate('ql') }) }}><Trash2 className="size-4" /></Button></>}>
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
              <div><p className="text-xs text-muted-foreground">{ai ? 'Lượt chấm' : 'Lượt ghép cặp'}</p><p className="font-semibold tabular-nums">{live.applied_round ?? 0}/{live.rounds}</p></div>
              <div><p className="text-xs text-muted-foreground">Đội đủ điều kiện</p><p className="font-semibold tabular-nums">{live.eligible ?? 0} (top {live.top_k})</p></div>
              <div><p className="text-xs text-muted-foreground">Trận đã chấm</p><p className="font-semibold tabular-nums">{live.completed ?? 0}/{live.total ?? 0}</p></div>
            </div>
            {live.total > 0 && <div className="mt-4"><ProgressBar value={live.completed || 0} max={live.total} label="Tiến độ" /></div>}
            {live.error && <div className="mt-4"><ErrorNote message={live.error} /></div>}
          </Card>
          <Card title="Điều hành"><Operations event={live} ai={ai} /></Card>
          {live.status === 'OPEN' && <Card title="Cấu hình"><ConfigForm event={live} ai={ai} /></Card>}
          <Teams id={live.id} ai={ai} />
          {ai ? <AdminAiBoard qid={live.id} /> : <AdminScoreHistory qid={live.id} />}
          {ai && <AdminAiReports />}
        </>
      )}
    </div>
  )
}
