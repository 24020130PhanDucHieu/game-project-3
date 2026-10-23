'use client'

import {
  BookOpen,
  Flag,
  LayoutDashboard,
  Medal,
  Network,
  Shield,
  Swords,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ViewId } from '@/lib/arena-data'

type NavItem = {
  id: ViewId
  label: string
  icon: LucideIcon
  badge?: string
}

const contestNavItems: NavItem[] = [
  { id: 'profile', label: 'Hồ sơ đội', icon: UserRound },
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'bracket', label: 'Bảng đấu', icon: Network },
  { id: 'ranking', label: 'Xếp hạng', icon: Medal },
  { id: 'match', label: 'Trận đấu', icon: Swords },
  { id: 'qualifier', label: 'Vòng loại', icon: Flag },
  { id: 'guide', label: 'Hướng dẫn thi đấu', icon: BookOpen },
]

const previewNavItems: NavItem[] = [
  { id: 'admin', label: 'Quản trị Admin', icon: Shield, badge: 'ADMIN' },
]

export function Sidebar({
  view,
  onNavigate,
  open,
  onClose,
  auth = 'team',
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
          'fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#e2e8f0] bg-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Điều hướng chính"
      >
        {/* Brand Header matching Image 2 */}
        <div className="flex h-20 items-center gap-3 border-b border-[#f1f5f9] px-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#090e17] font-sans text-sm font-extrabold text-white shadow-sm">
            K69
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-[14px] font-bold text-[#0f172a]">
              BOT K69 <span className="text-[#94a3b8] font-normal">|</span> ARENA OTTV2
            </h1>
            <p className="truncate text-xs text-[#64748b]">Đấu Trường Lập Trình</p>
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

        {/* Navigation List matching Image 2 */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
            THI ĐẤU
          </p>
          <ul className="flex flex-col gap-1">
            {contestNavItems
              .filter((item) => item.id !== 'profile' || auth === 'team')
              .map((item) => {
                const Icon = item.icon
                const isActive = view === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        'flex h-11 w-full items-center gap-3.5 rounded-xl px-3.5 text-sm font-medium transition-colors text-left',
                        isActive
                          ? 'bg-[#ebeeff] font-bold text-[#383bda]'
                          : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-[18px] shrink-0',
                          isActive ? 'text-[#383bda]' : 'text-[#64748b]',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                )
              })}
          </ul>

          <p className="px-3 pb-2 pt-5 text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
            XEM TRƯỚC
          </p>
          <ul className="flex flex-col gap-1">
            {previewNavItems.map((item) => {
              const Icon = item.icon
              const isActive = view === item.id
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'flex h-11 w-full items-center gap-3.5 rounded-xl px-3.5 text-sm font-medium transition-colors text-left',
                      isActive
                        ? 'bg-[#ebeeff] font-bold text-[#383bda]'
                        : 'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-[18px] shrink-0',
                        isActive ? 'text-[#383bda]' : 'text-[#64748b]',
                      )}
                    />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#475569]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom live stage card matching Image 2 */}
        <div className="p-3">
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748b]">
                ĐANG DIỄN RA
              </span>
            </div>
            <p className="truncate text-[13px] font-bold text-[#0f172a]">
              Hiệp 3 · Đảo tương khắc
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
