'use client'

import { useCallback, useEffect, useRef } from 'react'
import { getFx } from './fx'

export function motionEnabled() {
  return getFx() === 'full' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Chỉ cập nhật CSS của phần tử đang rê chuột; không render lại React theo từng tọa độ. */
export function usePointerMotion<T extends HTMLElement>(mode: 'light' | 'tilt' | 'parallax' | 'magnet' | 'none' = 'light') {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || mode === 'none') return
    let frame = 0
    let bounds: DOMRect | null = null
    const reset = () => {
      cancelAnimationFrame(frame)
      bounds = null
      window.removeEventListener('blur', reset)
      el.removeAttribute('data-pointer')
      for (const key of ['--par-x', '--par-y', '--tilt-x', '--tilt-y', '--magnet-x', '--magnet-y']) el.style.removeProperty(key)
    }
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !motionEnabled() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || el.matches(':disabled')) return
      bounds = el.getBoundingClientRect()
      el.dataset.pointer = 'active'
      window.addEventListener('blur', reset, { once: true })
    }
    const move = (event: PointerEvent) => {
      // Effects can become enabled while the cursor is already inside the card.
      if (!bounds) enter(event)
      if (!bounds) return
      if (!motionEnabled() || el.matches(':disabled')) { reset(); return }
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--pointer-x', `${x * 100}%`)
        el.style.setProperty('--pointer-y', `${y * 100}%`)
        if (mode === 'tilt' || mode === 'parallax') {
          el.style.setProperty('--tilt-x', `${(0.5 - y) * (mode === 'parallax' ? 12 : 5)}deg`)
          el.style.setProperty('--tilt-y', `${(x - 0.5) * (mode === 'parallax' ? 16 : 7)}deg`)
          el.style.setProperty('--par-x', String((x - 0.5) * 2))
          el.style.setProperty('--par-y', String((y - 0.5) * 2))
        }
        if (mode === 'magnet') {
          el.style.setProperty('--magnet-x', `${(x - 0.5) * 5}px`)
          el.style.setProperty('--magnet-y', `${(y - 0.5) * 4}px`)
        }
      })
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointermove', move, { passive: true })
    el.addEventListener('pointerleave', reset)
    el.addEventListener('pointercancel', reset)
    return () => {
      reset()
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', reset)
      el.removeEventListener('pointercancel', reset)
      window.removeEventListener('blur', reset)
    }
  }, [mode])
  return ref
}

export type MotionOrigin = { left: number; top: number; width: number; height: number }

/** Phóng từ nút/thẻ gốc tới hộp thoại, thu lại khi đóng; giữ điều khiển bàn phím. */
export function useExpandingDialog(onClose: () => void, origin?: MotionOrigin) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const animation = useRef<Animation | null>(null)
  const closing = useRef(false)
  closeRef.current = onClose
  const from = useCallback(() => {
    const el = ref.current
    if (!origin || !el) return 'translateY(12px) scale(.97)'
    const box = el.getBoundingClientRect()
    const x = origin.left + origin.width / 2 - (box.left + box.width / 2)
    const y = origin.top + origin.height / 2 - (box.top + box.height / 2)
    return `translate(${x}px,${y}px) scale(${Math.max(.18, Math.min(.7, origin.width / box.width))},${Math.max(.12, Math.min(.7, origin.height / box.height))})`
  }, [origin])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')).filter(node => node.getClientRects().length)
    focusables()[0]?.focus({ preventScroll: true })
    if (motionEnabled() && el.animate) animation.current = el.animate([{ opacity: 0, transform: from() }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' })
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const nodes = focusables(), first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { e.preventDefault(); el.focus(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    el.addEventListener('keydown', key)
    return () => { animation.current?.cancel(); el.removeEventListener('keydown', key); previous?.focus({ preventScroll: true }) }
  }, [from])
  const close = useCallback(() => {
    const el = ref.current
    if (closing.current) return
    if (!el?.animate || !motionEnabled()) { closeRef.current(); return }
    closing.current = true
    animation.current?.cancel()
    animation.current = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: from() }], { duration: 170, easing: 'ease-in', fill: 'forwards' })
    animation.current.finished.then(() => closeRef.current(), () => closeRef.current())
  }, [from])
  return { ref, close }
}
