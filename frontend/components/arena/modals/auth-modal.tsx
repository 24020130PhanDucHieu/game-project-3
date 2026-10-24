'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { HumanCheck, type HumanProof } from './human-check'
import { PRIVACY_ITEMS } from '../live/privacy-policy'

export type AuthModalMode = 'login' | 'register' | 'forgot'

export function AuthModal({
  open,
  onClose,
  initialMode = 'login',
  onLoginSuccess,
}: {
  open: boolean
  onClose: () => void
  initialMode?: AuthModalMode
  onLoginSuccess?: (role: 'team' | 'admin', name: string, sid: string) => void
}) {
  const [mode, setMode] = useState<AuthModalMode>(initialMode)
  useEffect(() => { if (open) setMode(initialMode) }, [open, initialMode])

  // Login State
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [showLoginPass, setShowLoginPass] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [asOrganizer, setAsOrganizer] = useState(false)

  // Register State
  const [regSid, setRegSid] = useState('')
  const [regName, setRegName] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [showRegPass, setShowRegPass] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [regSuccess, setRegSuccess] = useState<string | null>(null)
  const [regAgree, setRegAgree] = useState(false)

  // Forgot Password State
  const [forgotSid, setForgotSid] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotToken, setForgotToken] = useState('')
  const [forgotNewPass, setForgotNewPass] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState<string | null>(null)

  // Ô "Tôi không phải robot": mỗi lời giải dùng một lần nên tích lại sau mỗi lần gửi.
  const [proof, setProof] = useState<HumanProof | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const spendProof = () => setProofKey((k) => k + 1)
  useEffect(() => { setProofKey((k) => k + 1) }, [mode, open])

  if (!open) return null

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)

    const userClean = loginUser.trim().toUpperCase()
    const organizer = asOrganizer || userClean === 'ADMIN' || userClean === 'BTC'
    if (!proof) {
      setLoginError('Hãy tích ô “Tôi không phải robot” trước khi đăng nhập.')
      setLoginLoading(false)
      return
    }
    try {
      if (organizer) {
        const res = await arenaApi.loginAdmin(loginPass, loginUser.trim(), proof)
        onLoginSuccess?.('admin', res.display_name || 'Ban Tổ Chức (Admin)', res.judge || 'ADMIN')
        onClose()
      } else {
        const res = await arenaApi.loginTeam(loginUser.trim(), loginPass, proof)
        onLoginSuccess?.(
          'team',
          res.team_name || loginUser.trim(),
          res.student_id || loginUser.trim(),
        )
        onClose()
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.')
    } finally {
      spendProof()
      setLoginLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError(null)
    setRegSuccess(null)

    if (regPass.length < 6) {
      setRegError('Mật khẩu phải từ 6 ký tự trở lên.')
      return
    }
    if (!regAgree) {
      setRegError('Hãy đọc và đồng ý quy chế giải cùng cách xử lý dữ liệu cá nhân trước khi đăng ký.')
      return
    }
    if (!proof) {
      setRegError('Hãy tích ô “Tôi không phải robot” trước khi đăng ký.')
      return
    }

    setRegLoading(true)
    try {
      await arenaApi.registerTeam({
        student_id: regSid.trim(),
        team_name: regName.trim(),
        password: regPass,
        email: regEmail.trim(),
        ...proof,
      })
      setRegSuccess(`Đăng ký thành công đội "${regName}"! Bạn có thể đăng nhập ngay.`)
      setTimeout(() => {
        setMode('login')
        setLoginUser(regSid)
        setRegSuccess(null)
      }, 1200)
    } catch (err: any) {
      setRegError(err?.message || 'Không thể đăng ký đội. Vui lòng thử lại.')
    } finally {
      spendProof()
      setRegLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in-0">
      <div className="w-full max-w-[460px] overflow-hidden rounded-[24px] border border-border bg-card p-8 sm:p-9 shadow-[0_20px_45px_-12px_rgba(15,23,42,0.15)] animate-in zoom-in-95">
        {mode === 'login' && (
          <div>
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
              Đăng nhập
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Đăng nhập tài khoản đội thi hoặc Ban tổ chức.
            </p>

            {loginError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300 font-medium">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
              {/* Field 1: Username / MSSV */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="inp-login-user"
                  className="text-[13.5px] font-semibold text-foreground"
                >
                  {asOrganizer ? 'Tên đăng nhập giám khảo' : 'Mã sinh viên hoặc email'}
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    id="inp-login-user"
                    type="text"
                    required
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    autoComplete="username"
                    placeholder={asOrganizer ? 'VD: gk.lan (hoặc admin)' : 'VD: 24020001 hoặc ten@gmail.com'}
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>

              {/* Field 2: Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="inp-login-pass"
                    className="text-[13.5px] font-semibold text-foreground"
                  >
                    Mật khẩu
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    id="inp-login-pass"
                    type={showLoginPass ? 'text' : 'password'}
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPass((v) => !v)}
                    className="p-1 text-muted-foreground transition hover:text-foreground"
                    aria-label={showLoginPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showLoginPass ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <HumanCheck value={proof} onChange={setProof} resetKey={proofKey} />

              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <input type="checkbox" className="accent-primary" checked={asOrganizer} onChange={(e) => setAsOrganizer(e.target.checked)} />
                Đăng nhập Ban tổ chức / Giám khảo
              </label>

              {/* Submit Button matching Image 3 */}
              <button
                type="submit"
                disabled={loginLoading}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:brightness-110 active:translate-y-0.5 disabled:opacity-60"
              >
                {loginLoading ? 'Đang xác thực...' : 'Đăng nhập'}
              </button>
            </form>

            {/* Secondary Action Buttons matching Image 3 */}
            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setMode('register')}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted hover:border-ring"
              >
                Chưa có tài khoản?{' '}
                <strong className="ml-1 font-bold text-foreground">
                  Đăng ký đội thi
                </strong>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted hover:border-ring"
              >
                Quay về trang chủ
              </button>
            </div>

            {/* Disclaimer Footer Note matching Image 3 */}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              Đội thi đăng nhập bằng Mã sinh viên (MSSV) hoặc email đã đăng ký, cùng mật khẩu đã tạo. Ban Tổ
              Chức sử dụng tài khoản Quản trị viên.
            </p>
          </div>
        )}

        {mode === 'register' && (
          <div>
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
              Đăng ký đội thi
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Khởi tạo tài khoản thi đấu mới cho đội của bạn.
            </p>

            {regError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300 font-medium">
                {regError}
              </div>
            )}
            {regSuccess && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {regSuccess}
              </div>
            )}

            <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Mã sinh viên (Đội trưởng)
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="text"
                    required
                    value={regSid}
                    onChange={(e) => setRegSid(e.target.value)}
                    placeholder="Ví dụ: 24020001"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Tên đội thi đấu
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ví dụ: K69 CyberBots"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Mật khẩu
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type={showRegPass ? 'text' : 'password'}
                    required
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder="Ít nhất 6 ký tự"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPass((v) => !v)}
                    className="p-1 text-muted-foreground transition hover:text-foreground"
                  >
                    {showRegPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Email (để khôi phục mật khẩu)
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="ten@gmail.com"
                    autoComplete="email"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Dùng để đăng nhập thay cho MSSV và nhận mã khôi phục mật khẩu. Mỗi email chỉ gắn với một đội.</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 text-[12.5px]">
                <label className="flex cursor-pointer items-start gap-2 font-medium text-foreground">
                  <input type="checkbox" className="mt-0.5 accent-primary" checked={regAgree} onChange={(e) => setRegAgree(e.target.checked)} aria-label="Đồng ý quy chế và xử lý dữ liệu cá nhân" />
                  <span>Tôi đồng ý với quy chế giải và việc ban tổ chức xử lý dữ liệu cá nhân của đội để tổ chức giải.</span>
                </label>
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-primary">Xem dữ liệu được thu và quyền của bạn</summary>
                  <ul className="mt-2 space-y-1.5">{PRIVACY_ITEMS.map((item) => <li key={item.title}><strong className="text-foreground">{item.title}:</strong> {item.body}</li>)}</ul>
                </details>
              </div>

              <HumanCheck value={proof} onChange={setProof} resetKey={proofKey} />

              <button
                type="submit"
                disabled={regLoading}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
              >
                {regLoading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
              </button>
            </form>

            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Đã có tài khoản?{' '}
                <strong className="ml-1 font-bold text-foreground">
                  Đăng nhập ngay
                </strong>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Quay về trang chủ
              </button>
            </div>
          </div>
        )}

        {mode === 'forgot' && (
          <div>
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
              Quên mật khẩu
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Xác minh MSSV đội trưởng để lấy lại quyền truy cập.
            </p>

            {forgotMsg && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 font-medium">
                {forgotMsg}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!proof) { setForgotMsg('Hãy tích ô “Tôi không phải robot” trước khi gửi yêu cầu.'); return }
                setForgotLoading(true)
                setForgotMsg(null)
                try {
                  const response = await arenaApi.forgotPassword(forgotSid.trim(), forgotEmail.trim(), proof) as { message?: string }
                  setForgotMsg(response.message || 'Vui lòng liên hệ ban tổ chức để xác minh danh tính.')
                } catch (error) {
                  setForgotMsg(error instanceof Error ? error.message : 'Không gửi được yêu cầu.')
                } finally {
                  spendProof()
                  setForgotLoading(false)
                }
              }}
              className="mt-6 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Mã sinh viên (MSSV)
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary">
                  <input
                    type="text"
                    required
                    value={forgotSid}
                    onChange={(e) => setForgotSid(e.target.value)}
                    placeholder="Mã sinh viên"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13.5px] font-semibold text-foreground">
                  Email đã đăng ký của đội
                </label>
                <div className="flex h-12 items-center rounded-xl border border-input bg-card px-3.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="ten@gmail.com"
                    autoComplete="email"
                    className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Chúng tôi gửi mã khôi phục (hiệu lực 15 phút) tới email này nếu khớp với tài khoản.</p>
              </div>

              <HumanCheck value={proof} onChange={setProof} resetKey={proofKey} />

              <button
                type="submit"
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm transition hover:brightness-110"
              >
                {forgotLoading ? 'Đang gửi...' : 'Gửi mã khôi phục qua email'}
              </button>
            </form>

            <form onSubmit={async (e) => {
              e.preventDefault()
              setForgotLoading(true)
              setForgotMsg(null)
              try {
                const response = await arenaApi.resetPassword(forgotSid.trim(), forgotToken.trim(), forgotNewPass) as { message?: string }
                setForgotMsg(response.message || 'Đã đổi mật khẩu. Bạn có thể đăng nhập.')
              } catch (error) {
                setForgotMsg(error instanceof Error ? error.message : 'Không thể đặt lại mật khẩu.')
              } finally {
                setForgotLoading(false)
              }
            }} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
              <p className="text-sm font-semibold">Đã nhận mã từ ban tổ chức?</p>
              <input required value={forgotToken} onChange={(e) => setForgotToken(e.target.value)} placeholder="Mã đặt lại mật khẩu" className="h-11 rounded-xl border border-input bg-background px-3" />
              <input required minLength={6} type="password" value={forgotNewPass} onChange={(e) => setForgotNewPass(e.target.value)} placeholder="Mật khẩu mới" className="h-11 rounded-xl border border-input bg-background px-3" />
              <button type="submit" disabled={forgotLoading} className="h-11 rounded-xl bg-brand font-semibold text-white disabled:opacity-50">Đặt lại mật khẩu</button>
            </form>

            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Quay lại đăng nhập
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
