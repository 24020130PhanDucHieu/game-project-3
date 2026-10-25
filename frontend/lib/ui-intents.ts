'use client'

/**
 * Ý định chuyển cảnh giữa các thành phần xa nhau (trợ lý AI → Hướng dẫn, trợ lý AI → form Hỏi BTC).
 * Giữ ngoài React để thành phần đích mở sau vẫn nhận được.
 */
export type GuideSection = 'flow' | 'rules' | 'bot' | 'qualifier' | 'offline' | 'faq' | 'ask' | 'privacy' | 'status'

const GUIDE: GuideSection[] = ['flow', 'rules', 'bot', 'qualifier', 'offline', 'faq', 'ask', 'privacy', 'status']
let pending: GuideSection | null = null
let draft = ''
const listeners = new Set<(s: GuideSection) => void>()

export const intents = {
  isGuideSection: (s: string): s is GuideSection => (GUIDE as string[]).includes(s),
  openGuide(section: GuideSection) {
    pending = section
    listeners.forEach((l) => l(section))
  },
  /** Lấy (và xóa) mục Hướng dẫn đang chờ mở. */
  takeGuideSection(): GuideSection | null {
    const s = pending
    pending = null
    return s
  },
  onGuide(fn: (s: GuideSection) => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  setClarificationDraft(text: string) { draft = text },
  takeClarificationDraft(): string { const d = draft; draft = ''; return d },
}
