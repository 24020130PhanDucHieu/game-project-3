'use client'

import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Search, Send, Trash2, UserPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { stamp } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, Pagination, Select, SkeletonRows, Tabs, TextArea } from '../../ui'
import { useLive } from '../../context'
import { PasswordReveal } from '../../email-card'

const PAGE = 20

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-56 rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>
  )
}

export function AccountsTab() {
  const { tournamentId, tournament, run, confirm, busy } = useLive()
  const accounts = useResource<any[]>('admin:accounts', () => arenaApi.getAdminAccounts().then((r) => (Array.isArray(r) ? r : [])), { ttl: 15_000, refreshMs: 30_000 })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [q])
  const enrolled = new Set<string>((tournament.data?.teams || []).map((t: any) => String(t.student_id).toUpperCase()))
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (accounts.data || []).filter((a) => !needle || `${a.student_id} ${a.team_name}`.toLowerCase().includes(needle))
  }, [accounts.data, q])
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)

  return (
    <Card title={`Tài khoản đội (${accounts.data?.length ?? '…'})`} subtitle={tournamentId ? `Ghi danh vào: ${tournament.data?.name || tournamentId}` : 'Chọn giải ở ô “Giải thường đang quản lý” phía trên để ghi danh'} action={<SearchBox value={q} onChange={setQ} placeholder="Tìm MSSV hoặc tên đội" />}>
      {accounts.loading ? <SkeletonRows rows={8} /> : accounts.error && !accounts.data ? <ErrorNote message={accounts.error.message} onRetry={() => void accounts.reload()} /> : slice.length ? (
        <>
          <DataTable head={['MSSV', 'Tên đội', 'Mật khẩu', '']}>
            {slice.map((a) => {
              const isEnrolled = enrolled.has(String(a.student_id).toUpperCase())
              return (
                <tr key={a.student_id}>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.student_id}</td>
                  <td className="px-3 py-2.5 font-medium">{a.team_name}</td>
                  <td className="px-3 py-2.5"><PasswordReveal studentId={a.student_id} available={a.password_available !== false} /></td>
                  <td className="px-3 py-2.5"><div className="flex justify-end gap-2">
                    {isEnrolled ? <Badge tone="success">Đã trong giải</Badge> : <Button size="sm" variant="secondary" disabled={busy || !tournamentId} onClick={() => void run(() => arenaApi.enrollAdminAccount(a.student_id, { tournament_id: tournamentId }), `Đã ghi danh ${a.team_name}`, () => { invalidate('t:'); invalidate('tl') })}><UserPlus className="size-3.5" />Ghi danh</Button>}
                    <Button size="sm" variant="ghost" aria-label={`Xóa tài khoản ${a.student_id}`} disabled={busy} onClick={async () => { if (await confirm({ title: `Xóa tài khoản ${a.student_id}?`, message: 'Đội mất quyền đăng nhập. Lịch sử thi đấu được giữ nguyên và mã sinh viên không đăng ký lại được.', danger: true, confirmLabel: 'Xóa tài khoản' })) void run(() => arenaApi.deleteAdminAccount(a.student_id), 'Đã xóa tài khoản', () => invalidate('admin:accounts')) }}><Trash2 className="size-4" /></Button>
                  </div></td>
                </tr>
              )
            })}
          </DataTable>
          <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
        </>
      ) : <EmptyState title={q ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản'} />}
    </Card>
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
