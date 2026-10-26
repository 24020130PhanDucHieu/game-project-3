'use client'

import { arenaApi, type AiSource } from './api-client'

/**
 * Hội thoại với trợ lý AI sống ngoài component: đóng/mở khung hay chuyển tab không làm mất hội thoại.
 * Trợ lý chỉ trả lời từ nguồn thật (xem backend/internal/ai); câu không có căn cứ trả về needs_human.
 */
export type AiMessage = {
  id: number
  role: 'user' | 'ai'
  text: string
  sources?: AiSource[]
  needsHuman?: boolean
  error?: boolean
  pending?: boolean
  startedAt?: number
  question?: string // với tin của AI: câu hỏi gốc (để chuyển cho BTC)
}

export type AiState = {
  messages: AiMessage[]
  busy: boolean
  available: boolean | null // null = chưa biết
  remaining: number | null
  limit: number | null
  usageError: boolean
}

const EMPTY: AiState = { messages: [], busy: false, available: null, remaining: null, limit: null, usageError: false }
let state: AiState = EMPTY
let seq = 0
let lastScope: string | null = null
let generation = 0
let usageRequest = 0
let active: { id: number; controller: AbortController } | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<AiState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const aiStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
  server: () => EMPTY,
  reset() {
    generation++
    usageRequest++
    const previous = active
    active = null
    previous?.controller.abort()
    lastScope = null
    state = EMPTY
    listeners.forEach((l) => l())
  },
  cancel() {
    if (!active) return
    const previous = active
    active = null
    usageRequest++
    previous.controller.abort()
    set({ busy: false, messages: state.messages.map((m) => m.id === previous.id
      ? { ...m, pending: false, text: 'Đã hủy yêu cầu. Bạn có thể gửi câu hỏi khác.' } : m) })
  },
  /** Xóa hội thoại, giữ thông tin hạn mức. */
  clear() { aiStore.cancel(); set({ messages: [] }) },
  /** Đổi tài khoản/phiên thì bỏ hội thoại của người trước. */
  resetOnScope(scope: string) {
    if (lastScope === scope) return
    aiStore.reset()
    lastScope = scope
  },

  async refreshUsage() {
    if (state.busy) return // Không đọc hạn mức đang tạm giữ cho câu hỏi chưa hoàn tất.
    const currentGeneration = generation
    const request = ++usageRequest
    try {
      const u = await arenaApi.getAiUsage()
      if (currentGeneration !== generation || request !== usageRequest) return
      set({ available: u.available, remaining: u.remaining, limit: u.limit, usageError: false })
    } catch {
      if (currentGeneration !== generation || request !== usageRequest) return
      set({ usageError: true })
    }
  },

  async ask(question: string, tournamentId?: string) {
    const q = question.trim()
    if (!q || state.busy) return
    const user: AiMessage = { id: ++seq, role: 'user', text: q }
    const waiting: AiMessage = { id: ++seq, role: 'ai', text: 'Đang tra cứu tài liệu và dữ liệu giải…', pending: true, startedAt: Date.now() }
    const request = { id: waiting.id, controller: new AbortController() }
    active = request
    usageRequest++
    set({ messages: [...state.messages, user, waiting].slice(-40), busy: true })
    try {
      const r = await arenaApi.askAi(q, tournamentId, request.controller.signal)
      if (active !== request) return
      const reply: AiMessage = { id: waiting.id, role: 'ai', text: r.answer, sources: r.sources || [], needsHuman: r.needs_human, question: q }
      set({ messages: state.messages.map((m) => (m.id === waiting.id ? reply : m)), busy: false, remaining: r.remaining })
    } catch (e) {
      if (active !== request) return
      const status = (e as { status?: number } | null)?.status
      const text = e instanceof Error && e.message ? e.message : 'Trợ lý AI chưa trả lời được.'
      const reply: AiMessage = { id: waiting.id, role: 'ai', text, error: true, needsHuman: true, question: q }
      set({ messages: state.messages.map((m) => (m.id === waiting.id ? reply : m)), busy: false })
      // HTTP 429/503 cũng có thể do giới hạn tạm thời hoặc lỗi dịch vụ.
      // Chỉ endpoint usage được quyết định số lượt còn lại và trạng thái bật/tắt.
      if (status === 429 || status === 503) void aiStore.refreshUsage()
    } finally {
      if (active === request) active = null
    }
  },
}
