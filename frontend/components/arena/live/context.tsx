'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { arenaApi, clearSessionToken, getSessionToken } from '@/lib/api-client'
import { webcamStore } from '@/lib/webcam-store'
import { registerOfflineSupport } from '@/lib/offline-engine'
import { invalidate, useResource, type Resource } from '@/lib/cache'
import { createTournamentSocket } from '@/lib/match-socket'
import { isRetryable, listOutbox, markFailed, remove as removeOutbox, type OutboxItem } from '@/lib/outbox'
import { sameStudent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './ui'

export type Role = 'GUEST' | 'TEAM' | 'ADMIN'
export type ViewId = 'profile' | 'overview' | 'bracket' | 'ranking' | 'match' | 'qualifier' | 'aicup' | 'guide' | 'admin'
export type Session = { role: Role; student_id?: string; team_name?: string; tournament_id?: string; match_id?: string; judge?: string; display_name?: string; owner?: boolean }
export type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }

type Confirm = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }

type Live = {
  view: ViewId
  navigate: (view: ViewId) => void
  session: Session
  role: Role
  scope: string
  refreshSession: () => Promise<Session>
  tournaments: Resource<any[]>
  tournamentId: string
  setTournamentId: (id: string) => void
  tournament: Resource<any>
  matchId: string
  setMatchId: (id: string) => void
  qualifiers: Resource<any[]>
  qualifierId: string
  setQualifierId: (id: string) => void
  /** Vòng loại của Giải AI (tách riêng khỏi vòng loại thường). */
  aiEvents: Resource<any[]>
  aiEventId: string
  setAiEventId: (id: string) => void
  notifications: Resource<{ notifications: any[]; unread_count: number }>
  capabilities: Resource<{ languages: string[] }>
  socketOpen: boolean
  busy: boolean
  /** Chạy một thao tác ghi, hiện toast kết quả, rồi tải lại dữ liệu liên quan. */
  run: <T>(task: () => Promise<T>, success: string, after?: () => void | Promise<unknown>) => Promise<T | undefined>
  toast: (tone: Toast['tone'], text: string) => void
  confirm: (options: Confirm) => Promise<boolean>
  /** Chọn trận để vào phòng (đội thi gọi /select để lấy phiên theo trận). */
  enterMatch: (id: string) => Promise<void>
  ownMatches: [string, any][]
  openAuth: (mode: 'login' | 'register') => void
  authRequest: { mode: 'login' | 'register' } | null
  closeAuth: () => void
  logout: () => Promise<void>
  outbox: OutboxItem[]
  flushOutbox: () => Promise<void>
}

const Ctx = createContext<Live | null>(null)

export function useLive() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLive must be used inside LiveProvider')
  return ctx
}

const GUEST: Session = { role: 'GUEST' }

export function LiveProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>('overview')
  const [session, setSession] = useState<Session>(GUEST)
  const [tournamentId, setTournamentIdState] = useState('')
  const [matchId, setMatchId] = useState('')
  const [qualifierId, setQualifierId] = useState('')
  const [aiEventId, setAiEventId] = useState('')
  const [socketOpen, setSocketOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<(Confirm & { resolve: (ok: boolean) => void }) | null>(null)
  const [authRequest, setAuthRequest] = useState<{ mode: 'login' | 'register' } | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const toastId = useRef(1)
  const role = session.role
  const scope = `${role}:${session.student_id || ''}:${session.match_id || ''}`

  const toast = useCallback((tone: Toast['tone'], text: string) => {
    const id = toastId.current++
    setToasts((list) => [...list.slice(-3), { id, tone, text }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 8000 : 4500)
  }, [])

  const confirm = useCallback((options: Confirm) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })), [])

  const refreshSession = useCallback(async (): Promise<Session> => {
    if (!getSessionToken()) {
      setSession(GUEST)
      return GUEST
    }
    try {
      const current = (await arenaApi.getSession()) as Session
      setSession(current)
      if (current.tournament_id) setTournamentIdState((old) => old || current.tournament_id || '')
      if (current.match_id) setMatchId((old) => old || current.match_id || '')
      return current
    } catch {
      setSession(GUEST)
      return GUEST
    }
  }, [])

  // Đổi phiên (đăng nhập/đăng xuất/chọn trận) -> bỏ toàn bộ dữ liệu đã lọc theo quyền của phiên cũ.
  const lastScope = useRef(scope)
  useEffect(() => {
    if (lastScope.current !== scope) {
      lastScope.current = scope
      invalidate('')
    }
  }, [scope])

  useEffect(() => { void refreshSession() }, [refreshSession])
  useEffect(() => { registerOfflineSupport() }, [])
  useEffect(() => {
    const expired = () => {
      clearSessionToken()
      webcamStore.leave()
      setSession(GUEST)
      invalidate('')
      setView((v) => (v === 'admin' ? 'overview' : v))
      toast('error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    }
    window.addEventListener('arena-session-expired', expired)
    return () => window.removeEventListener('arena-session-expired', expired)
  }, [toast])

  const tournaments = useResource<any[]>('tl', () => arenaApi.getTournamentList().then((r) => (Array.isArray(r) ? r : [])), { refreshMs: 60_000 })
  const qualifiers = useResource<any[]>('ql', () => arenaApi.getQualifiers().then((r) => (Array.isArray(r) ? r : [])), { refreshMs: 30_000 })
  const aiEvents = useResource<any[]>('ql:ai', () => arenaApi.getAiCupEvents().then((r) => (Array.isArray(r) ? r : [])), { refreshMs: 30_000 })
  const capabilities = useResource<{ languages: string[] }>('cap', () => arenaApi.getCapabilities(), { ttl: 300_000 })
  const notifications = useResource<{ notifications: any[]; unread_count: number }>(
    `nt:${scope}`,
    () => arenaApi.getNotifications().then((r) => ({ notifications: Array.isArray(r?.notifications) ? r.notifications : [], unread_count: r?.unread_count || 0 })),
    { refreshMs: 30_000 },
  )

  // Tự chọn giải: ưu tiên giải của phiên trận (đội đã vào phòng), sau đó giải đang diễn ra.
  useEffect(() => {
    const list = tournaments.data
    if (!list?.length) return
    if (!tournamentId || !list.some((t) => t.tournament_id === tournamentId)) {
      const own = session.tournament_id && list.some((t) => t.tournament_id === session.tournament_id) ? session.tournament_id : ''
      // Mặc định chọn giải thường; giải chính của Giải AI được mở từ tab Giải AI hoặc bộ chọn giải.
      const regular = list.filter((t) => t.track !== 'AI')
      const pool = regular.length ? regular : list
      setTournamentIdState(own || pool.find((t) => t.status === 'RUNNING')?.tournament_id || pool[0].tournament_id)
    }
  }, [tournaments.data, tournamentId, session.tournament_id])
  // Phiên trận mới (vào phòng trận khác giải) thì chuyển sang đúng giải đó.
  const lastSessionTournament = useRef('')
  useEffect(() => {
    const id = session.tournament_id || ''
    if (id && id !== lastSessionTournament.current) {
      lastSessionTournament.current = id
      setTournamentIdState(id)
    }
  }, [session.tournament_id])
  useEffect(() => {
    const list = qualifiers.data
    if (!list?.length) return
    if (!qualifierId || !list.some((q) => q.id === qualifierId)) setQualifierId(list[0].id)
  }, [qualifiers.data, qualifierId])

  useEffect(() => {
    const list = aiEvents.data
    if (!list?.length) return
    if (!aiEventId || !list.some((q) => q.id === aiEventId)) setAiEventId(list[0].id)
  }, [aiEvents.data, aiEventId])

  const setTournamentId = useCallback((id: string) => {
    setTournamentIdState(id)
    setMatchId('')
  }, [])

  const tournament = useResource<any>(
    tournamentId ? `t:${scope}:${tournamentId}` : null,
    () => arenaApi.getTournament(tournamentId),
    { ttl: 8_000, refreshMs: 30_000 },
  )

  useEffect(() => {
    const matches = tournament.data?.matches
    if (!matches) return
    setMatchId((old) => (old && matches[old] ? old : ''))
  }, [tournament.data])

  // Đồng bộ thời gian thực: mọi sự kiện từ server chỉ làm mới dữ liệu (server vẫn là nguồn sự thật).
  useEffect(() => {
    if (!tournamentId) return
    const socket = createTournamentSocket(tournamentId)
    let timer: number | undefined
    let first = true
    const offStatus = socket.onStatus((open) => {
      setSocketOpen(open)
      if (open && !first) invalidate('t:')
      if (open) first = false
    })
    const off = socket.subscribe((message: any) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        invalidate('t:')
        invalidate('tl')
        const action = String(message?.action || message?.type || '')
        if (/round|result|complete|correction|reset|disqualify|swap/i.test(action)) {
          invalidate('rk')
          invalidate('mh')
        }
      }, 250)
    })
    socket.connect()
    return () => {
      window.clearTimeout(timer)
      off()
      offStatus()
      socket.destroy()
      setSocketOpen(false)
    }
  }, [tournamentId])

  const run: Live['run'] = useCallback(async (task, success, after) => {
    setBusy(true)
    try {
      const result = await task()
      toast('success', success)
      if (after) {
        try { await after() } catch (e) {
          toast('error', `Server đã chấp nhận thao tác nhưng chưa tải lại được dữ liệu: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
        }
      }
      return result
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Yêu cầu thất bại')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [toast])

  const matches = tournament.data?.matches as Record<string, any> | undefined
  const ownMatches = useMemo(() => {
    if (role !== 'TEAM' || !matches) return []
    return Object.entries(matches).filter(([, m]) => sameStudent(m.team_a?.student_id, session.student_id) || sameStudent(m.team_b?.student_id, session.student_id))
  }, [matches, role, session.student_id])

  const enterMatch = useCallback(async (id: string) => {
    if (role === 'TEAM' && ownMatches.some(([mid]) => mid === id) && session.match_id !== id) {
      try {
        await arenaApi.selectTeamMatch(tournamentId, id)
        await refreshSession()
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Không vào được phòng trận')
      }
    }
    setMatchId(id)
    setView('match')
  }, [role, ownMatches, session.match_id, tournamentId, refreshSession, toast])

  const logout = useCallback(async () => {
    await run(() => arenaApi.logout(), 'Đã đăng xuất')
    webcamStore.leave()
    setSession(GUEST)
    invalidate('')
    setView('overview')
  }, [run])

  // Hàng chờ nộp bài vòng loại trên thiết bị.
  const flushing = useRef(false)
  const syncOutbox = useCallback(() => setOutbox(session.student_id ? listOutbox(session.student_id) : []), [session.student_id])
  const flushOutbox = useCallback(async () => {
    if (flushing.current || role !== 'TEAM' || !session.student_id) return
    flushing.current = true
    try {
      for (const item of listOutbox(session.student_id)) {
        try {
          if (item.kind === 'match') {
            // Phiên nộp bài gắn với từng trận: chỉ gửi khi đang ở đúng phòng trận, nếu không thì giữ lại.
            if (!item.tournamentId || !item.matchId || session.match_id !== item.matchId) continue
            const result: any = await arenaApi.submitCode(item.tournamentId, item.matchId, { code_content: item.payload.code, language: item.payload.language, explanation: item.payload.explanation, round_number: item.payload.round_number, side: item.payload.side }, item.id)
            removeOutbox(item.id)
            invalidate('t:')
            invalidate('subs:')
            toast(result?.status === 'INVALID_CODE' ? 'error' : 'success', result?.status === 'INVALID_CODE'
              ? `Đã gửi bài trận lưu trên thiết bị nhưng mã KHÔNG hợp lệ: ${result.validation_error || 'lỗi sandbox'}`
              : 'Đã gửi bài trận lưu trên thiết bị. Server đã nhận bài.')
            continue
          }
          await arenaApi.submitQualifier(item.qualifierId, item.payload, item.id)
          removeOutbox(item.id)
          invalidate('q:')
          toast('success', 'Đã gửi bài vòng loại lưu trên thiết bị. Server đã nhận và đưa vào hàng đợi chấm.')
        } catch (e) {
          if (isRetryable(e)) { markFailed(item.id, e instanceof Error ? e.message : 'Lỗi mạng'); break }
          removeOutbox(item.id)
          toast('error', `Bài đang chờ bị từ chối: ${e instanceof Error ? e.message : 'không hợp lệ'}`)
        }
      }
    } finally {
      flushing.current = false
      syncOutbox()
    }
  }, [role, session.student_id, session.match_id, syncOutbox, toast])

  useEffect(() => {
    syncOutbox()
    window.addEventListener('arena-outbox', syncOutbox)
    return () => window.removeEventListener('arena-outbox', syncOutbox)
  }, [syncOutbox])
  useEffect(() => {
    if (role !== 'TEAM') return
    void flushOutbox()
    const onOnline = () => void flushOutbox()
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void flushOutbox(), 30_000)
    return () => { window.removeEventListener('online', onOnline); window.clearInterval(timer) }
  }, [role, flushOutbox])

  const value: Live = {
    view, navigate: setView, session, role, scope, refreshSession,
    tournaments, tournamentId, setTournamentId, tournament, matchId, setMatchId,
    qualifiers, qualifierId, setQualifierId, aiEvents, aiEventId, setAiEventId, notifications, capabilities, socketOpen, busy,
    run, toast, confirm, enterMatch, ownMatches,
    openAuth: (mode) => setAuthRequest({ mode }), authRequest, closeAuth: () => setAuthRequest(null),
    logout, outbox, flushOutbox,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 sm:items-end" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg',
            t.tone === 'error' ? 'border-red-500/40' : t.tone === 'success' ? 'border-emerald-500/40' : 'border-border')}>
            {t.tone === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" /> : t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <Info className="mt-0.5 size-4 shrink-0 text-sky-500" />}
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button aria-label="Đóng thông báo" className="text-muted-foreground hover:text-foreground" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><X className="size-4" /></button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        onConfirm={() => { confirmState?.resolve(true); setConfirmState(null) }}
        onCancel={() => { confirmState?.resolve(false); setConfirmState(null) }}
      />
    </Ctx.Provider>
  )
}
