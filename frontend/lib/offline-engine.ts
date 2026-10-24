'use client'

/**
 * Máy chấm offline: chạy engine thật (Pyodide trong Web Worker) khi mất mạng.
 * Lần đầu cần mạng để tải Pyodide (~10 MB); sau đó service worker giữ lại để dùng offline.
 */
export type OfflineState = { status: 'idle' | 'loading' | 'ready' | 'error'; version?: string; error?: string }

const KEY = 'arena.offline.ready'
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>()
let state: OfflineState = { status: readReady() ? 'ready' : 'idle' }
const listeners = new Set<() => void>()

function readReady() { try { return typeof localStorage !== 'undefined' && !!localStorage.getItem(KEY) } catch { return false } }
function set(next: OfflineState) {
  state = next
  try { next.status === 'ready' ? localStorage.setItem(KEY, next.version || '1') : next.status === 'error' && localStorage.removeItem(KEY) } catch { /* bỏ qua */ }
  listeners.forEach((l) => l())
}

function getWorker() {
  if (worker) return worker
  worker = new Worker('/offline/worker.js')
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data || {}
    const job = pending.get(id)
    if (!job) return
    window.clearTimeout(job.timer)
    pending.delete(id)
    ok ? job.resolve(result) : job.reject(new Error(error || 'Máy chấm offline gặp lỗi'))
  }
  worker.onerror = () => {
    pending.forEach((job) => { window.clearTimeout(job.timer); job.reject(new Error('Không khởi động được máy chấm offline')) })
    pending.clear()
    worker?.terminate(); worker = null
  }
  return worker
}

function call<T>(kind: 'prepare' | 'validate' | 'practice', payload: object = {}, timeoutMs = 60_000): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      // Bot chạy vô hạn: dừng hẳn worker rồi tạo lại ở lần sau.
      pending.delete(id)
      worker?.terminate(); worker = null
      reject(new Error('Bot chạy quá lâu trên máy (có thể bị vòng lặp vô hạn).'))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    getWorker().postMessage({ id, kind, payload })
  })
}

export const offlineEngine = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
  server: (): OfflineState => ({ status: 'idle' }),
  async prepare() {
    if (state.status === 'loading') return
    set({ status: 'loading' })
    try {
      const r = await call<{ version: string }>('prepare', {}, 180_000)
      set({ status: 'ready', version: r.version })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
  validate: (code: string, language: string, ruleId?: string) => call<any>('validate', { code, language, rule_id: ruleId }, 20_000),
  practice: (code: string, language: string, boss: string, ruleId: string) => call<any>('practice', { code, language, boss, rule_id: ruleId }, 90_000),
}

/** Lỗi do mất mạng/không tới được máy chủ → nên chuyển sang chạy offline. */
export function isNetworkError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return error instanceof TypeError || (error instanceof Error && /Failed to fetch|NetworkError|Load failed|mất kết nối|không kết nối/i.test(error.message))
}

/** Máy chấm bận hoặc đã chạm hạn mức (429/502/503/504) → chạy thử trên máy người dùng thay vì chờ. */
export function isBusyError(error: unknown) {
  const status = (error as { status?: number } | null)?.status
  return status === 429 || status === 502 || status === 503 || status === 504
}

export function registerOfflineSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (process.env.NODE_ENV !== 'production' && !/[?&]sw=1/.test(location.search)) return
  void navigator.serviceWorker.register('/arena-sw.js').catch(() => undefined)
}
