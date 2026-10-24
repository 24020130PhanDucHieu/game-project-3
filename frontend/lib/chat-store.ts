'use client'

import { getSessionToken } from './api-client'
import { buildWsUrl } from './match-socket'

/**
 * Chat trong trận sống ngoài component: chuyển tab không làm mất kết nối, tin chưa đọc vẫn được đếm.
 * Lịch sử do máy chủ gửi lại mỗi lần kết nối nên nối lại sau khi mất mạng không mất tin.
 */
export type ChatMessage = { id: string; ts: number; role: string; side?: string; name: string; text: string }
export type ChatWho = { role: string; side?: string; name: string }
export type ChatState = {
  key: string
  status: 'idle' | 'connecting' | 'open' | 'closed'
  messages: ChatMessage[]
  muted: boolean
  online: ChatWho[]
  self: ChatWho | null
  unread: number
  error: string
}

const EMPTY: ChatState = { key: '', status: 'idle', messages: [], muted: false, online: [], self: null, unread: 0, error: '' }
const MAX_KEEP = 200

let state: ChatState = EMPTY
let ws: WebSocket | null = null
let timer = 0
let attempts = 0
let visible = false
let closing = false
const listeners = new Set<() => void>()

function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function connect() {
  if (closing || ws || !state.key) return
  const token = getSessionToken()
  if (!token) { set({ status: 'closed', error: 'Cần đăng nhập để chat.' }); return }
  const [tid, mid] = state.key.split(':')
  set({ status: 'connecting' })
  const socket = new WebSocket(`${buildWsUrl(`/ws/chat/${encodeURIComponent(tid)}/${encodeURIComponent(mid)}`)}?token=${encodeURIComponent(token)}`)
  ws = socket
  socket.onopen = () => { attempts = 0 }
  socket.onmessage = (event) => {
    let msg: any
    try { msg = JSON.parse(event.data) } catch { return }
    switch (msg.type) {
      case 'hello':
        set({ status: 'open', error: '', self: msg.self, messages: msg.messages || [], muted: !!msg.muted, online: msg.online || [], unread: 0 })
        break
      case 'msg': {
        const m: ChatMessage = msg.message
        if (state.messages.some((x) => x.id === m.id)) break
        const mine = !!state.self && m.role === state.self.role && (m.side || '') === (state.self.side || '')
        set({ messages: [...state.messages, m].slice(-MAX_KEEP), unread: mine || visible ? state.unread : state.unread + 1 })
        break
      }
      case 'presence': set({ online: msg.online || [] }); break
      case 'muted': set({ muted: !!msg.value }); break
      case 'cleared': set({ messages: [], unread: 0 }); break
      case 'error': set({ error: msg.detail || 'Không gửi được tin nhắn.' }); window.setTimeout(() => { if (state.error === msg.detail) set({ error: '' }) }, 4000); break
    }
  }
  socket.onclose = () => {
    if (ws !== socket) return
    ws = null
    if (closing) return
    set({ status: 'closed', online: [] })
    if (attempts < 8) {
      attempts++
      timer = window.setTimeout(connect, Math.min(1000 * 1.6 ** attempts, 12000))
    } else {
      set({ error: 'Không kết nối được phòng chat. Hãy vào phòng trận của đội rồi thử lại.' })
    }
  }
  socket.onerror = () => socket.close()
}

function teardown() {
  closing = true
  window.clearTimeout(timer)
  const socket = ws
  ws = null
  socket?.close()
  closing = false
}

export const chatStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
  server: () => EMPTY,
  /** Mở phòng chat của trận (gọi lặp lại với cùng trận thì không làm gì). */
  open(tournamentId: string, matchId: string) {
    const key = `${tournamentId}:${matchId}`
    if (state.key === key && (ws || timer)) return
    teardown()
    attempts = 0
    state = { ...EMPTY, key }
    listeners.forEach((l) => l())
    connect()
  },
  close() {
    teardown()
    state = EMPTY
    listeners.forEach((l) => l())
  },
  /** Báo cho store biết khung chat đang hiển thị: tin mới khi đang xem không tính là chưa đọc. */
  setVisible(v: boolean) {
    visible = v
    if (v && state.unread) set({ unread: 0 })
  },
  send(text: string): boolean {
    const t = text.trim()
    if (!t || !ws || ws.readyState !== WebSocket.OPEN) {
      if (t) set({ error: 'Đang kết nối lại, thử gửi lại sau giây lát.' })
      return false
    }
    ws.send(JSON.stringify({ type: 'msg', text: t }))
    return true
  },
  setMuted(value: boolean) { ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'mute', value })) },
  clear() { ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'clear' })) },
}
