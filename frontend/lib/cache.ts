'use client'

/**
 * Bộ nhớ đệm đọc dữ liệu kiểu stale-while-revalidate cho giao diện.
 * - Dữ liệu cũ hiện ngay, đồng thời tải lại ngầm khi quá hạn (ttl).
 * - Gộp các yêu cầu trùng khóa đang bay để không gọi API lặp lại.
 * - Tạm dừng tải định kỳ khi tab bị ẩn.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type Entry = { data?: unknown; error?: Error; at: number; promise?: Promise<unknown>; startedAt?: number }

const store = new Map<string, Entry>()
const listeners = new Set<(key: string) => void>()

function notify(key: string) {
  listeners.forEach((listener) => listener(key))
}

export function readCache<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined
}

/** Xóa các khóa bắt đầu bằng prefix; để trống để xóa tất cả (khi đổi phiên). */
export function invalidate(prefix = '') {
  for (const [key, entry] of store) {
    if (key.startsWith(prefix)) {
      entry.at = 0
      if (!prefix) store.delete(key)
    }
  }
  listeners.forEach((listener) => listener(prefix))
}

function load<T>(key: string, fetcher: () => Promise<T>, force: boolean, ttl: number): Promise<T> {
  const entry = store.get(key) ?? { at: 0 }
  store.set(key, entry)
  // Yêu cầu đang bay quá 60 giây coi như treo: bỏ đi để lần tải sau không bị kẹt chờ mãi.
  if (entry.promise && Date.now() - (entry.startedAt ?? 0) < 60_000) return entry.promise as Promise<T>
  if (!force && entry.data !== undefined && Date.now() - entry.at < ttl) return Promise.resolve(entry.data as T)
  const promise: Promise<T> = fetcher()
    .then((data) => {
      entry.data = data
      entry.error = undefined
      entry.at = Date.now()
      return data
    })
    .catch((error) => {
      entry.error = error instanceof Error ? error : new Error(String(error))
      entry.at = Date.now() // tránh vòng lặp tải lại liên tục khi lỗi; thử lại theo chu kỳ hoặc reload()
      throw entry.error
    })
    .finally(() => {
      if (entry.promise === promise) entry.promise = undefined
      notify(key)
    })
  entry.promise = promise
  entry.startedAt = Date.now()
  return promise
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
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!key && entry?.data === undefined && !entry?.error,
    refreshing: !!entry?.promise && entry.data !== undefined,
    reload: () => run(true),
  }
}
