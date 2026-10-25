'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, Field } from '../../ui'
import { useLive } from '../../context'
import { PasswordRules, passwordChecks } from '../../password-strength'

type Step = 'verify' | 'code' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'verify', label: 'Xác nhận mật khẩu hiện tại' },
  { id: 'code', label: 'Mã gửi qua email + mật khẩu mới' },
  { id: 'done', label: 'Hoàn tất' },
]

function Stepper({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.id === step)
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Các bước đổi mật khẩu">
      {STEPS.map((s, i) => (
        <li key={s.id} aria-current={i === at ? 'step' : undefined} className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold', i === at ? 'border-primary bg-primary/10 text-primary' : i < at ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground')}>
          <span className={cn('grid size-5 place-items-center rounded-full text-[11px]', i <= at ? 'bg-current/15' : 'bg-muted')}>{i < at ? <CheckCircle2 className="size-3.5" /> : i + 1}</span>{s.label}
        </li>
      ))}
    </ol>
  )
}

/** Đổi mật khẩu của chính mình (chủ hoặc giám khảo): mật khẩu hiện tại → mã 6 số gửi email → mật khẩu mới. */
export function SecurityCard() {
  const { session, refreshSession, toast } = useLive()
  const [step, setStep] = useState<Step>('verify')
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [left, setLeft] = useState(0) // giây còn lại của mã
  const [wait, setWait] = useState(0) // giây chờ để gửi lại
  const timer = useRef<number>(0)
  const username = session.judge || 'admin'
  const owner = !!session.owner

  useEffect(() => {
    window.clearInterval(timer.current)
    if (step !== 'code') return
    timer.current = window.setInterval(() => { setLeft((v) => Math.max(0, v - 1)); setWait((v) => Math.max(0, v - 1)) }, 1000)
    return () => window.clearInterval(timer.current)
  }, [step])

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error && e.message ? e.message : fallback)

  async function sendCode() {
    setBusy(true); setError('')
    try {
      const r = await arenaApi.requestAdminPasswordCode(current)
      setSentTo(r.sent_to); setLeft(r.expires_in); setWait(r.resend_after); setCode(''); setStep('code')
    } catch (e) {
      const wait = (e as { status?: number } | null)?.status === 429 ? /(\d+) giây/.exec(String((e as Error).message))?.[1] : undefined
      if (wait && step === 'code') setWait(Number(wait))
      fail(e, 'Chưa gửi được mã. Hãy thử lại.')
    } finally { setBusy(false) }
  }

  const checks = passwordChecks(next, current, username)
  const valid = checks.every((c) => c.ok) && next === again && /^\d{6}$/.test(code.trim())

  async function submit() {
    setBusy(true); setError('')
    try {
      await arenaApi.changeAdminPassword({ current_password: current, code: code.trim(), new_password: next })
      await refreshSession()
      setCurrent(''); setCode(''); setNext(''); setAgain('')
      setStep('done')
      toast('success', 'Đã đổi mật khẩu')
    } catch (e) { fail(e, 'Chưa đổi được mật khẩu.') } finally { setBusy(false) }
  }

  return (
    <Card icon={<LockKeyhole />} title="Bảo mật tài khoản" subtitle={`Đổi mật khẩu ${owner ? 'tài khoản chủ' : `của ${session.display_name || username}`}. Cần mật khẩu hiện tại và mã 6 số gửi tới email đã đăng ký.`} action={<Badge tone="success"><ShieldCheck className="size-3" />Xác thực 2 lớp</Badge>}>
      <div className="space-y-5">
        <Stepper step={step} />
        {error && <p role="alert" data-testid="sec-error" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

        {step === 'verify' && (
          <form className="max-w-md space-y-3" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
            <Field label="Mật khẩu hiện tại" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />Sau khi mật khẩu đúng, hệ thống gửi mã 6 số tới email {owner ? 'của ban tổ chức' : 'đã đặt cho tài khoản giám khảo của bạn'}. Sai mật khẩu 5 lần sẽ bị khóa 15 phút.</p>
            <Button type="submit" loading={busy} disabled={!current}><Mail className="size-4" />Gửi mã xác thực</Button>
          </form>
        )}

        {step === 'code' && (
          <form className="max-w-md space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void submit() }}>
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">Đã gửi mã tới <strong data-testid="sec-sent-to">{sentTo}</strong>. {left > 0 ? <>Mã còn hiệu lực <strong className="tabular-nums">{clock(left)}</strong>.</> : <span className="text-red-600 dark:text-red-400">Mã đã hết hạn, hãy gửi mã mới.</span>}</p>
            <Field label="Mã xác thực 6 số" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.35em' }} autoFocus />
            <Field label="Mật khẩu mới" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <PasswordRules password={next} current={current} username={username} />
            <Field label="Nhập lại mật khẩu mới" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" hint={again && next !== again ? 'Hai mật khẩu chưa khớp.' : undefined} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} disabled={!valid || left === 0}><KeyRound className="size-4" />Đổi mật khẩu</Button>
              <Button type="button" variant="secondary" disabled={busy || wait > 0} onClick={() => void sendCode()}>{wait > 0 ? `Gửi lại mã sau ${wait} giây` : 'Gửi lại mã'}</Button>
              <Button type="button" variant="ghost" onClick={() => { setStep('verify'); setError('') }}>Quay lại</Button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div data-testid="sec-done" className="max-w-md space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-5" />Đã đổi mật khẩu</p>
            <p className="text-muted-foreground">Mọi thiết bị khác đang đăng nhập tài khoản này đã bị đăng xuất. Hệ thống đã gửi email cảnh báo về lần đổi này. Thiết bị hiện tại vẫn đăng nhập bình thường.</p>
            <Button variant="secondary" onClick={() => setStep('verify')}>Xong</Button>
          </div>
        )}
      </div>
    </Card>
  )
}
