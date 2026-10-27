'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * Chế độ hiệu ứng: full (đầy đủ), lite (gọn, bỏ hiệu ứng nặng), off (tắt mọi chuyển động).
 * Lưu ở localStorage; mặc định theo máy (máy yếu hoặc bật tiết kiệm dữ liệu → lite; trình khởi động ở theme.tsx đặt data-fx).
 */
export type FxMode = 'full' | 'lite' | 'off'
const KEY = 'arena.fx'
const listeners = new Set<() => void>()

export function getFx(): FxMode {
  if (typeof document === 'undefined') return 'full'
  const v = document.documentElement.dataset.fx
  return v === 'lite' || v === 'off' ? v : 'full'
}

export function setFx(mode: FxMode) {
  try { localStorage.setItem(KEY, mode) } catch { /* bỏ qua */ }
  if (mode === 'full') delete document.documentElement.dataset.fx
  else document.documentElement.dataset.fx = mode
  listeners.forEach((l) => l())
}

export function useFx(): [FxMode, (m: FxMode) => void] {
  const [mode, setMode] = useState<FxMode>('full')
  useEffect(() => {
    const sync = () => setMode(getFx())
    sync()
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])
  return [mode, setFx]
}

/**
 * Chạy một thay đổi giao diện (đổi màn hình, đổi tab) với hiệu ứng chuyển mờ bằng View Transitions API.
 * Không hỗ trợ, giảm chuyển động hoặc chế độ off/lite thì chạy thẳng (không trễ). `dir` quyết định hướng trượt.
 */
let activeTransition: { skipTransition: () => void } | null = null
let transitionGeneration = 0
export function withTransition(update: () => void, dir: 1 | -1 | 0 = 0) {
  const generation = ++transitionGeneration
  const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; skipTransition: () => void; ready: Promise<void> } }) : null
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!doc?.startViewTransition || reduced || getFx() !== 'full') { activeTransition?.skipTransition(); update(); return }
  const root = doc.documentElement
  root.dataset.vt = dir > 0 ? 'next' : dir < 0 ? 'prev' : 'fade'
  activeTransition?.skipTransition()
  try {
    const transition = doc.startViewTransition(() => { if (generation === transitionGeneration) flushSync(update) })
    activeTransition = transition
    const done = () => { if (activeTransition === transition) { activeTransition = null; delete root.dataset.vt } }
    transition.ready.catch(() => {})
    transition.finished.then(done, done)
  } catch { activeTransition = null; delete root.dataset.vt; update() }
}
