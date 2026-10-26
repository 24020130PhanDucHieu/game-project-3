'use client'

import { AiLauncher } from './ai-assistant'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, Bell, BrainCircuit, Flag, LayoutDashboard, LogIn, LogOut, Medal, Menu, Monitor, Moon, Network, RefreshCw, Shield, Sun, Swords, UserPlus, UserRound, WifiOff, X, type LucideIcon } from 'lucide-react'
import { AuthModal } from '../modals/auth-modal'
import { invalidate } from '@/lib/cache'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Avatar, Badge, Button } from './ui'
import { useLive, type ViewId } from './context'
import { ProfileView, NotificationList } from './views/profile'
import { OverviewView } from './views/overview'
import { BracketView } from './views/bracket'
import { RankingView } from './views/ranking'
import { MatchView } from './views/match'
import { QualifierView } from './views/qualifier'
import { AiCupView } from './views/ai-cup'
import { GuideView } from './views/guide'
import { AdminView } from './views/admin'
import { AlertsToggle, AlertsWatcher } from './alerts'
import { StageView } from './views/stage'

const NAV: { id: ViewId; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { id: 'profile', label: 'Hồ sơ đội', icon: UserRound },
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'bracket', label: 'Bảng đấu', icon: Network },
  { id: 'ranking', label: 'Xếp hạng', icon: Medal },
  { id: 'match', label: 'Trận đấu', icon: Swords },
  { id: 'qualifier', label: 'Vòng loại', icon: Flag },
  { id: 'aicup', label: 'Giải AI', icon: BrainCircuit },
  { id: 'guide', label: 'Hướng dẫn thi đấu', icon: BookOpen },
  { id: 'admin', label: 'Quản trị Admin', icon: Shield, adminOnly: true },
]

const TOURNAMENT_VIEWS: ViewId[] = ['overview', 'bracket', 'match']

function ThemeToggle() {
  const { mode, setMode, resolved } = useTheme()
  const next: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
  const label = { system: 'Theo hệ thống', light: 'Giao diện sáng', dark: 'Giao diện tối' }[mode]
  return (
    <Button variant="ghost" size="sm" onClick={() => setMode(next[mode])} aria-label={`Đổi giao diện (hiện tại: ${label})`} title={label}>
      {mode === 'system' ? <Monitor className="size-4" /> : resolved === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}

function NotificationBell() {
  const { notifications, role, navigate } = useLive()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const unread = role === 'GUEST' ? 0 : notifications.data?.unread_count || 0
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} aria-expanded={open} className="relative">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">{unread > 9 ? '9+' : unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,26rem)] rounded-2xl border border-border bg-card p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Thông báo</h3><button className="text-xs font-semibold text-primary hover:underline" onClick={() => { setOpen(false); navigate(role === 'GUEST' ? 'overview' : 'profile') }}>Xem tất cả</button></div>
          <div className="max-h-96 overflow-y-auto"><NotificationList limit={6} onOpenItem={() => setOpen(false)} /></div>
        </div>
      )}
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="font-display bg-brand glow flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-primary-foreground">K69</div>
      <div className="min-w-0 leading-tight"><strong className="font-display block truncate text-sm font-extrabold">BOT K69 <span className="gradient-text">ARENA</span></strong><span className="text-xs text-muted-foreground">Đấu Trường Lập Trình</span></div>
    </div>
  )
}

function SidebarBody({ onPick }: { onPick: () => void }) {
  const { view, navigate, role, session, logout, outbox } = useLive()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center border-b border-border px-5"><Brand /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Điều hướng chính">
        <p className="mb-2 px-3 text-[11px] font-bold tracking-widest text-muted-foreground">THI ĐẤU</p>
        {NAV.filter((item) => !item.adminOnly || role === 'ADMIN').map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button key={item.id} aria-current={active ? 'page' : undefined} onClick={() => { navigate(item.id); onPick() }}
              className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors', active ? 'bg-gradient-to-r from-primary/25 via-primary/10 to-transparent font-bold text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:translate-x-0.5 hover:bg-muted/70 hover:text-foreground')}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg transition-colors', active ? 'icon-tile text-primary' : 'text-muted-foreground')}><Icon className="size-[18px]" aria-hidden /></span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {(item.id === 'qualifier' || item.id === 'aicup') && outbox.length > 0 && <Badge tone="warning">{outbox.length}</Badge>}
              {item.adminOnly && <Badge tone="accent">ADMIN</Badge>}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <Avatar name={role === 'GUEST' ? 'Khách' : session.team_name || session.display_name || 'Admin'} size="md" ring={role === 'ADMIN' ? 'gold' : undefined} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{role === 'GUEST' ? 'Khách tham quan' : session.team_name || session.display_name || session.student_id || 'Quản trị viên'}</p>
            <p className="truncate text-xs text-muted-foreground">{role === 'ADMIN' ? (session.judge ? `Giám khảo · ${session.judge}` : 'Tài khoản chủ BTC') : role === 'TEAM' ? `MSSV ${session.student_id}` : 'Chưa đăng nhập'}</p></div>
        </div>
        {role !== 'GUEST' && <button onClick={() => void logout()} className="mt-3 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground hover:text-red-600 dark:hover:text-red-400"><LogOut className="size-4" />Đăng xuất</button>}
      </div>
    </div>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { view, role, tournamentId, socketOpen, openAuth, busy, logout } = useLive()
  const showTournament = TOURNAMENT_VIEWS.includes(view) || (view === 'admin')
  const [spinning, setSpinning] = useState(false)
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/70 px-4 py-3 backdrop-blur-xl md:px-8">
      <Button variant="ghost" size="sm" className="md:hidden" aria-label="Mở menu" onClick={onMenu}><Menu className="size-5" /></Button>
      <div className="md:hidden"><Brand /></div>
      <div className="ml-auto flex items-center gap-1.5">
        {showTournament && tournamentId && (
          <span className={cn('flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold sm:px-2.5', socketOpen ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/30 text-amber-700 dark:text-amber-300')} title={socketOpen ? 'Nhận cập nhật tức thời từ server' : 'Mất kết nối trực tiếp — dữ liệu được làm mới định kỳ'}>
            {socketOpen ? <span className="dot-live size-1.5 rounded-full bg-current" aria-hidden /> : <WifiOff className="size-3.5" />}<span className="hidden sm:inline">{socketOpen ? 'Trực tiếp' : 'Định kỳ'}</span>
          </span>
        )}
        <Button variant="ghost" size="sm" aria-label="Làm mới dữ liệu" disabled={busy} onClick={() => { setSpinning(true); invalidate(''); window.setTimeout(() => setSpinning(false), 700) }}><RefreshCw className={cn('size-4', spinning && 'animate-spin')} /></Button>
        <ThemeToggle />
        {role !== 'GUEST' && <AlertsToggle />}
        <NotificationBell />
        {role === 'GUEST' ? (
          <>
            <Button size="sm" variant="secondary" aria-label="Đăng ký" onClick={() => openAuth('register')}><UserPlus className="size-4" /><span className="hidden sm:inline">Đăng ký</span></Button>
            <Button size="sm" onClick={() => openAuth('login')}><LogIn className="size-4" />Đăng nhập</Button>
          </>
        ) : (
          <>
            <Badge tone={role === 'ADMIN' ? 'accent' : 'info'}>{role === 'ADMIN' ? 'Ban tổ chức' : 'Đội thi'}</Badge>
            <Button variant="ghost" size="sm" className="md:hidden" aria-label="Đăng xuất" onClick={() => void logout()}><LogOut className="size-4" /></Button>
          </>
        )}
      </div>
    </header>
  )
}

export function Shell() {
  const { view, authRequest, closeAuth, refreshSession, navigate } = useLive()
  const [drawer, setDrawer] = useState(false)
  const [stage, setStage] = useState(false)
  useEffect(() => {
    const read = () => setStage(window.location.hash === '#trinh-chieu')
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [view])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Bỏ qua điều hướng</a>
      <aside className="hidden w-[264px] shrink-0 border-r border-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:block md:h-dvh">
        <SidebarBody onPick={() => undefined} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Menu điều hướng" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-sidebar text-sidebar-foreground shadow-xl">
            <button className="absolute right-2 top-2 z-10 rounded-lg p-2 text-muted-foreground hover:bg-muted" autoFocus aria-label="Đóng menu" onClick={() => setDrawer(false)}><X className="size-5" /></button>
            <SidebarBody onPick={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Topbar onMenu={() => setDrawer(true)} />
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          {view === 'profile' && <ProfileView />}
          {view === 'overview' && <OverviewView />}
          {view === 'bracket' && <BracketView />}
          {view === 'ranking' && <RankingView />}
          {view === 'match' && <MatchView />}
          {view === 'qualifier' && <QualifierView />}
          {view === 'aicup' && <AiCupView />}
          {view === 'guide' && <GuideView />}
          {view === 'admin' && <AdminView />}
        </main>
        <AiLauncher />
      </div>
      <AlertsWatcher />
      {stage && <StageView onExit={() => { history.replaceState(null, '', window.location.pathname + window.location.search); setStage(false) }} />}
      <AuthModal
        open={!!authRequest}
        initialMode={authRequest?.mode ?? 'login'}
        onClose={closeAuth}
        onLoginSuccess={() => { invalidate(''); void refreshSession(); navigate('overview') }}
      />
    </div>
  )
}
