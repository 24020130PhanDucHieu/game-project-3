'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { Badge, Button, Card, Field } from './ui'
import { useLive } from './context'

/** Email khôi phục mật khẩu của đội: nhắc nổi bật khi chưa có, cho phép cập nhật. */
export function TeamEmailCard() {
  const { run, busy } = useLive()
  const info = useResource('team:email', () => arenaApi.getTeamEmail(), { ttl: 60_000 })
  const [email, setEmail] = useState('')
  const missing = info.data && !info.data.has_email
  return (
    <Card title="Email khôi phục mật khẩu" className={missing ? 'border-amber-500/50' : undefined} action={info.data ? (info.data.has_email ? <Badge tone="success">{info.data.email_masked}</Badge> : <Badge tone="warning">Chưa có email</Badge>) : undefined}>
      {missing && <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Đội bạn chưa có email. Nếu quên mật khẩu, hệ thống không thể gửi mã khôi phục — hãy thêm email ngay.</p>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => arenaApi.setTeamEmail(email), 'Đã lưu email khôi phục', () => { setEmail(''); invalidate('team:email') }) }}>
        <Field label={info.data?.has_email ? 'Đổi sang email mới' : 'Email của đội'} type="email" required className="min-w-64 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" autoComplete="email" />
        <Button type="submit" disabled={busy || !email.trim()}><Mail className="size-4" />Lưu email</Button>
      </form>
    </Card>
  )
}

/** Ô mật khẩu cho admin: mặc định ẩn, bấm để hiện 15 giây; mỗi lần xem được server ghi nhật ký. */
export function PasswordReveal({ studentId, available }: { studentId: string; available: boolean }) {
  const { toast } = useLive()
  const [value, setValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!available) return <span className="text-xs text-muted-foreground" title="Khóa mã hóa đã đổi; hãy cấp mã khôi phục">Không giải mã được</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="min-w-20 rounded bg-muted px-2 py-0.5 font-mono text-xs">{value ?? '••••••••'}</code>
      <Button size="sm" variant="ghost" loading={loading} aria-label={value ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={async () => {
        if (value) { setValue(null); return }
        setLoading(true)
        try {
          const res = await arenaApi.viewAccountPassword(studentId)
          setValue(res.password)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setValue(null), 15_000)
        } catch (e) {
          toast('error', e instanceof Error ? e.message : 'Không xem được mật khẩu')
        } finally { setLoading(false) }
      }}>{value ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Button>
    </span>
  )
}
