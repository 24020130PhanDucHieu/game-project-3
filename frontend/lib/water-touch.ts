'use client'

import { motionEnabled } from './interaction-motion'

/**
 * Hiệu ứng "chạm mặt nước" cho mọi phần tử có class `water` (tab, nút, banner):
 * rê chuột → ánh nước sáng quanh con trỏ (CSS đọc --wx/--wy), bấm → vòng gợn lan ra và phần tử nảy nhẹ.
 * Một bộ lắng nghe duy nhất trên document; vòng gợn là phần tử tạm gắn vào body, tối đa 3 cái cùng lúc, tự gỡ khi xong.
 */
export function installWaterTouch() {
  if (typeof window === 'undefined') return () => {}
  let live = 0
  let frame = 0
  let hot: HTMLElement | null = null
  let lastTrail = 0
  const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const find = (e: Event) => ((e.target as Element | null)?.closest?.('.water') as HTMLElement | null)

  const ring = (x: number, y: number, size: number, small = false) => {
    if (live >= 3) return
    live++
    const el = document.createElement('span')
    el.className = small ? 'water-ring water-ring-small' : 'water-ring'
    el.style.cssText = `left:${x}px;top:${y}px;--s:${size}px`
    el.setAttribute('aria-hidden', 'true')
    let done = false
    const finish = () => { if (done) return; done = true; live = Math.max(0, live - 1); el.remove() }
    el.addEventListener('animationend', finish, { once: true })
    window.setTimeout(finish, 1400)
    document.body.appendChild(el)
  }

  const setHot = (el: HTMLElement | null) => {
    if (hot === el) return
    if (hot) { delete hot.dataset.water; hot.style.removeProperty('--wx'); hot.style.removeProperty('--wy') }
    hot = el
    if (el) el.dataset.water = 'on'
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !motionEnabled() || !fine()) { setHot(null); return }
    const el = find(e)
    if (el && el.matches(':disabled')) { setHot(null); return }
    if (el !== hot) {
      setHot(el)
      if (el) ring(e.clientX, e.clientY, 54, true) // chạm mặt nước khi vừa đưa chuột vào
    }
    if (!el) return
    const x = e.clientX, y = e.clientY
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const box = el.getBoundingClientRect()
      el.style.setProperty('--wx', `${x - box.left}px`)
      el.style.setProperty('--wy', `${y - box.top}px`)
    })
    const now = performance.now()
    if (el.classList.contains('water-trail') && now - lastTrail > 220) { lastTrail = now; ring(x, y, 70, true) }
  }
  const onLeave = (e: PointerEvent) => {
    const to = (e as PointerEvent & { relatedTarget: Node | null }).relatedTarget
    if (!to || !(hot && hot.contains(to))) setHot(null)
  }
  const onDown = (e: PointerEvent) => {
    if (!motionEnabled()) return
    const el = find(e)
    if (!el || el.matches(':disabled')) return
    ring(e.clientX, e.clientY, 120)
    window.setTimeout(() => ring(e.clientX, e.clientY, 76, true), 110)
    el.animate?.([{ scale: '1' }, { scale: '.965' }, { scale: '1.025' }, { scale: '1' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerout', onLeave, { passive: true })
  document.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('blur', () => setHot(null))
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerout', onLeave)
    document.removeEventListener('pointerdown', onDown)
    setHot(null)
    document.querySelectorAll('.water-ring').forEach((n) => n.remove())
  }
}
