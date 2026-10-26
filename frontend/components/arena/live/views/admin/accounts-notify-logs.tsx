'use client'

import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Search, Send, Trash2, UserPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { stamp } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, ProgressBar, Select, SkeletonRows, Tabs, TextArea } from '../../ui'
import { useLive } from '../../context'
import { PasswordReveal } from '../../email-card'

const PAGE = 20

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-56 rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>
  )
}

type TargetType = 'tournament' | 'qualifier' | 'ai_qualifier' | 'ai_main'

const TARGET_LABEL: Record<TargetType, string> = {
  tournament: 'Giải thường',
  qualifier: 'Vòng loại thường',
  ai_qualifier: 'Vòng loại Giải AI',
  ai_main: 'Giải chính AI',
}
const KIND_LABEL: Record<string, string> = { tournament: 'Giải', qualifier: 'Vòng loại', ai_qualifier: 'Vòng loại AI', ai_main: 'Giải chính AI' }

type Option = { id: string; name: string; total: number; capacity: number; status?: string; blocked?: string }

/** Ghi danh một hoặc nhiều đội vào đúng một đích đã chọn: giải thường, vòng loại thường hoặc vòng loại Giải AI. */
export function AccountsTab() {
  const { tournaments, qualifiers, aiEvents, run, confirm, busy, navigate } = useLive()
  const accounts = useResource<any[]>('admin:accounts', () => arenaApi.getAdminAccounts().then((r) => (Array.isArray(r) ? r : [])), { ttl: 15_000, refreshMs: 30_000 })
  const enroll = useResource<any>('admin:enrollments', () => arenaApi.getAdminEnrollments(), { ttl: 8_000, refreshMs: 20_000 })
  const [type, setType] = useState<TargetType>('tournament')
  const [targetId, setTargetId] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [report, setReport] = useState<{ ok: string[]; failed: [string, string][] } | null>(null)
  useEffect(() => setPage(1), [q])
  useEffect(() => { setTargetId(''); setPicked(new Set()); setReport(null) }, [type])

  const chips: Record<string, { id: string; name: string; kind: string; status?: string }[]> = enroll.data?.items || {}
  const countOf = (id: string) => Object.values(chips).reduce((n, list) => n + (list.some((c) => c.id === id) ? 1 : 0), 0)

  const options: Option[] = useMemo(() => {
    if (type === 'tournament') {
      return (tournaments.data || []).filter((t) => t.track !== 'AI').map((t) => {
        const total = countOf(t.tournament_id)
        const full = total >= t.num_teams
        const started = ['IN_PROGRESS', 'RUNNING', 'COMPLETED', 'FINISHED'].includes(String(t.status))
        return { id: t.tournament_id, name: t.name, total, capacity: t.num_teams, status: t.status, blocked: full ? 'đã đủ đội' : started ? 'giải đã bắt đầu' : undefined }
      })
    }
    const list = type === 'qualifier' ? qualifiers.data : aiEvents.data
    return (list || []).map((e) => {
      const open = ['OPEN', 'CLOSING'].includes(String(e.status))
      return { id: e.id, name: e.name, total: countOf(e.id), capacity: 4000, status: e.status, blocked: open ? undefined : 'đã khóa bài hoặc đã chạy' }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tournaments.data, qualifiers.data, aiEvents.data, enroll.data])
  const target = options.find((o) => o.id === targetId)

  const needle = q.trim().toLowerCase()
  const rows = useMemo(() => (accounts.data || []).filter((a) => !needle || `${a.student_id} ${a.team_name}`.toLowerCase().includes(needle)), [accounts.data, needle])
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)
  const inTarget = (sid: string) => !!targetId && (chips[String(sid).toUpperCase()] || []).some((c) => c.id === targetId)
  const free = target && target.capacity ? Math.max(0, target.capacity - target.total) : 0
  const targetOk = !!target && !target.blocked
  const reload = () => { invalidate('t:'); invalidate('tl'); invalidate('q'); invalidate('ql'); invalidate('admin:') }

  const enrollOne = async (a: any) => {
    if (!target) return
    await arenaApi.enrollAdminAccount(a.student_id, { target_type: type, target_id: target.id })
  }
  const askAndEnroll = async (list: any[]) => {
    if (!target || !list.length) return
    const names = list.slice(0, 5).map((a) => `${a.team_name} (${a.student_id})`).join(', ') + (list.length > 5 ? ` và ${list.length - 5} đội khác` : '')
    const room = target.capacity ? ` Còn ${Math.max(0, target.capacity - target.total)} chỗ.` : ''
    const ok = await confirm({
      title: `Ghi danh ${list.length} đội vào ${TARGET_LABEL[type].toLowerCase()} “${target.name}”?`,
      message: <>{names}.{room}{type === 'tournament' ? ' Sau khi ghi danh đủ đội, nhớ bấm “Xếp lịch” ở tab Giải & Đội.' : ' Các đội cần tự nộp bài trước hạn.'}</>,
      confirmLabel: 'Ghi danh',
    })
    if (!ok) return
    const done: string[] = []
    const failed: [string, string][] = []
    await run(async () => {
      for (const a of list) {
        try { await enrollOne(a); done.push(a.team_name) } catch (e) { failed.push([a.team_name, e instanceof Error ? e.message : 'Lỗi']) }
      }
      if (!done.length && failed.length) throw new Error(failed[0][1])
    }, `Đã ghi danh ${list.length} đội vào “${target.name}”`, reload)
    setReport({ ok: done, failed })
    setPicked(new Set())
  }
  const togglePick = (sid: string) => setPicked((old) => { const next = new Set(old); next.has(sid) ? next.delete(sid) : next.add(sid); return next })
  const pickedRows = (accounts.data || []).filter((a) => picked.has(a.student_id) && !inTarget(a.student_id))

  return (
    <div className="space-y-6">
      <Card title="Ghi danh vào đâu?" subtitle="Chọn đúng loại và đích trước; nút Ghi danh ở từng đội luôn nói rõ đang ghi danh vào đâu">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2" data-testid="enroll-target">
            <Select label="Loại" value={type} onChange={(e) => setType(e.target.value as TargetType)} data-testid="enroll-type">
              {(Object.keys(TARGET_LABEL) as TargetType[]).map((k) => <option key={k} value={k}>{TARGET_LABEL[k]}</option>)}
            </Select>
            {type !== 'ai_main' && (
              <Select label="Đích" value={targetId} onChange={(e) => setTargetId(e.target.value)} data-testid="enroll-target-id">
                <option value="">— Chọn {TARGET_LABEL[type].toLowerCase()} —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.total}{o.capacity && o.capacity < 4000 ? `/${o.capacity}` : ''} đội{o.blocked ? ` · không ghi danh được: ${o.blocked}` : ''}</option>)}
              </Select>
            )}
          </div>
          {type === 'ai_main' && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100" data-testid="enroll-ai-main-note">
              Giải chính AI chỉ nhận đội đã qua vòng loại AI, không ghi danh bằng tay được. Hãy vào <button className="font-semibold underline" onClick={() => navigate('admin')}>Quản trị → Giải AI</button> và bấm “Chốt đội” khi vòng loại đã chấm xong.
            </p>
          )}
          {target && (
            <div className="space-y-1.5" data-testid="enroll-capacity">
              <ProgressBar value={target.total} max={target.capacity || 1} label={target.capacity && target.capacity < 4000 ? `${target.total}/${target.capacity} đội · còn ${free} chỗ` : `${target.total} đội đã ghi danh`} />
              {target.blocked && <p className="text-xs text-red-700 dark:text-red-300">Không ghi danh được: {target.blocked}.</p>}
            </div>
          )}
          {!target && type !== 'ai_main' && <p className="text-xs text-muted-foreground">Chưa chọn đích nên chưa ghi danh được. {options.length ? '' : `Chưa có ${TARGET_LABEL[type].toLowerCase()} nào.`}</p>}
        </div>
      </Card>

      <Card title={`Tài khoản đội (${accounts.data?.length ?? '…'})`} subtitle={target ? `Ghi danh vào: ${TARGET_LABEL[type]} “${target.name}”` : 'Chọn đích ở khung trên để bật nút Ghi danh'}
        action={<div className="flex flex-wrap items-center gap-2">
          {picked.size > 0 && <Button size="sm" disabled={busy || !targetOk || !pickedRows.length} onClick={() => void askAndEnroll(pickedRows)} data-testid="enroll-bulk"><UserPlus className="size-3.5" />Ghi danh {pickedRows.length} đội đã chọn</Button>}
          <SearchBox value={q} onChange={setQ} placeholder="Tìm MSSV hoặc tên đội" />
        </div>}>
        {report && (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3 text-sm" data-testid="enroll-report">
            <p className="font-semibold">Kết quả: {report.ok.length} thành công{report.failed.length ? `, ${report.failed.length} lỗi` : ''}</p>
            {report.failed.map(([name, why]) => <p key={name} className="text-xs text-red-700 dark:text-red-300">{name}: {why}</p>)}
          </div>
        )}
        {accounts.loading ? <SkeletonRows rows={8} /> : accounts.error && !accounts.data ? <ErrorNote message={accounts.error.message} onRetry={() => void accounts.reload()} /> : slice.length ? (
          <>
            <DataTable head={['', 'MSSV', 'Tên đội', 'Đang ở', 'Mật khẩu', '']}>
              {slice.map((a) => {
                const here = inTarget(a.student_id)
                const list = chips[String(a.student_id).toUpperCase()] || []
                return (
                  <tr key={a.student_id}>
                    <td className="w-8 px-3 py-2.5"><input type="checkbox" className="accent-primary" aria-label={`Chọn ${a.team_name}`} disabled={here || !targetOk} checked={picked.has(a.student_id)} onChange={() => togglePick(a.student_id)} /></td>
                    <td className="px-3 py-2.5 font-mono text-xs">{a.student_id}</td>
                    <td className="px-3 py-2.5 font-medium">{a.team_name}</td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1" data-testid="enroll-chips">
                      {list.length ? list.map((c) => <Badge key={c.id} tone={c.id === targetId ? 'success' : 'neutral'}>{KIND_LABEL[c.kind] || c.kind}: {c.name}</Badge>) : <span className="text-xs text-muted-foreground">Chưa ở đâu</span>}
                    </div></td>
                    <td className="px-3 py-2.5"><PasswordReveal studentId={a.student_id} available={a.password_available !== false} /></td>
                    <td className="px-3 py-2.5"><div className="flex justify-end gap-2">
                      {here ? <Badge tone="success">Đã trong “{target?.name}”</Badge> : (
                        <Button size="sm" variant="secondary" disabled={busy || !targetOk} title={!target ? 'Chọn đích ở khung trên' : undefined} onClick={() => void askAndEnroll([a])} data-testid="enroll-one">
                          <UserPlus className="size-3.5" />{target ? `Ghi danh vào ${target.name.length > 18 ? target.name.slice(0, 17) + '…' : target.name}` : 'Chọn đích trước'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" aria-label={`Xóa tài khoản ${a.student_id}`} disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa tài khoản ${a.student_id}?`, message: 'Đội mất quyền đăng nhập. Lịch sử thi đấu được giữ nguyên và mã sinh viên không đăng ký lại được.', danger: true, confirmLabel: 'Xóa tài khoản' })) void run(() => arenaApi.deleteAdminAccount(a.student_id), 'Đã xóa tài khoản', () => invalidate('admin:')) }}><Trash2 className="size-4" /></Button>
                    </div></td>
                  </tr>
                )
              })}
            </DataTable>
            <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
          </>
        ) : <EmptyState title={q ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản'} />}
      </Card>
    </div>
  )
}

export function NotifyTab() {
  const { run, busy, notifications } = useLive()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
      <Card title="Phát thông báo" subtitle="Gửi tới tất cả người dùng (kể cả khách)" action={<Megaphone className="size-4 text-muted-foreground" />}>
        <div className="space-y-3">
          <Field label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <TextArea label="Nội dung" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <Select label="Mở tab khi bấm vào thông báo" value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Không chuyển tab</option>
            {[['overview', 'Tổng quan'], ['bracket', 'Bảng đấu'], ['match', 'Trận đấu'], ['qualifier', 'Vòng loại'], ['ranking', 'Xếp hạng'], ['guide', 'Hướng dẫn thi đấu']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Button disabled={busy || !title.trim() || !message.trim()} onClick={() => void run(async () => { await arenaApi.broadcastNotification({ title: title.trim(), message: message.trim(), link_tab: link || undefined }); setTitle(''); setMessage('') }, 'Đã phát thông báo', () => invalidate('nt:'))}><Send className="size-4" />Gửi cho tất cả</Button>
        </div>
      </Card>
      <Card title="Thông báo gần đây">
        {notifications.data?.notifications.length ? (
          <ul className="max-h-96 space-y-3 overflow-y-auto">{notifications.data.notifications.map((n) => <li key={n.id} className="rounded-xl border border-border p-3 text-sm"><p className="font-semibold">{n.title}</p><p className="text-muted-foreground">{n.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{stamp(n.created_at)}</p></li>)}</ul>
        ) : <EmptyState title="Chưa có thông báo" />}
      </Card>
    </div>
  )
}

export function LogsTab() {
  const { tournamentId, tournament } = useLive()
  const [scoped, setScoped] = useState<'all' | 'tournament'>('all')
  const logs = useResource<any[]>(`admin:logs:${scoped === 'tournament' ? tournamentId : ''}`, () => arenaApi.getAuditLogs(scoped === 'tournament' ? tournamentId : '').then((r) => (Array.isArray(r?.logs) ? r.logs : [])), { ttl: 8_000, refreshMs: 20_000 })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [q, scoped])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (logs.data || []).filter((l) => !needle || `${l.action} ${l.admin_user} ${l.tournament_id} ${l.match_id} ${JSON.stringify(l.details || {})}`.toLowerCase().includes(needle))
  }, [logs.data, q])
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)
  const incidents: any[] = Array.isArray(tournament.data?.incident_log) ? tournament.data.incident_log : []

  return (
    <div className="space-y-6">
      <Card title="Nhật ký thao tác quản trị" subtitle="50 thao tác gần nhất" action={<><Tabs value={scoped} onChange={setScoped} tabs={[{ id: 'all', label: 'Tất cả' }, { id: 'tournament', label: 'Giải đang chọn' }]} /><SearchBox value={q} onChange={setQ} placeholder="Tìm trong nhật ký" /></>}>
        {logs.loading ? <SkeletonRows rows={6} /> : logs.error && !logs.data ? <ErrorNote message={logs.error.message} onRetry={() => void logs.reload()} /> : slice.length ? (
          <>
            <DataTable head={['Thời gian', 'Quản trị viên', 'Thao tác', 'Giải / Trận', 'Chi tiết']}>
              {slice.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap">{stamp(l.created_at)}</td>
                  <td className="px-3 py-2.5">{l.admin_user}</td>
                  <td className="px-3 py-2.5"><Badge tone="accent">{l.action}</Badge></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{[l.tournament_id, l.match_id].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-3 py-2.5">{l.details && Object.keys(l.details).length ? <details><summary className="cursor-pointer text-xs font-semibold text-primary">Xem</summary><pre className="mt-1 max-w-xs overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(l.details, null, 2)}</pre></details> : '—'}</td>
                </tr>
              ))}
            </DataTable>
            <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
          </>
        ) : <EmptyState title="Chưa có nhật ký" />}
      </Card>
      {incidents.length > 0 && (
        <Card title="Nhật ký sự cố của giải đang chọn" subtitle="Các lần sửa/hoàn tác kết quả">
          <ul className="space-y-2 text-sm">{[...incidents].reverse().map((it, i) => <li key={i} className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-xs text-muted-foreground">{stamp(it.at ?? it.created_at)}</span> · {it.action || it.type} {it.match_id ? `· ${it.match_id}` : ''} · {it.reason}</li>)}</ul>
        </Card>
      )}
    </div>
  )
}
