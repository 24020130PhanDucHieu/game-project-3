'use client'

import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { motionEnabled } from './interaction-motion'

/** Direct manipulation stays available in reduced-motion mode; only momentum is disabled. */
export function useCubeDrag() {
  const ref = useRef<HTMLDivElement>(null)
  const angle = useRef({ x: -12, y: -24 })
  const frame = useRef(0)
  const suppressClick = useRef(false)
  const drag = useRef<null | { id: number; x: number; y: number; startX: number; startY: number; time: number; vx: number; vy: number; moved: boolean; touch: boolean }>(null)
  const paint = () => {
    ref.current?.style.setProperty('--cube-x', `${angle.current.x}deg`)
    ref.current?.style.setProperty('--cube-y', `${angle.current.y}deg`)
  }
  const stop = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    ref.current?.removeAttribute('data-spinning')
  }
  const cancel = () => {
    stop()
    const current = drag.current
    drag.current = null
    if (current && ref.current?.hasPointerCapture(current.id)) ref.current.releasePointerCapture(current.id)
    ref.current?.removeAttribute('data-dragging')
  }
  useEffect(() => {
    window.addEventListener('blur', cancel)
    const visibility = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  const reset = () => { cancel(); angle.current = { x: -12, y: -24 }; paint() }
  const orient = (y: number) => { cancel(); angle.current = { x: -12, y }; paint() }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0 || drag.current) return
    stop()
    suppressClick.current = false
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, time: performance.now(), vx: 0, vy: 0, moved: false, touch: e.pointerType === 'touch' }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved) {
      const totalX = e.clientX - d.startX, totalY = e.clientY - d.startY
      if (Math.hypot(totalX, totalY) < 7) return
      // Let the browser own vertical scrolling on touch screens.
      if (d.touch && Math.abs(totalY) > Math.abs(totalX)) { cancel(); return }
      d.moved = true
      suppressClick.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.dataset.dragging = 'true'
    }
    const now = performance.now(), dt = Math.max(8, now - d.time)
    angle.current.y += dx * .45
    angle.current.x = Math.max(-40, Math.min(30, angle.current.x - dy * .3))
    d.vx = Math.max(-1, Math.min(1, dx * .45 / dt))
    d.vy = Math.max(-.5, Math.min(.5, -dy * .3 / dt))
    d.x = e.clientX; d.y = e.clientY; d.time = now
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(paint)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    cancel()
    paint()
    if (!d.moved || performance.now() - d.time > 100 || !motionEnabled()) return
    let vx = d.vx, vy = d.vy, last = performance.now()
    const tick = (now: number) => {
      if (!motionEnabled()) { stop(); return }
      const dt = Math.min(32, now - last); last = now
      vx *= Math.exp(-dt / 140); vy *= Math.exp(-dt / 140)
      angle.current.y += vx * dt
      angle.current.x = Math.max(-40, Math.min(30, angle.current.x + vy * dt))
      paint()
      if (Math.abs(vx) + Math.abs(vy) < .015) { stop(); return }
      frame.current = requestAnimationFrame(tick)
    }
    ref.current?.setAttribute('data-spinning', 'true')
    frame.current = requestAnimationFrame(tick)
  }
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current && e.detail !== 0) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false }
  }
  return { ref, reset, orient, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onLostPointerCapture: () => { if (drag.current) cancel() }, onClickCapture } }
}
