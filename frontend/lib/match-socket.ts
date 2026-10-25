/**
 * Quản lý WebSocket kết nối Real-time cho Phòng thi đấu và Cây sơ đồ giải
 */

import { getApiBaseUrl } from './api-client'

/** Ghép địa chỉ WebSocket từ đường dẫn, dùng chung logic chọn máy chủ với API REST. */
export function buildWsUrl(path: string): string {
  let base = getApiBaseUrl()
  if (typeof window !== 'undefined' && base === window.location.origin && window.location.port === '3000') {
    base = 'http://127.0.0.1:8080'
  }
  const wsProto = base.startsWith('https') ? 'wss:' : 'ws:'
  const host = base.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${wsProto}//${host}${cleanPath}`
}

export type WebSocketMessageHandler = (data: any) => void

export class ArenaSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private reconnectTimer: any = null
  private lastMessageAt = Date.now()
  private sawHeartbeat = false
  private watchdog: any = null
  private wakeHandler = () => this.wake()
  private listeners: Set<WebSocketMessageHandler> = new Set()
  private statusListeners: Set<(open: boolean) => void> = new Set()
  private isDestroyed = false

  constructor(path: string) {
    this.url = buildWsUrl(path)
  }

  connect() {
    if (this.isDestroyed || typeof window === 'undefined') return

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.startWatching()
    try {
      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onopen = () => {
        this.reconnectAttempts = 0
        this.lastMessageAt = Date.now()
        this.statusListeners.forEach((listener) => listener(true))
      }

      ws.onmessage = (event) => {
        this.lastMessageAt = Date.now()
        try {
          const parsed = JSON.parse(event.data)
          if (parsed && parsed.type === 'HEARTBEAT') { this.sawHeartbeat = true; return }
          this.listeners.forEach((listener) => listener(parsed))
        } catch {
          this.listeners.forEach((listener) => listener(event.data))
        }
      }

      ws.onclose = () => {
        if (this.ws !== ws) return
        this.statusListeners.forEach((listener) => listener(false))
        this.scheduleReconnect()
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  /** Không bỏ cuộc: giãn dần tới 30 giây rồi thử mãi; quay lại tab hoặc có mạng thì nối ngay. */
  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 12)), 30000)
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect() }, delay)
  }

  private wake() {
    if (this.isDestroyed || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.reconnectAttempts = 0
      this.connect()
    }
  }

  /** Máy chủ ping mỗi 25 giây; im lặng quá 70 giây nghĩa là ổ đã chết ngầm (ngủ máy, đổi mạng) nên nối lại. */
  private startWatching() {
    if (this.watchdog || typeof window === 'undefined') return
    window.addEventListener('online', this.wakeHandler)
    window.addEventListener('focus', this.wakeHandler)
    document.addEventListener('visibilitychange', this.wakeHandler)
    this.watchdog = setInterval(() => {
      if (this.sawHeartbeat && this.ws && this.ws.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt > 70_000 && document.visibilityState === 'visible') {
        const dead = this.ws
        this.ws = null
        this.sawHeartbeat = false
        dead.onclose = null
        dead.close()
        this.statusListeners.forEach((listener) => listener(false))
        this.reconnectAttempts = 0
        this.connect()
      } else if (!this.ws) {
        this.wake()
      }
    }, 15_000)
  }

  subscribe(handler: WebSocketMessageHandler): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  /** Báo trạng thái kết nối (true = đang mở) để giao diện tải lại dữ liệu sau khi nối lại. */
  onStatus(handler: (open: boolean) => void): () => void {
    this.statusListeners.add(handler)
    return () => {
      this.statusListeners.delete(handler)
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  destroy() {
    this.isDestroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.watchdog) clearInterval(this.watchdog)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wakeHandler)
      window.removeEventListener('focus', this.wakeHandler)
      document.removeEventListener('visibilitychange', this.wakeHandler)
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.listeners.clear()
    this.statusListeners.clear()
  }
}

export function createMatchSocket(matchId: string): ArenaSocket {
  return new ArenaSocket(`/ws/matches/${encodeURIComponent(matchId)}`)
}

export function createTournamentSocket(tournamentId: string): ArenaSocket {
  return new ArenaSocket(`/ws/tournaments/${encodeURIComponent(tournamentId)}`)
}
