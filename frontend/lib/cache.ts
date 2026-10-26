'use client'

/**
 * Bộ nhớ đệm đọc dữ liệu kiểu stale-while-revalidate cho giao diện.
 * - Dữ liệu cũ hiện ngay, đồng thời tải lại ngầm khi quá hạn (ttl).
 * - Gộp các yêu cầu trùng khóa đang bay để không gọi API lặp lại.
 * - Tạm dừng tải định kỳ khi tab bị ẩn.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Entry = { data?: unknown; error?: Error; at: number; promise?: Promise<unknown>; startedAt?: number; gen?: number; promiseGen?: number; lastUsed?: number }

const store = new Map<string, Entry>()
const listeners = new Set<(key: string) => void>()

function notify(key: string) {
  listeners.forEach((listener) => listener(key))
}

export function readCache<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined
}

/** Ghi kết quả thao tác vào cache và vô hiệu hóa các lượt đọc đã bắt đầu trước đó. */
export function updateCache<T>(key: string, update: (previous: T | undefined) => T | undefined) {
  const entry = store.get(key) ?? { at: 0 }
  entry.data = update(entry.data as T | undefined)
  entry.error = undefined
  entry.gen = (entry.gen ?? 0) + 1
  entry.promise = undefined
  entry.at = Date.now()
  store.set(key, entry)
  notify(key)
}

/** Xóa các khóa bắt đầu bằng prefix; để trống để xóa tất cả (khi đổi phiên). */
export function invalidate(prefix = '') {
  for (const [key, entry] of store) {
    if (key.startsWith(prefix)) {
      entry.at = 0
      entry.gen = (entry.gen ?? 0) + 1 // yêu cầu đang bay từ trước lần này sẽ không được coi là dữ liệu mới
      if (!prefix) store.delete(key)
    }
  }
  listeners.forEach((listener) => listener(prefix))
}

/** Xóa hẳn các mục có khóa thỏa điều kiện (khác invalidate: không giữ lại dữ liệu cũ), dùng sau khi xóa một thứ ở máy chủ. */
export function forget(match: string | ((key: string) => boolean)) {
  const test = typeof match === 'string' ? (key: string) => key.includes(match) : match
  for (const key of [...store.keys()]) if (test(key)) store.delete(key)
  listeners.forEach((listener) => listener(''))
}

/** Bộ nhớ đệm không phình mãi: quá 150 mục thì bỏ các mục lâu không ai dùng (trên 10 phút, không có yêu cầu đang bay). */
function prune() {
  if (store.size <= 150) return
  const cutoff = Date.now() - 600_000
  for (const [key, entry] of store) if (!entry.promise && (entry.lastUsed ?? entry.at) < cutoff) store.delete(key)
}

// Số yêu cầu đang bay (để hiện thanh tiến trình trên cùng).
let inflight = 0
const fetchListeners = new Set<() => void>()
export const fetching = {
  get: () => inflight,
  subscribe(l: () => void) { fetchListeners.add(l); return () => { fetchListeners.delete(l) } },
}
function bump(delta: number) {
  inflight = Math.max(0, inflight + delta)
  fetchListeners.forEach((l) => l())
}

function load<T>(key: string, fetcher: () => Promise<T>, force: boolean, ttl: number): Promise<T> {
  const entry = store.get(key) ?? { at: 0 }
  store.set(key, entry)
  prune()
  // Yêu cầu đang bay quá 60 giây coi như treo: bỏ đi để lần tải sau không bị kẹt chờ mãi.
  const gen = entry.gen ?? 0
  if (entry.promise && entry.promiseGen === gen && Date.now() - (entry.startedAt ?? 0) < 60_000) return entry.promise as Promise<T>
  if (!force && entry.data !== undefined && Date.now() - entry.at < ttl) return Promise.resolve(entry.data as T)
  bump(1)
  const promise: Promise<T> = fetcher()
    .then((data) => {
      if (store.get(key) !== entry || (entry.gen ?? 0) !== gen || entry.promise !== promise) return data
      entry.data = data
      entry.error = undefined
      // Nếu trong lúc chờ có invalidate(): vẫn hiện dữ liệu này nhưng giữ at = 0 để tải lại ngay.
      if ((entry.gen ?? 0) === gen) entry.at = Date.now()
      return data
    })
    .catch((error) => {
      if (store.get(key) !== entry || (entry.gen ?? 0) !== gen || entry.promise !== promise) throw error
      entry.error = error instanceof Error ? error : new Error(String(error))
      // Mục đã bị xóa ở máy chủ: không được tiếp tục hiện dữ liệu cũ.
      if ((error as { status?: number })?.status === 404) entry.data = undefined
      if ((entry.gen ?? 0) === gen) entry.at = Date.now() // tránh vòng lặp tải lại liên tục khi lỗi; thử lại theo chu kỳ hoặc reload()
      throw entry.error
    })
    .finally(() => {
      bump(-1)
      if (entry.promise === promise) entry.promise = undefined
      notify(key)
    })
  entry.promise = promise
  entry.promiseGen = gen
  entry.startedAt = Date.now()
  return promise
}

/**
 * Quay lại tab, bật lại cửa sổ, hết ngủ máy hoặc có mạng trở lại: đánh dấu mọi khóa đã hết hạn để các màn hình đang mở
 * tự tải lại ngay (không cần chuyển tab). Chỉ chạy tối đa một lần mỗi 3 giây.
 */
let lastWake = 0
function wake() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  const now = Date.now()
  if (now - lastWake < 3_000) return
  lastWake = now
  // Chỉ đánh dấu cũ những mục đã tải trên 5 giây; rải thông báo trong ~1,5 giây để không tải lại đồng loạt gây giật.
  for (const entry of store.values()) if (now - entry.at > 5_000) entry.at = 0
  listeners.forEach((listener) => window.setTimeout(() => listener(''), Math.random() * 1500))
}
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  window.addEventListener('pageshow', wake)
  window.addEventListener('online', wake)
}

export type Resource<T> = {
  data: T | undefined
  error: Error | undefined
  /** Chưa có dữ liệu nào để hiển thị (dùng cho skeleton). */
  loading: boolean
  /** Đang tải lại ngầm khi đã có dữ liệu cũ. */
  refreshing: boolean
  reload: () => Promise<void>
}

export function useResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { ttl?: number; refreshMs?: number } = {},
): Resource<T> {
  const { ttl = 20_000, refreshMs } = options
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const [, bump] = useState(0)

  const run = useCallback(
    (force: boolean) => {
      if (!key) return Promise.resolve()
      return load(key, () => fetcherRef.current(), force, ttl).then(
        () => undefined,
        () => undefined,
      )
    },
    [key, ttl],
  )

  useEffect(() => {
    const onChange = (changed: string) => {
      if (key && key.startsWith(changed)) bump((n) => n + 1)
    }
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [key])

  useEffect(() => {
    void run(false)
  }, [run, key])

  useEffect(() => {
    if (!key) return
    const entry = store.get(key)
    // Sau invalidate(): dữ liệu bị đánh dấu hết hạn (at = 0) hoặc bị xóa nên tải lại.
    if (!entry || (entry.at === 0 && !entry.promise)) void run(true)
  })

  useEffect(() => {
    if (!key || !refreshMs) return
    // Lệch ngẫu nhiên ±20% để hàng nghìn máy không hỏi máy chủ cùng một nhịp; máy chủ báo bận (429/5xx)
    // thì giãn dần tới 5 phút, có dữ liệu trở lại thì về nhịp thường.
    let timer = 0
    let delay = refreshMs
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        await run(true)
        const status = (store.get(key)?.error as { status?: number } | undefined)?.status
        delay = status === 429 || (status !== undefined && status >= 500) ? Math.min(delay * 2, 300_000) : refreshMs
      }
      if (!stopped) timer = window.setTimeout(tick, delay * (0.8 + Math.random() * 0.4))
    }
    timer = window.setTimeout(tick, refreshMs * (0.8 + Math.random() * 0.4))
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [key, refreshMs, run])

  const entry = key ? store.get(key) : undefined
  if (entry) entry.lastUsed = Date.now()
  const data = entry?.data as T | undefined
  const error = entry?.error
  const loading = !!key && entry?.data === undefined && !entry?.error
  const refreshing = !!entry?.promise && entry.data !== undefined
  const reload = useCallback(() => run(true), [run])
  // Giữ nguyên danh tính đối tượng khi dữ liệu không đổi: các nơi dùng làm phụ thuộc (useMemo/useEffect) không bị render lại vô ích.
  return useMemo(() => ({ data, error, loading, refreshing, reload }), [data, error, loading, refreshing, reload])
}
