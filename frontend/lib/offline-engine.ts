'use client'

import { arenaApi } from './api-client'

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
  worker.onerror = (event) => {
    const detail = event?.message ? `: ${event.message}` : ''
    pending.forEach((job) => { window.clearTimeout(job.timer); job.reject(new Error(`Không khởi động được máy chấm offline${detail}. Hãy tải lại trang (Ctrl+F5) rồi thử lại.`)) })
    pending.clear()
    worker?.terminate(); worker = null; booted = null
  }
  return worker
}

// Khởi động Pyodide (tải/giải nén ~14 MB) có thể mất cả phút trên máy yếu: tách khỏi thời gian chạy bot,
// để giới hạn "bot chạy quá lâu" chỉ tính phần chạy bot thật.
let booted: Promise<void> | null = null
function boot(): Promise<void> {
  booted = booted || call<{ version: string }>('prepare', {}, 180_000).then(
    (r) => { set({ status: 'ready', version: r.version }) },
    (e) => { booted = null; set({ status: 'error', error: e instanceof Error ? e.message : String(e) }); throw e },
  )
  return booted
}

// File cần cho chạy offline: tải trước qua service worker khi còn mạng để lúc mất mạng vẫn có sẵn.
const OFFLINE_FILES = [
  '/offline/worker.js', '/offline/engine/manifest.json', '/offline/engine/board.py', '/offline/engine/board_rules.py', '/offline/engine/rules.py',
  '/offline/pyodide/pyodide.js', '/offline/pyodide/pyodide.asm.js', '/offline/pyodide/pyodide.asm.wasm', '/offline/pyodide/python_stdlib.zip', '/offline/pyodide/pyodide-lock.json',
]
let warming = false
/** Lặng lẽ tải sẵn gói offline vào bộ nhớ đệm (không khởi động Pyodide, không tốn CPU). */
export function warmOfflineCache() {
  if (warming || typeof window === 'undefined' || !navigator.onLine || !('serviceWorker' in navigator)) return
  warming = true
  void navigator.serviceWorker.ready.then(async () => {
    // Cả file giao diện đã tải trước khi service worker kịp hoạt động (CSS/JS của trang), để mở lại lúc offline không vỡ giao diện.
    const assets = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin + '/_next/static/'))
    // Phiên đăng nhập chỉ được hỏi lúc mở trang (có thể trước khi service worker hoạt động): hỏi lại để có bản lưu offline.
    try { await arenaApi.getSession() } catch { /* bỏ qua */ }
    for (const url of [...OFFLINE_FILES, ...new Set(assets)]) {
      try { await fetch(url, { credentials: 'omit' }) } catch { warming = false; return }
    }
  }).catch(() => { warming = false })
}

function call<T>(kind: 'prepare' | 'validate' | 'practice', payload: object = {}, timeoutMs = 60_000): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      // Bot chạy vô hạn: dừng hẳn worker rồi tạo lại ở lần sau.
      pending.delete(id)
      worker?.terminate(); worker = null; booted = null
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
    try { await boot() } catch { /* trạng thái lỗi đã được ghi */ }
  },
  async validate(code: string, language: string, ruleId?: string) {
    await boot()
    return call<any>('validate', { code, language, rule_id: ruleId }, 20_000)
  },
  async practice(code: string, language: string, boss: string, ruleId: string) {
    await boot()
    return call<any>('practice', { code, language, boss, rule_id: ruleId }, 90_000)
  },
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
  void navigator.serviceWorker.register('/arena-sw.js', { updateViaCache: 'none' }).catch(() => undefined)
}
