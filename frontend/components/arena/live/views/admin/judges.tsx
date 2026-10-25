'use client'

import { useState } from 'react'
import { KeyRound, Lock, Mail, ShieldCheck, Unlock, UserPlus } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { stamp } from '@/lib/format'
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SkeletonRows } from '../../ui'
import { useLive } from '../../context'

/** Quản lý tài khoản giám khảo — chỉ tài khoản chủ (ADMIN_PASSWORD) thấy mục này. */
export function JudgesTab() {
  const { run, confirm, busy, session } = useLive()
  const judges = useResource<any[]>('admin:judges', () => arenaApi.getJudges().then((r) => r.items || []), { ttl: 10_000 })
  const [form, setForm] = useState({ username: '', display_name: '', password: '', email: '' })
  const [resetFor, setResetFor] = useState('')
  const [resetPass, setResetPass] = useState('')
  const [emailFor, setEmailFor] = useState('')
  const [emailVal, setEmailVal] = useState('')
  const reload = () => invalidate('admin:judges')

  if (!session.owner) {
    return <Card><EmptyState icon={<ShieldCheck className="size-7" />} title="Chỉ tài khoản chủ quản lý giám khảo" hint="Bạn đang đăng nhập bằng tài khoản giám khảo; mọi thao tác của bạn được ghi tên trong nhật ký." /></Card>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <Card title="Thêm giám khảo" subtitle="Mỗi người một tài khoản để nhật ký ghi đúng người thao tác. Tài khoản chủ dùng khi khẩn cấp.">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          void run(async () => { await arenaApi.createJudge(form); setForm({ username: '', display_name: '', password: '', email: '' }) }, `Đã tạo giám khảo ${form.username}`, reload)
        }}>
          <Field label="Tên đăng nhập (chữ thường, số, . _ -)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="gk.lan" autoComplete="off" />
          <Field label="Tên hiển thị" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Nguyễn Thị Lan" />
          <Field label="Email nhận mã khi tự đổi mật khẩu" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="gk.lan@gmail.com" hint="Giám khảo cần có email mới tự đổi được mật khẩu (mã xác thực gửi tới đây)." autoComplete="off" />
          <Field label="Mật khẩu ban đầu (≥ 8 ký tự)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          <Button type="submit" disabled={busy || !form.username || !form.display_name || form.password.length < 8}><UserPlus className="size-4" />Tạo tài khoản</Button>
        </form>
      </Card>

      <Card title={`Giám khảo (${judges.data?.length ?? '…'})`}>
        {judges.loading ? <SkeletonRows rows={4} /> : judges.error && !judges.data ? <ErrorNote message={judges.error.message} onRetry={() => void judges.reload()} /> : judges.data?.length ? (
          <DataTable head={['Giám khảo', 'Email nhận mã', 'Trạng thái', 'Đăng nhập gần nhất', '']}>
            {judges.data.map((j) => (
              <tr key={j.username} className="align-top">
                <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar name={j.display_name} size="sm" /><span><span className="block font-semibold">{j.display_name}</span><span className="font-mono text-xs text-muted-foreground">{j.username}</span></span></span></td>
                <td className="px-3 py-2.5 text-xs">{j.has_email ? <span className="font-mono">{j.email}</span> : <Badge tone="warning">Chưa có</Badge>}</td>
                <td className="px-3 py-2.5">{j.disabled ? <Badge tone="danger">Đã khóa</Badge> : <Badge tone="success">Hoạt động</Badge>}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{j.last_login_at && !String(j.last_login_at).startsWith('0001') ? stamp(j.last_login_at) : 'Chưa đăng nhập'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {j.disabled
                      ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => arenaApi.judgeAction(j.username, 'enable'), 'Đã mở khóa', reload)}><Unlock className="size-3.5" />Mở khóa</Button>
                      : <Button size="sm" variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: `Khóa ${j.display_name}?`, message: 'Mọi phiên đăng nhập của giám khảo này bị thu hồi ngay.', danger: true, confirmLabel: 'Khóa' })) void run(() => arenaApi.judgeAction(j.username, 'disable'), 'Đã khóa giám khảo', reload) }}><Lock className="size-3.5" />Khóa</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { setEmailFor(emailFor === j.username ? '' : j.username); setEmailVal('') }}><Mail className="size-3.5" />Đặt email</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setResetFor(resetFor === j.username ? '' : j.username); setResetPass('') }}><KeyRound className="size-3.5" />Đặt lại mật khẩu</Button>
                  </div>
                  {emailFor === j.username && (
                    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await arenaApi.setJudgeEmail(j.username, emailVal.trim()); setEmailFor('') }, 'Đã lưu email nhận mã', reload) }}>
                      <input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} placeholder="email@gmail.com" aria-label="Email nhận mã" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" />
                      <Button size="sm" type="submit" disabled={!emailVal.includes('@')}>Lưu</Button>
                    </form>
                  )}
                  {resetFor === j.username && (
                    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => arenaApi.judgeAction(j.username, 'reset-password', resetPass), 'Đã đặt lại mật khẩu; phiên cũ bị thu hồi', () => { setResetFor(''); reload() }) }}>
                      <input type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} placeholder="Mật khẩu mới (≥ 8)" aria-label="Mật khẩu mới" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs" autoComplete="new-password" />
                      <Button size="sm" type="submit" disabled={resetPass.length < 8}>Lưu</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Chưa có giám khảo" hint="Tạo tài khoản riêng cho từng thành viên ban tổ chức." />}
      </Card>
    </div>
  )
}
