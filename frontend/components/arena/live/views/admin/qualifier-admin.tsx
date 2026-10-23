'use client'

import { useEffect, useState } from 'react'
import { Flag, Pause, Play, Plus, Snowflake, Trash2, Trophy, UserRoundPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, ProgressBar, Select, SkeletonRows, StatusBadge } from '../../ui'
import { useLive } from '../../context'

const FILTERS = [['', 'Tất cả'], ['NOT_SUBMITTED', 'Chưa nộp'], ['PENDING', 'Đang kiểm tra'], ['VALID', 'Hợp lệ'], ['INVALID', 'Không hợp lệ'], ['LOCKED', 'Đã khóa']]

function ConfigForm({ event }: { event?: any }) {
  const { run, setQualifierId } = useLive()
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [rounds, setRounds] = useState('5')
  const [topK, setTopK] = useState('8')
  const [gitMode, setGitMode] = useState(false)
  const [template, setTemplate] = useState('')
  useEffect(() => {
    setName(event?.name || ''); setDeadline(toLocalInput(event?.deadline)); setRounds(String(event?.rounds || 5)); setTopK(String(event?.top_k || 8)); setGitMode(!!event?.git_mode); setTemplate(event?.git_template_url || '')
  }, [event])
  const payload = () => ({ name: name.trim(), deadline: fromLocalInput(deadline), rounds: Number(rounds), top_k: Number(topK), git_mode: gitMode, git_template_url: template.trim() })
  const editable = !event || event.status === 'OPEN'
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên vòng loại" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
        <Field label="Hạn nộp bài (phải ở tương lai)" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!editable} />
        <Field label="Số lượt ghép cặp (1–100)" type="number" min={1} max={100} value={rounds} onChange={(e) => setRounds(e.target.value)} disabled={!editable} />
        <Select label="Số đội vào giải chính" value={topK} onChange={(e) => setTopK(e.target.value)} disabled={!editable}><option value="8">Top 8</option><option value="16">Top 16</option><option value="32">Top 32</option></Select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={gitMode} disabled={!editable} onChange={(e) => setGitMode(e.target.checked)} />Bắt buộc nộp bài kèm commit GitHub</label>
      {gitMode && <Field label="Repo mẫu (tùy chọn)" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="https://github.com/…" disabled={!editable} />}
      {!editable && <p className="text-xs text-muted-foreground">Vòng loại đã khóa — không thể đổi cấu hình.</p>}
      <div className="flex gap-2">
        {event ? (
          <Button disabled={!editable || !name.trim() || !deadline} onClick={() => void run(() => arenaApi.configureQualifier(event.id, payload()), 'Đã cập nhật cấu hình', () => invalidate('q'))}>Lưu cấu hình</Button>
        ) : (
          <Button disabled={!name.trim() || !deadline} onClick={() => void run(async () => { const created: any = await arenaApi.createQualifier(payload()); if (created?.id) setQualifierId(created.id) }, 'Đã tạo vòng loại', () => invalidate('ql'))}><Plus className="size-4" />Tạo vòng loại</Button>
        )}
      </div>
    </div>
  )
}

function Operations({ event }: { event: any }) {
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
        <Button disabled={busy || !['LOCKED', 'PAUSED'].includes(s)} onClick={() => void act('start', 'Đã bắt đầu ghép cặp và chấm')}><Play className="size-4" />Bắt đầu / tiếp tục ghép cặp</Button>
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
        <p className="text-xs text-muted-foreground">Chọn một giải còn trống có đúng {event.top_k} chỗ. Top {event.top_k} theo ELO sẽ được ghi danh và xếp cặp.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Giải đích" className="min-w-64 flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Chọn giải —</option>
            {tournaments.data?.filter((t) => t.num_teams === event.top_k).map((t) => <option key={t.tournament_id} value={t.tournament_id}>{t.name} · {t.num_teams} đội</option>)}
          </Select>
          <Button disabled={busy || !target || s !== 'FINISHED'} onClick={async () => { if (await confirm({ title: 'Chốt đội đi tiếp?', message: 'Chỉ làm được một lần cho mỗi vòng loại và giải đích phải còn trống.', confirmLabel: 'Chốt đội' })) void act('promote', 'Đã chuyển đội vào giải chính', { tournament_id: target }) }}>Chốt đội</Button>
        </div>
        {s !== 'FINISHED' && s !== 'PROMOTED' && <p className="text-xs text-muted-foreground">Chỉ chốt được khi vòng loại ở trạng thái “Hoàn tất”.</p>}
      </div>
    </div>
  )
}

function Teams({ id }: { id: string }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  useEffect(() => setPage(1), [id, q, filter])
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = window.setTimeout(() => setDebounced(q), 350); return () => window.clearTimeout(t) }, [q])
  const teams = useResource(`q:teams:${id}:${page}:${debounced}:${filter}`, () => arenaApi.getQualifierTeams(id, { page, q: debounced, filter }), { ttl: 8_000, refreshMs: 20_000 })
  const data = teams.data
  return (
    <Card title="Đội tham gia" action={<div className="flex flex-wrap gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm MSSV / tên đội" aria-label="Tìm đội" className="w-48 rounded-xl border border-input bg-background px-3 py-2 text-sm" /><Select aria-label="Lọc trạng thái" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>}>
      {teams.loading ? <SkeletonRows rows={6} /> : teams.error && !data ? <ErrorNote message={teams.error.message} onRetry={() => void teams.reload()} /> : data?.items.length ? (
        <>
          <DataTable head={['MSSV', 'Đội', 'Trạng thái bài', 'ELO', 'Thắng / Trận']}>
            {data.items.map((t) => (
              <tr key={t.student_id}>
                <td className="px-3 py-2.5 font-mono text-xs">{t.student_id}</td>
                <td className="px-3 py-2.5 font-medium">{t.team_name}{t.test_bot && <Badge className="ml-2">Bot thử</Badge>}</td>
                <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
                <td className="px-3 py-2.5 tabular-nums">{Number(t.elo).toFixed(1)}</td>
                <td className="px-3 py-2.5 tabular-nums">{t.wins}/{t.played}</td>
              </tr>
            ))}
          </DataTable>
          <Pagination page={page} pageSize={data.page_size || 50} total={data.total} onChange={setPage} />
        </>
      ) : <EmptyState title="Không có đội phù hợp" />}
    </Card>
  )
}

export function QualifierAdminTab() {
  const { qualifiers, qualifierId, setQualifierId, run, confirm, busy } = useLive()
  const [creating, setCreating] = useState(false)
  const event = qualifiers.data?.find((q) => q.id === qualifierId)
  const detail = useResource<any>(qualifierId ? `q:detail:admin:${qualifierId}` : null, () => arenaApi.getQualifier(qualifierId), { ttl: 5_000, refreshMs: 8_000 })
  const live = detail.data?.event ?? event

  return (
    <div className="space-y-6">
      <Card title="Vòng loại" action={<><Button size="sm" variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)}><Plus className="size-4" />{creating ? 'Đóng' : 'Tạo mới'}</Button></>}>
        {creating ? <ConfigForm /> : qualifiers.data?.length ? (
          <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)}>
            {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name} · {q.status}</option>)}
          </Select>
        ) : <EmptyState icon={<Flag className="size-7" />} title="Chưa có vòng loại" action={<Button onClick={() => setCreating(true)}>Tạo vòng loại</Button>} />}
      </Card>

      {!creating && live && (
        <>
          <Card title={live.name} action={<><StatusBadge status={live.status} /><Button size="sm" variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa vòng loại “${live.name}”?`, message: 'Toàn bộ đội, bài nộp và kết quả của vòng loại sẽ bị xóa.', danger: true, confirmLabel: 'Xóa' })) void run(() => arenaApi.deleteQualifier(live.id), 'Đã xóa vòng loại', () => { invalidate('q'); invalidate('ql') }) }}><Trash2 className="size-4" /></Button></>}>
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Lượt ghép cặp</p><p className="font-semibold tabular-nums">{live.applied_round ?? 0}/{live.rounds}</p></div>
              <div><p className="text-xs text-muted-foreground">Đội đủ điều kiện</p><p className="font-semibold tabular-nums">{live.eligible ?? 0} (top {live.top_k})</p></div>
              <div><p className="text-xs text-muted-foreground">Trận đã chấm</p><p className="font-semibold tabular-nums">{live.completed ?? 0}/{live.total ?? 0}</p></div>
            </div>
            {live.total > 0 && <div className="mt-4"><ProgressBar value={live.completed || 0} max={live.total} label="Tiến độ" /></div>}
            {live.error && <div className="mt-4"><ErrorNote message={live.error} /></div>}
          </Card>
          <Card title="Điều hành"><Operations event={live} /></Card>
          {live.status === 'OPEN' && <Card title="Cấu hình"><ConfigForm event={live} /></Card>}
          <Teams id={live.id} />
        </>
      )}
    </div>
  )
}
