'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const COMMON = new Set(['admin123', 'admin1234', 'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou1', 'matkhau123', 'k69arena123', 'botk69arena', 'admin@123', 'abc12345', 'letmein123'])

export type PasswordCheck = { id: string; label: string; ok: boolean }

/** Cùng quy tắc với máy chủ (repository.ValidateAdminPassword); máy chủ vẫn là nơi quyết định cuối cùng. */
export function passwordChecks(password: string, current: string, username: string): PasswordCheck[] {
  const u = username.trim().toLowerCase()
  return [
    { id: 'len', label: 'Từ 10 đến 72 ký tự', ok: password.length >= 10 && new TextEncoder().encode(password).length <= 72 },
    { id: 'mix', label: 'Có cả chữ và số', ok: /\p{L}/u.test(password) && /\p{N}/u.test(password) },
    { id: 'diff', label: 'Khác mật khẩu hiện tại', ok: !!password && password !== current },
    { id: 'common', label: 'Không phải mật khẩu phổ biến', ok: !!password && !COMMON.has(password.toLowerCase()) },
    ...(u.length >= 3 ? [{ id: 'user', label: 'Không chứa tên đăng nhập', ok: !password.toLowerCase().includes(u) }] : []),
  ]
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0
  let score = 0
  if (password.length >= 10) score++
  if (password.length >= 14) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(3, Math.max(1, score - 0)) as 1 | 2 | 3
}

export function PasswordRules({ password, current, username }: { password: string; current: string; username: string }) {
  const checks = passwordChecks(password, current, username)
  const level = passwordStrength(password)
  const tone = ['bg-muted', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500'][password ? level : 0]
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex gap-1.5" role="img" aria-label={`Độ mạnh mật khẩu: ${['chưa nhập', 'yếu', 'khá', 'mạnh'][password ? level : 0]}`}>
        {[1, 2, 3].map((i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', password && level >= i ? tone : 'bg-muted')} />)}
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} data-ok={c.ok} className={cn('flex items-center gap-1.5', c.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            {c.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}{c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
