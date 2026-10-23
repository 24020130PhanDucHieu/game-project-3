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
  private maxReconnectAttempts = 10
  private reconnectTimer: any = null
  private listeners: Set<WebSocketMessageHandler> = new Set()
  private statusListeners: Set<(open: boolean) => void> = new Set()
  private isDestroyed = false

  constructor(path: string) {
    this.url = buildWsUrl(path)
  }

  connect() {
    if (this.isDestroyed || typeof window === 'undefined') return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        this.statusListeners.forEach((listener) => listener(true))
      }

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          this.listeners.forEach((listener) => listener(parsed))
        } catch {
          this.listeners.forEach((listener) => listener(event.data))
        }
      }

      this.ws.onclose = () => {
        this.statusListeners.forEach((listener) => listener(false))
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        if (this.ws) this.ws.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    }
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
