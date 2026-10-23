'use client'

/**
 * Trạng thái giao diện của prototype (vai trò, điều hướng, thông báo, hộp
 * thư ngoại tuyến, cửa sổ nhận bài). Tách khỏi phần trình bày để có thể thay
 * bằng JavaScript thuần khi đưa về Go template.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  initialNotifications,
  type Notification,
  type Role,
  type ViewId,
} from '@/lib/arena-data'

export type ToastTone = 'success' | 'warning' | 'error' | 'info'
export type Toast = { id: number; tone: ToastTone; title: string; body?: string; key?: string }

export type OutboxStatus = 'waitingNetwork' | 'awaitingConfirm' | 'needLogin' | 'needAction' | 'savedLocal'
export type OutboxEntry = {
  id: string
  context: string
  heat: string
  lang: 'py' | 'cpp'
  code: string
  savedAt: string
  status: OutboxStatus
  attempts: number
}

export type SubmissionWindow = 'open' | 'intermission' | 'closed'

type State = {
  role: Role
  setRole: (r: Role) => void
  view: ViewId
  navigate: (v: ViewId) => void
  online: boolean
  setOnline: (v: boolean) => void
  sessionExpired: boolean
  setSessionExpired: (v: boolean) => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  notifications: Notification[]
  markRead: (id?: string) => void
  broadcast: (n: Pick<Notification, 'title' | 'body' | 'target'>) => void
  outbox: OutboxEntry[]
  addToOutbox: (e: Omit<OutboxEntry, 'id' | 'savedAt' | 'status' | 'attempts'>) => void
  syncOutbox: () => Promise<void>
  removeOutbox: (id: string) => void
  matchWindow: SubmissionWindow
  setMatchWindow: (w: SubmissionWindow) => void
  outboxOpen: boolean
  setOutboxOpen: (v: boolean) => void
}

const Ctx = createContext<State | null>(null)

export function useArena() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useArena must be used inside ArenaProvider')
  return ctx
}

const now = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function ArenaProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('team')
  const [view, setView] = useState<ViewId>('match')
  const [online, setOnline] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [notifications, setNotifications] = useState(initialNotifications)
  const [outbox, setOutbox] = useState<OutboxEntry[]>([
    {
      id: 'ob-1',
      context: 'Vòng loại OTTV2 K69 – Đợt 1',
      heat: 'Bài vòng loại',
      lang: 'py',
      code: '# bản nháp lưu khi mất mạng\nprint(0, 0, 0, 0)\n',
      savedAt: '19:58:12',
      status: 'needAction',
      attempts: 2,
    },
  ])
  const [matchWindow, setMatchWindow] = useState<SubmissionWindow>('open')
  const [outboxOpen, setOutboxOpen] = useState(false)
  const seq = useRef(1)

  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = seq.current++
      setToasts((list) => [...list.filter((x) => !t.key || x.key !== t.key), { ...t, id }].slice(-4))
      setTimeout(() => dismissToast(id), 5000)
    },
    [dismissToast],
  )

  const setRole = useCallback((r: Role) => {
    setRoleState(r)
    setView((v) => {
      if (r !== 'admin' && v === 'admin') return 'overview'
      if (r !== 'team' && v === 'profile') return 'overview'
      if (r !== 'guest' && v === 'login') return 'overview'
      return v
    })
  }, [])

  const addToOutbox: State['addToOutbox'] = useCallback(
    (e) =>
      setOutbox((l) => [
        { ...e, id: `ob-${Date.now()}`, savedAt: now(), status: 'waitingNetwork', attempts: 0 },
        ...l,
      ]),
    [],
  )

  const syncOutbox = useCallback(async () => {
    if (!online) {
      setOutbox((l) => l.map((e) => ({ ...e, status: 'waitingNetwork', attempts: e.attempts + 1 })))
      toast({ tone: 'warning', title: 'Chưa có kết nối mạng', body: 'Bài vẫn được giữ trên thiết bị.', key: 'outbox' })
      return
    }
    if (sessionExpired) {
      setOutbox((l) => l.map((e) => ({ ...e, status: 'needLogin' })))
      toast({ tone: 'error', title: 'Phiên đăng nhập đã hết hạn', body: 'Đăng nhập lại để gửi bài. Mã nguồn vẫn được giữ.', key: 'outbox' })
      return
    }
    setOutbox((l) => l.map((e) => ({ ...e, status: 'awaitingConfirm' })))
    await new Promise((r) => setTimeout(r, 1200))
    setOutbox([])
    toast({ tone: 'success', title: 'Đã đồng bộ bài nộp', body: 'Server đã nhận bài. Bài sẽ được kiểm tra trong sandbox.', key: 'outbox' })
  }, [online, sessionExpired, toast])

  const value = useMemo<State>(
    () => ({
      role,
      setRole,
      view,
      navigate: setView,
      online,
      setOnline,
      sessionExpired,
      setSessionExpired,
      toasts,
      toast,
      dismissToast,
      notifications,
      markRead: (id) =>
        setNotifications((l) => l.map((n) => (!id || n.id === id ? { ...n, unread: false } : n))),
      broadcast: (n) =>
        setNotifications((l) => [{ ...n, id: `n-${Date.now()}`, time: 'Vừa xong', unread: true }, ...l]),
      outbox,
      addToOutbox,
      syncOutbox,
      removeOutbox: (id) => setOutbox((l) => l.filter((e) => e.id !== id)),
      matchWindow,
      setMatchWindow,
      outboxOpen,
      setOutboxOpen,
    }),
    [role, setRole, view, online, sessionExpired, toasts, toast, dismissToast, notifications, outbox, addToOutbox, syncOutbox, matchWindow, outboxOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
