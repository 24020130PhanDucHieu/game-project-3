'use client'

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, LogIn, ShieldAlert, UserCheck, UserPlus } from 'lucide-react'
import { Btn, Field, Modal, Notice, SegmentedTabs } from '../primitives'
import { arenaApi } from '@/lib/api-client'

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
  
  // Login State
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [showLoginPass, setShowLoginPass] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Register State
  const [regSid, setRegSid] = useState('')
  const [regName, setRegName] = useState('')
  const [regPass, setRegPass] = useState('')
  const [showRegPass, setShowRegPass] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [regSuccess, setRegSuccess] = useState<string | null>(null)

  // Forgot Password 2-Step State
  const [forgotStep, setForgotStep] = useState<1 | 2>(1)
  const [forgotSid, setForgotSid] = useState('')
  const [forgotToken, setForgotToken] = useState('')
  const [forgotNewPass, setForgotNewPass] = useState('')
  const [showForgotPass, setShowForgotPass] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState<{ tone: 'neutral' | 'success' | 'warning'; text: string } | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)

    const userClean = loginUser.trim().toUpperCase()
    try {
      if (userClean === 'ADMIN' || userClean === 'BTC') {
        await arenaApi.loginAdmin(loginPass)
        onLoginSuccess?.('admin', 'Ban Tổ Chức (Admin)', 'ADMIN')
        onClose()
      } else {
        const res = await arenaApi.loginTeam(loginUser.trim(), loginPass)
        onLoginSuccess?.('team', res.team_name || loginUser.trim(), res.student_id || loginUser.trim())
        onClose()
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Không thể đăng nhập. Vui lòng thử lại.')
    } finally {
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

    setRegLoading(true)
    try {
      await arenaApi.registerTeam({
        student_id: regSid.trim(),
        team_name: regName.trim(),
        password: regPass,
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
      setRegLoading(false)
    }
  }

  async function handleForgotStep1(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    setForgotMsg(null)

    try {
      await arenaApi.forgotPassword(forgotSid.trim(), '')
      setForgotStep(2)
      setForgotMsg({
        tone: 'success',
        text: `Đã ghi nhận yêu cầu cho MSSV ${forgotSid}. Vui lòng nhập mã do Ban tổ chức cung cấp để đổi mật khẩu.`,
      })
    } catch (err: any) {
      setForgotMsg({ tone: 'warning', text: err?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.' })
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleForgotStep2(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)

    try {
      if (forgotToken.trim().length < 4) {
        setForgotMsg({ tone: 'warning', text: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' })
        return
      }
      await arenaApi.resetPassword(forgotSid.trim(), forgotToken.trim(), forgotNewPass)
      setForgotMsg({ tone: 'success', text: 'Đặt lại mật khẩu thành công! Chuyển sang đăng nhập...' })
      setTimeout(() => {
        setMode('login')
        setForgotStep(1)
        setLoginUser(forgotSid)
      }, 1000)
    } catch (err: any) {
      setForgotMsg({ tone: 'warning', text: err?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra mã.' })
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'login'
          ? 'Đăng nhập đấu trường'
          : mode === 'register'
            ? 'Đăng ký đội thi đấu mới'
            : 'Quên mật khẩu (Xác thực 2 bước)'
      }
      description={
        mode === 'login'
          ? 'Đăng nhập bằng Mã sinh viên (MSSV) cho Đội thi hoặc tài khoản Ban Tổ Chức.'
          : mode === 'register'
            ? 'Khởi tạo tài khoản thi đấu mới cho đội của bạn trên hệ thống Arena.'
            : 'Quy trình xác minh an toàn để cấp lại mật khẩu mới thông qua Ban Tổ Chức.'
      }
      size="md"
    >
      <div className="flex flex-col gap-4">
        {mode !== 'forgot' && (
          <SegmentedTabs
            label="Chế độ xác thực"
            value={mode}
            onChange={(v) => {
              setMode(v)
              setLoginError(null)
              setRegError(null)
            }}
            options={[
              { value: 'login', label: 'Đăng nhập', icon: <LogIn className="size-4" /> },
              { value: 'register', label: 'Đăng ký đội', icon: <UserPlus className="size-4" /> },
            ]}
          />
        )}

        {/* Form Đăng Nhập */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            {loginError && (
              <Notice tone="warning" icon={<ShieldAlert className="size-4" />}>
                {loginError}
              </Notice>
            )}

            <Field
              label="Tên đăng nhập hoặc MSSV"
              placeholder="Ví dụ: 24020001 hoặc admin"
              required
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              hint="Đội thi sử dụng Mã sinh viên (MSSV); BTC dùng tài khoản admin"
            />

            <Field
              label="Mật khẩu"
              type={showLoginPass ? 'text' : 'password'}
              placeholder="Nhập mật khẩu"
              required
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowLoginPass(!showLoginPass)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showLoginPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showLoginPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Bảo lưu phiên trên thiết bị này</span>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setForgotStep(1)
                }}
                className="font-medium text-primary hover:underline"
              >
                Quên mật khẩu?
              </button>
            </div>

            <Btn type="submit" variant="primary" loading={loginLoading} className="mt-2 w-full">
              <LogIn className="size-4" />
              Đăng nhập đấu trường
            </Btn>
          </form>
        )}

        {/* Form Đăng Ký */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
            {regError && (
              <Notice tone="warning" icon={<ShieldAlert className="size-4" />}>
                {regError}
              </Notice>
            )}
            {regSuccess && (
              <Notice tone="success" icon={<UserCheck className="size-4" />}>
                {regSuccess}
              </Notice>
            )}

            <Field
              label="Mã sinh viên Đội trưởng (MSSV)"
              placeholder="Ví dụ: 24020001"
              required
              value={regSid}
              onChange={(e) => setRegSid(e.target.value)}
              hint="MSSV được dùng làm tên đăng nhập chính của đội"
            />

            <Field
              label="Tên đội thi đấu"
              placeholder="Ví dụ: K69 CyberBots"
              required
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
            />

            <Field
              label="Mật khẩu (Tối thiểu 6 ký tự)"
              type={showRegPass ? 'text' : 'password'}
              placeholder="Nhập mật khẩu an toàn"
              required
              value={regPass}
              onChange={(e) => setRegPass(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowRegPass(!showRegPass)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  {showRegPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />

            <Btn type="submit" variant="primary" loading={regLoading} className="mt-2 w-full">
              <UserPlus className="size-4" />
              Hoàn tất đăng ký đội thi
            </Btn>
          </form>
        )}

        {/* Form Quên Mật Khẩu 2 Bước */}
        {mode === 'forgot' && (
          <div className="flex flex-col gap-3.5">
            {forgotMsg && (
              <Notice tone={forgotMsg.tone} icon={<KeyRound className="size-4" />}>
                {forgotMsg.text}
              </Notice>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleForgotStep1} className="flex flex-col gap-3.5">
                <Field
                  label="Mã sinh viên (MSSV) của bạn"
                  placeholder="Nhập MSSV đã đăng ký (VD: 24020001)"
                  required
                  value={forgotSid}
                  onChange={(e) => setForgotSid(e.target.value)}
                  hint="Ban tổ chức sẽ xác minh danh tính và cấp mã dùng một lần có hiệu lực 15 phút."
                />
                <div className="flex gap-2">
                  <Btn type="button" variant="outline" onClick={() => setMode('login')} className="flex-1">
                    Quay lại
                  </Btn>
                  <Btn type="submit" variant="primary" loading={forgotLoading} className="flex-1">
                    Tiếp tục xác thực
                  </Btn>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotStep2} className="flex flex-col gap-3.5">
                <Field
                  label="Mã khôi phục từ Ban Tổ Chức"
                  placeholder="Dán mã khôi phục (OTP/Token)"
                  required
                  value={forgotToken}
                  onChange={(e) => setForgotToken(e.target.value)}
                  hint="Mã xác thực do BTC cấp sau khi đối chiếu thẻ sinh viên."
                />

                <Field
                  label="Mật khẩu mới (Tối thiểu 6 ký tự)"
                  type={showForgotPass ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu mới"
                  required
                  value={forgotNewPass}
                  onChange={(e) => setForgotNewPass(e.target.value)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowForgotPass(!showForgotPass)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showForgotPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />

                <div className="flex gap-2">
                  <Btn type="button" variant="outline" onClick={() => setForgotStep(1)} className="flex-1">
                    Quay lại bước 1
                  </Btn>
                  <Btn type="submit" variant="primary" loading={forgotLoading} className="flex-1">
                    Xác nhận đổi mật khẩu
                  </Btn>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
