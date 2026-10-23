'use client'

import { LogOut, Menu } from 'lucide-react'
import { NotificationBell } from './notification-bell'
import { cn } from '@/lib/utils'

export type AuthMode = 'team' | 'guest' | 'admin'

export function TopHeader({
  title,
  auth,
  teamName = 'ap',
  teamSid = '24020277',
  onLogout,
  onOpenMenu,
  onOpenLogin,
  onSetAuth,
}: {
  title: string
  auth: AuthMode
  teamName?: string
  teamSid?: string
  activeTournamentName?: string
  isOffline?: boolean
  outboxCount?: number
  unreadNotifsCount?: number
  onLogout: () => void
  onOpenMenu: () => void
  onOpenTournList?: () => void
  onOpenLogin?: () => void
  onOpenRegister?: () => void
  onOpenNotifications?: () => void
  onOpenProfile?: () => void
  onSetAuth?: (role: AuthMode) => void
}) {
  const isGuest = auth === 'guest'
  const initials = (teamName || 'ap').slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e2e8f0] bg-white/95 px-6 backdrop-blur-md sm:px-8">
      {/* Breadcrumb matching Image 1, 4, 5 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
          aria-label="Mở menu"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex items-center gap-2 text-sm text-[#64748b]">
          <span className="font-normal text-[#64748b]">Arena</span>
          <span className="text-[#cbd5e1]">/</span>
          <strong className="font-bold text-[#0f172a]">{title}</strong>
        </div>
      </div>

      {/* Right side controls matching Image 1, 4, 5 */}
      <div className="flex items-center gap-3.5 sm:gap-4">
        {/* Role Switcher Pill */}
        <div
          className="hidden sm:inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f1f5f9] p-1 text-xs font-semibold"
          role="group"
          aria-label="Chế độ người dùng"
        >
          <button
            type="button"
            onClick={() => {
              if (isGuest && onOpenLogin) onOpenLogin()
              else if (onSetAuth) onSetAuth('team')
            }}
            className={cn(
              'rounded-full px-3.5 py-1.5 transition-all',
              !isGuest
                ? 'bg-[#111827] text-white shadow-sm'
                : 'text-[#64748b] hover:text-[#0f172a]',
            )}
          >
            Đã đăng nhập (Đội tuyển)
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isGuest) onLogout()
              else if (onSetAuth) onSetAuth('guest')
            }}
            className={cn(
              'rounded-full px-3.5 py-1.5 transition-all',
              isGuest
                ? 'bg-[#111827] text-white shadow-sm'
                : 'text-[#64748b] hover:text-[#0f172a]',
            )}
          >
            Khách tham quan
          </button>
        </div>

        {/* Floating Notification Popover Bell */}
        <NotificationBell />

        {/* User Account Cluster */}
        {!isGuest ? (
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3b5998] font-sans text-xs font-bold text-white shadow-sm">
              {initials}
            </div>

            <div className="hidden sm:flex flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <strong className="text-xs font-bold text-[#0f172a]">{teamName}</strong>
                <span className="rounded-md border border-[#dbeafe] bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-bold text-[#2563eb]">
                  {auth === 'admin' ? 'BAN TỔ CHỨC' : 'ĐỘI TUYỂN'}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#64748b]">
                SBD: {teamSid}
              </span>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#64748b] transition hover:bg-[#fef2f2] hover:text-[#dc2626]"
              title="Đăng xuất khỏi phiên thi đấu"
            >
              <LogOut className="size-3.5" />
              <span className="hidden md:inline">Đăng xuất</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenLogin}
            className="flex items-center gap-1.5 rounded-xl bg-[#434be6] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#343bc8]"
          >
            Đăng nhập
          </button>
        )}
      </div>
    </header>
  )
}
