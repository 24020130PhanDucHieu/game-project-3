'use client'

/**
 * Hàng chờ bài nộp (vòng loại và trận giải chính) lưu trên thiết bị (localStorage).
 * Bài chỉ bị xóa sau khi server trả 202 kèm biên nhận; mất mạng hoặc server bận
 * thì giữ lại và tự gửi lại với cùng X-Submission-Id để server chống trùng.
 */

export type OutboxItem = {
  id: string
  studentId: string
  /** Mặc định 'qualifier' để đọc được các bài lưu từ bản cũ. */
  kind?: 'qualifier' | 'match'
  qualifierId: string
  tournamentId?: string
  matchId?: string
  payload: { code: string; language: string; git_repo_url?: string; git_commit_hash?: string; explanation?: string; round_number?: number; side?: string }
  savedAt: number
  attempts: number
  lastError?: string
}

const KEY = 'arena.qualifier.outbox.v1'

function readAll(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, người dùng vẫn còn bản trong ô soạn thảo */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('arena-outbox'))
}

export function listOutbox(studentId: string): OutboxItem[] {
  return readAll().filter((item) => item.studentId === studentId)
}

export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function enqueue(item: Omit<OutboxItem, 'savedAt' | 'attempts'>): OutboxItem {
  const entry: OutboxItem = { ...item, savedAt: Date.now(), attempts: 0 }
  writeAll([...readAll().filter((x) => x.id !== entry.id), entry])
  return entry
}

export function remove(id: string) {
  writeAll(readAll().filter((item) => item.id !== id))
}

export function markFailed(id: string, message: string) {
  writeAll(readAll().map((item) => (item.id === id ? { ...item, attempts: item.attempts + 1, lastError: message } : item)))
}

/** Lỗi tạm thời (mạng, 429, 5xx) nên giữ bài để gửi lại; lỗi 4xx khác là bị từ chối. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  if (error instanceof TypeError) return true
  return /(^|\D)(429|5\d\d)(\D|$)|Failed to fetch|NetworkError|Chưa lưu được|tạm thời/i.test(error.message)
}
