'use client'

import { useEffect, useRef } from 'react'
import { motionEnabled } from '@/lib/interaction-motion'
import './cursor-follow.css'

const MAX = 90

/**
 * Hiệu ứng bám con trỏ cho một khung (đặt làm con trực tiếp của khung `position: relative`):
 *  - vòng sáng "đuổi theo" chuột có độ trễ (lerp), phóng to khi chuột đi nhanh;
 *  - vệt hạt sáng (sparkle) bắn ra dọc đường chuột rồi rơi dần và mờ đi.
 * Chỉ chạy khi chuột thật ở trong khung và chế độ hiệu ứng là "Đầy đủ"; hết hạt thì dừng vòng lặp.
 */
export function CursorFollow({ color }: { color?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const orb = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = root.current?.parentElement
    const cv = canvas.current
    const ob = orb.current
    if (!host || !cv || !ob) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX), life = new Float32Array(MAX), size = new Float32Array(MAX)
    let n = 0
    let raf = 0
    let inside = false
    let tx = 0, ty = 0, ox = 0, oy = 0, lastX = 0, lastY = 0, speed = 0
    let w = 0, h = 0
    let tint = color || '#38bdf8'
    let last = 0

    const resize = () => {
      const r = host.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height))
      cv.width = w; cv.height = h
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const emit = (x: number, y: number, count: number, power: number) => {
      for (let k = 0; k < count; k++) {
        const i = n < MAX ? n++ : (Math.random() * MAX) | 0
        const a = Math.random() * Math.PI * 2
        const s = 20 + Math.random() * 60 * power
        px[i] = x + (Math.random() - 0.5) * 10; py[i] = y + (Math.random() - 0.5) * 10
        vx[i] = Math.cos(a) * s; vy[i] = Math.sin(a) * s - 20
        life[i] = 1; size[i] = 1.4 + Math.random() * 2.6
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
      last = now
      // Vòng sáng đuổi theo con trỏ với độ trễ.
      ox += (tx - ox) * Math.min(1, dt * 9); oy += (ty - oy) * Math.min(1, dt * 9)
      speed *= Math.pow(0.02, dt)
      ob.style.transform = `translate3d(${ox}px, ${oy}px, 0) translate(-50%, -50%) scale(${(inside ? 1 : 0.2) + Math.min(0.9, speed / 900)})`
      ob.style.opacity = inside ? '1' : '0'
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      let alive = 0
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue
        life[i] -= dt * 1.1
        if (life[i] <= 0) continue
        vy[i] += 140 * dt
        px[i] += vx[i] * dt; py[i] += vy[i] * dt
        const a = Math.max(0, life[i])
        const r = size[i] * (0.6 + a)
        const g = ctx.createRadialGradient(px[i], py[i], 0, px[i], py[i], r * 4)
        g.addColorStop(0, `rgba(255,255,255,${a})`)
        g.addColorStop(0.35, hexA(tint, a * 0.9))
        g.addColorStop(1, hexA(tint, 0))
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(px[i], py[i], r * 4, 0, Math.PI * 2); ctx.fill()
        alive++
      }
      const orbBusy = inside || Math.abs(tx - ox) > 0.5 || Math.abs(ty - oy) > 0.5
      if (alive || orbBusy) raf = requestAnimationFrame(frame)
      else { raf = 0; n = 0 }
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !motionEnabled()) return
      const r = host.getBoundingClientRect()
      tx = ox = lastX = e.clientX - r.left; ty = oy = lastY = e.clientY - r.top
      const v = getComputedStyle(host).getPropertyValue('--holo-accent') || getComputedStyle(host).getPropertyValue('--tint-b')
      tint = normalizeColor(v.trim()) || color || '#38bdf8'
      ob.style.setProperty('--cf-color', tint)
      inside = true
      emit(tx, ty, 14, 1.6) // bùng nhẹ khi đưa chuột vào
      kick()
    }
    const onMove = (e: PointerEvent) => {
      if (!inside) { onEnter(e); if (!inside) return }
      if (!motionEnabled()) { inside = false; return }
      const r = host.getBoundingClientRect()
      tx = e.clientX - r.left; ty = e.clientY - r.top
      const d = Math.hypot(tx - lastX, ty - lastY)
      speed = Math.max(speed * 0.5, d * 60)
      if (d > 5) { emit(tx, ty, Math.min(5, 1 + Math.floor(d / 14)), 1 + Math.min(1.5, d / 40)); lastX = tx; lastY = ty }
      kick()
    }
    const onLeave = () => { inside = false; kick() }
    const onDown = (e: PointerEvent) => {
      if (!inside || !motionEnabled()) return
      const r = host.getBoundingClientRect()
      emit(e.clientX - r.left, e.clientY - r.top, 26, 2.4) // bấm: nổ hạt
      speed = 1200; kick()
    }
    host.addEventListener('pointerenter', onEnter)
    host.addEventListener('pointermove', onMove, { passive: true })
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener('pointerenter', onEnter)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
    }
  }, [color])

  return (
    <div ref={root} className="cursor-follow" aria-hidden="true">
      <canvas ref={canvas} className="cursor-follow-trail" />
      <span ref={orb} className="cursor-follow-orb"><i /></span>
    </div>
  )
}

function normalizeColor(v: string) {
  if (!v) return ''
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('')
  return ''
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`
}
