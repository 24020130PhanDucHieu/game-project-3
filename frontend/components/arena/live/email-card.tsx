'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Mail, Send } from 'lucide-react'
import { HumanCheck, type HumanProof } from '../modals/human-check'
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

/** Đổi mật khẩu (biết mật khẩu cũ) hoặc khôi phục qua mã gửi về email đã đăng ký. */
export function PasswordCard() {
  const { run, busy, toast, session } = useLive()
  const info = useResource('team:email', () => arenaApi.getTeamEmail(), { ttl: 60_000 })
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [mode, setMode] = useState<'change' | 'recover'>('change')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [fresh, setFresh] = useState('')
  const [proof, setProof] = useState<HumanProof | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const [sent, setSent] = useState(false)
  const mismatch = !!again && next !== again
  return (
    <Card title="Mật khẩu & bảo mật" action={<KeyRound className="size-4 text-muted-foreground" />}>
      <div className="mb-4 inline-flex rounded-xl border border-border bg-muted/40 p-1 text-xs font-semibold" role="tablist">
        {([['change', 'Đổi mật khẩu'], ['recover', 'Quên mật khẩu']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={mode === id ? 'rounded-lg bg-card px-3 py-1.5 text-foreground shadow-sm' : 'rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground'}>{label}</button>
        ))}
      </div>
      {mode === 'change' ? (
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
          e.preventDefault()
          if (next !== again) return
          void run(() => arenaApi.changePassword(current, next), 'Đã đổi mật khẩu', () => { setCurrent(''); setNext(''); setAgain('') })
        }}>
          <Field label="Mật khẩu hiện tại" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Field label="Mật khẩu mới (≥ 6 ký tự)" type="password" required minLength={6} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <Field label="Nhập lại mật khẩu mới" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {mismatch && <p className="text-xs text-red-600 sm:col-span-3">Hai lần nhập mật khẩu mới chưa khớp.</p>}
          <div className="sm:col-span-3"><Button type="submit" disabled={busy || !current || next.length < 6 || mismatch}><KeyRound className="size-4" />Đổi mật khẩu</Button></div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Mã khôi phục (hiệu lực 15 phút) được gửi tới email đã đăng ký{info.data?.email_masked ? <> <strong className="text-foreground">{info.data.email_masked}</strong></> : ''}. Nhập lại đầy đủ email đó để xác minh.</p>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => {
            e.preventDefault()
            if (!proof) { toast('error', 'Hãy tích ô “Tôi không phải robot”.'); return }
            void run(async () => { await arenaApi.forgotPassword(session.student_id || '', email.trim(), proof); setSent(true) }, 'Đã gửi yêu cầu — hãy kiểm tra hộp thư (cả mục Spam)', () => setProofKey((k) => k + 1))
          }}>
            <Field label="Email đã đăng ký" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" autoComplete="email" />
            <Button type="submit" disabled={busy || !email.trim()}><Send className="size-4" />Gửi mã</Button>
            <div className="sm:col-span-2"><HumanCheck value={proof} onChange={setProof} resetKey={proofKey} /></div>
          </form>
          {sent && (
            <form className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => {
              e.preventDefault()
              void run(() => arenaApi.resetPassword(session.student_id || '', code.trim(), fresh), 'Đã đặt lại mật khẩu', () => { setCode(''); setFresh(''); setSent(false); setMode('change') })
            }}>
              <Field label="Mã trong email" required value={code} onChange={(e) => setCode(e.target.value)} />
              <Field label="Mật khẩu mới" type="password" required minLength={6} value={fresh} onChange={(e) => setFresh(e.target.value)} autoComplete="new-password" />
              <Button type="submit" disabled={busy || !code.trim() || fresh.length < 6}>Đặt lại</Button>
            </form>
          )}
        </div>
      )}
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
