'use client'

import { motionEnabled } from './interaction-motion'

/**
 * Mặt nước mô phỏng cho banner: sóng 2 bộ đệm (height field) khúc xạ một ảnh nguồn (cảnh SVG của banner).
 * Chạy ở độ phân giải thấp (~1/2) và chỉ có vòng lặp khi còn sóng; hết sóng thì dừng và ẩn canvas.
 */
export type Water = {
  /** Thả giọt ở toạ độ chuẩn hoá 0..1; strength ~ 0.3..1.2. */
  drop: (nx: number, ny: number, strength: number, radius?: number) => void
  setSource: (svg: string) => void
  destroy: () => void
}

const DAMPING = 0.98
const REFRACT = 26
const MIN_ENERGY = 5

export function createWater(canvas: HTMLCanvasElement, svg: string): Water {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let w = 0
  let h = 0
  let a = new Float32Array(0)
  let b = new Float32Array(0)
  let src: Uint8ClampedArray | null = null
  let out: ImageData | null = null
  let raf = 0
  let last = 0
  let active = false
  let alive = true
  let source = svg
  let loadToken = 0

  const size = () => {
    const box = canvas.getBoundingClientRect()
    const nw = Math.max(80, Math.round(box.width / 2))
    const nh = Math.max(40, Math.round(box.height / 2))
    if (nw === w && nh === h && src) return true
    w = nw; h = nh
    canvas.width = w; canvas.height = h
    a = new Float32Array(w * h)
    b = new Float32Array(w * h)
    out = ctx ? ctx.createImageData(w, h) : null
    src = null
    return false
  }

  const loadSource = () => {
    const token = ++loadToken
    const img = new Image()
    img.onload = () => {
      if (!alive || token !== loadToken || !ctx) return
      const tmp = document.createElement('canvas')
      tmp.width = w; tmp.height = h
      const t = tmp.getContext('2d')
      if (!t) return
      // Cảnh được "phủ" theo kiểu cover, khớp với các lớp SVG xMidYMax slice.
      const scale = Math.max(w / img.width, h / img.height)
      const dw = img.width * scale, dh = img.height * scale
      t.drawImage(img, (w - dw) / 2, h - dh, dw, dh)
      src = t.getImageData(0, 0, w, h).data
      if (active) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) }
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  }

  const frame = (now: number) => {
    if (!alive) return
    if (!motionEnabled() || document.hidden) { stop(); return }
    raf = requestAnimationFrame(frame)
    if (now - last < 32) return // ~30 khung/giây
    last = now
    if (!ctx || !out || !src) return
    const o = out.data
    let energy = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        const n = ((a[i - 1] + a[i + 1] + a[i - w] + a[i + w]) / 2 - b[i]) * DAMPING
        b[i] = n
        energy += n < 0 ? -n : n
      }
    }
    const t = a; a = b; b = t
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const dx = x > 0 && x < w - 1 ? a[i + 1] - a[i - 1] : 0
        const dy = y > 0 && y < h - 1 ? a[i + w] - a[i - w] : 0
        let sx = (x + dx * REFRACT) | 0
        let sy = (y + dy * REFRACT) | 0
        if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1
        if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1
        const s = (sy * w + sx) * 4
        const light = (dx + dy) * 120 // sáng ở sườn sóng hướng về nguồn sáng, tối ở phía ngược lại
        const spec = a[i] > 0.9 ? (a[i] - 0.9) * 90 : 0
        const p = i * 4
        o[p] = Math.max(0, Math.min(255, src[s] + light + spec))
        o[p + 1] = Math.max(0, Math.min(255, src[s + 1] + light * 1.05 + spec))
        o[p + 2] = Math.max(0, Math.min(255, src[s + 2] + light * 1.2 + spec))
        o[p + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
    if (energy < MIN_ENERGY) stop()
  }

  const start = () => {
    if (active || !alive) return
    active = true
    canvas.dataset.on = '1'
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    active = false
    cancelAnimationFrame(raf)
    delete canvas.dataset.on
    a.fill(0); b.fill(0)
  }

  return {
    drop(nx, ny, strength, radius = 3) {
      if (!alive || !ctx) return
      if (!motionEnabled() || document.hidden) { stop(); return }
      if (!size() || !src) loadSource()
      const cx = Math.round(Math.max(2, Math.min(w - 3, nx * w)))
      const cy = Math.round(Math.max(2, Math.min(h - 3, ny * h)))
      const r = Math.max(2, Math.round(radius))
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.sqrt(x * x + y * y)
          if (d > r) continue
          const px = cx + x, py = cy + y
          if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue
          a[py * w + px] -= strength * (1 - d / (r + 0.5))
        }
      }
      start()
    },
    setSource(next) { if (next === source) return; source = next; src = null; loadSource() },
    destroy() { alive = false; cancelAnimationFrame(raf); delete canvas.dataset.on },
  }
}
