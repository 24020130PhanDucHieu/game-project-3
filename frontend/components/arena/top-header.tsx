'use client'

import { Bell, ChevronDown, CloudOff, LogIn, LogOut, Menu, Trophy, User, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, Pill } from './primitives'

export type AuthMode = 'team' | 'guest' | 'admin'

export function TopHeader({
  title,
  auth,
  teamName = 'ap (Cú Đêm K69)',
  teamSid = '24020277',
  activeTournamentName = 'Giải Đấu BOT K69 Mùa 2',
  isOffline = false,
  outboxCount = 0,
  unreadNotifsCount = 2,
  onLogout,
  onOpenMenu,
  onOpenTournList,
  onOpenLogin,
  onOpenRegister,
  onOpenNotifications,
  onOpenProfile,
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
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"
        aria-label="Mở menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Breadcrumb và Bộ chọn giải đấu */}
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onOpenTournList}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm transition hover:bg-secondary"
          title="Bấm để chuyển đổi giải đấu"
        >
          <Trophy className="size-3.5 text-warning" />
          <span className="max-w-[140px] truncate sm:max-w-xs">{activeTournamentName}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>

        <span className="hidden text-border md:inline">/</span>
        <span className="hidden truncate font-medium text-foreground md:inline">{title}</span>
      </div>

      {/* Cụm hành động bên phải */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Chỉ báo ngoại tuyến (Offline Outbox) */}
        {isOffline && (
          <Pill tone="warning" className="cursor-pointer" title="Đang ngoại tuyến, bài nộp được lưu cục bộ">
            <CloudOff className="size-3" />
            <span className="hidden sm:inline">Offline</span>
            {outboxCount > 0 && <span className="font-mono font-bold">({outboxCount})</span>}
          </Pill>
        )}

        {/* Nút Chuông Thông báo */}
        {auth !== 'guest' && <button
          type="button"
          onClick={onOpenNotifications}
          className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
          aria-label="Trung tâm thông báo"
        >
          <Bell className="size-4" />
          {unreadNotifsCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
              {unreadNotifsCount}
            </span>
          )}
        </button>}

        <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />

        {/* Trạng thái xác thực */}
        {auth === 'team' ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-1 pr-2 shadow-sm">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 text-left"
              title="Xem hồ sơ đội"
            >
              <div className="flex size-7 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                AP
              </div>
              <div className="hidden min-w-0 pr-1 lg:block">
                <p className="truncate text-xs font-semibold leading-none text-foreground">{teamName}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{teamSid}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Đăng xuất"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        ) : auth === 'admin' ? (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-accent/60 py-1 pl-2.5 pr-2 shadow-sm">
            <span className="text-xs font-bold text-primary">ADMIN (BTC)</span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Đăng xuất Admin"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Btn variant="outline" size="sm" onClick={onOpenLogin}>
              <LogIn className="size-3.5" />
              <span className="hidden sm:inline">Đăng nhập</span>
            </Btn>
            <Btn variant="primary" size="sm" onClick={onOpenRegister}>
              <UserPlus className="size-3.5" />
              <span className="hidden sm:inline">Đăng ký đội</span>
            </Btn>
          </div>
        )}
      </div>
    </header>
  )
}
