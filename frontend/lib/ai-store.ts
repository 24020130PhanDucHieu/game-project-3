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
  question?: string // với tin của AI: câu hỏi gốc (để chuyển cho BTC)
}

export type AiState = {
  messages: AiMessage[]
  busy: boolean
  available: boolean | null // null = chưa biết
  remaining: number | null
  limit: number | null
}

const EMPTY: AiState = { messages: [], busy: false, available: null, remaining: null, limit: null }
let state: AiState = EMPTY
let seq = 0
const listeners = new Set<() => void>()

function set(patch: Partial<AiState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const aiStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
  server: () => EMPTY,
  reset() { state = EMPTY; listeners.forEach((l) => l()) },

  async refreshUsage() {
    try {
      const u = await arenaApi.getAiUsage()
      set({ available: u.available, remaining: u.remaining, limit: u.limit })
    } catch {
      set({ available: false })
    }
  },

  async ask(question: string, tournamentId?: string) {
    const q = question.trim()
    if (!q || state.busy) return
    const user: AiMessage = { id: ++seq, role: 'user', text: q }
    const waiting: AiMessage = { id: ++seq, role: 'ai', text: 'Đang tra cứu tài liệu và dữ liệu giải…', pending: true }
    set({ messages: [...state.messages, user, waiting].slice(-40), busy: true })
    try {
      const r = await arenaApi.askAi(q, tournamentId)
      const reply: AiMessage = { id: waiting.id, role: 'ai', text: r.answer, sources: r.sources || [], needsHuman: r.needs_human, question: q }
      set({ messages: state.messages.map((m) => (m.id === waiting.id ? reply : m)), busy: false, remaining: r.remaining })
    } catch (e) {
      const status = (e as { status?: number } | null)?.status
      const text = e instanceof Error && e.message ? e.message : 'Trợ lý AI chưa trả lời được.'
      const reply: AiMessage = { id: waiting.id, role: 'ai', text, error: true, needsHuman: true, question: q }
      set({ messages: state.messages.map((m) => (m.id === waiting.id ? reply : m)), busy: false, ...(status === 429 ? { remaining: 0 } : {}), ...(status === 503 ? { available: false } : {}) })
    }
  },
}
