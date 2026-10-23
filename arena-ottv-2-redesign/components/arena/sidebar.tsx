'use client'

import {
  Bell,
  BookOpen,
  Flag,
  LayoutDashboard,
  LogIn,
  LogOut,
  Medal,
  Network,
  ShieldCheck,
  Swords,
  UserCheck,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ViewId } from '@/lib/arena-data'
import { Btn, Pill } from './primitives'

const navItems: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'bracket', label: 'Bảng đấu', icon: Network },
  { id: 'ranking', label: 'Xếp hạng', icon: Medal },
  { id: 'match', label: 'Trận đấu (9×9)', icon: Swords },
  { id: 'qualifier', label: 'Vòng loại', icon: Flag },
  { id: 'profile', label: 'Hồ sơ đội', icon: UserRound },
  { id: 'guide', label: 'Hướng dẫn thi đấu', icon: BookOpen },
]

export function Sidebar({
  view,
  onNavigate,
  open,
  onClose,
  auth = 'team',
  teamName = 'ap (Cú Đêm K69)',
  teamSid = '24020277',
  unreadNotifsCount = 2,
  onOpenLogin,
  onOpenRegister,
  onOpenNotifications,
  onOpenPractice,
  onLogout,
}: {
  view: ViewId
  onNavigate: (view: ViewId) => void
  open: boolean
  onClose: () => void
  auth?: 'team' | 'guest' | 'admin'
  teamName?: string
  teamSid?: string
  unreadNotifsCount?: number
  onOpenLogin?: () => void
  onOpenRegister?: () => void
  onOpenNotifications?: () => void
  onOpenPractice?: () => void
  onLogout?: () => void
}) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-foreground/20 backdrop-blur-[1px] transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Điều hướng chính"
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground font-mono text-xs font-bold text-background shadow-sm">
            K69
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-foreground">
              BOT K69 <span className="text-muted-foreground">|</span> ARENA OTTV2
            </p>
            <p className="truncate text-xs text-muted-foreground">Đấu Trường Lập Trình</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* User Card (Guest vs Authenticated) */}
        <div className="border-b border-sidebar-border p-3">
          {auth === 'guest' ? (
            <div className="rounded-lg border border-border bg-secondary/50 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <UserRound className="size-3.5" />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-xs font-semibold text-foreground">Khách tham quan</p>
                  <p className="text-[10px] text-muted-foreground">Đăng nhập để nộp bot</p>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-primary py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <LogIn className="size-3" />
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="flex flex-1 items-center justify-center gap-1 rounded border border-border bg-card py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                >
                  Đăng ký
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                    {auth === 'admin' ? 'AD' : 'AP'}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {auth === 'admin' ? 'Ban Tổ Chức (Admin)' : teamName}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {auth === 'admin' ? 'SYSTEM' : teamSid}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenNotifications}
                  className="relative rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Thông báo"
                >
                  <Bell className="size-3.5" />
                  {unreadNotifsCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-2 rounded-full bg-destructive ring-1 ring-background" />
                  )}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[11px]">
                <Pill tone={auth === 'admin' ? 'warning' : 'primary'} className="text-[10px] px-1.5 py-0">
                  {auth === 'admin' ? 'QUẢN TRỊ VIÊN' : 'ĐỘI TUYỂN'}
                </Pill>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="size-3" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Thi đấu chính thức
          </p>
          <ul className="flex flex-col gap-0.5">
            {navItems.filter((item) => item.id !== 'profile' || auth === 'team').map((item) => (
              <li key={item.id}>
                <NavButton
                  active={view === item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => onNavigate(item.id)}
                />
              </li>
            ))}
          </ul>

          <p className="px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Luyện tập &amp; Quản trị
          </p>
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={onOpenPractice}
                className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Swords className="size-4 shrink-0 text-primary" />
                <span className="flex-1 truncate text-left">Đấu thử với Boss</span>
                <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">
                  SANDBOX
                </span>
              </button>
            </li>
            {auth === 'admin' && <li>
              <NavButton
                active={view === 'admin'}
                icon={ShieldCheck}
                label="Bàn Quản Trị"
                onClick={() => onNavigate('admin')}
                trailing={
                  <span className="rounded border border-border bg-secondary px-1.5 py-px font-mono text-[10px] font-medium text-muted-foreground">
                    ADMIN
                  </span>
                }
              />
            </li>}
          </ul>
        </nav>

        {/* Footer Status */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold text-foreground">Vòng 1 · Luật Chuẩn</p>
              <p className="truncate text-[10px] text-muted-foreground">Bàn cờ 9×9 · Bo5</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
  trailing,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : '')} aria-hidden />
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  )
}
