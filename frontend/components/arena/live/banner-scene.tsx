/**
 * Cảnh nhiều lớp cho banner (kiểu Atropos): mỗi lớp là một SVG trong suốt, xếp chồng và lệch nhau theo chuột.
 * Toàn bộ vẽ bằng mã (không tải ảnh) và xác định theo `variant`, nên server và client luôn ra cùng kết quả.
 */
export type SceneLayer = { id: string; depth: number; svg: string }

const W = 720
const H = 280

const PALETTES = [
  { sky: ['#2a0a63', '#7a2fd0', '#d070f0'], far: '#5b1fb0', near: '#3d1585', tree: '#240a52', accent: '#ffffff' }, // đêm tím
  { sky: ['#4a1030', '#e0562d', '#ffc36a'], far: '#a8321f', near: '#6e1d1a', tree: '#3b0f14', accent: '#fff2c4' }, // hoàng hôn
  { sky: ['#06303d', '#0e8a86', '#7df0d2'], far: '#0a6d70', near: '#075057', tree: '#043a42', accent: '#eafffa' }, // biển
  { sky: ['#0a1240', '#3a46c8', '#7fb2ff'], far: '#2a3598', near: '#1c2674', tree: '#101757', accent: '#e8f0ff' }, // thành phố
]

/** Bộ sinh số giả ngẫu nhiên cố định theo seed. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

function ridge(seed: number, base: number, amp: number, step: number) {
  const r = rng(seed)
  let d = `M0,${H} L0,${base}`
  for (let x = step; x <= W + step; x += step) d += ` L${x},${(base - r() * amp).toFixed(1)}`
  return d + ` L${W},${H} Z`
}

function svg(inner: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">${inner}</svg>`
}

function stars(seed: number, count: number, size: number, color: string) {
  const r = rng(seed)
  let out = ''
  for (let i = 0; i < count; i++) out += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.55).toFixed(0)}" r="${(size * (0.5 + r())).toFixed(1)}" fill="${color}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`
  return out
}

function trees(seed: number, base: number, color: string) {
  const r = rng(seed)
  let out = ''
  for (let x = -10; x < W + 10; x += 14 + r() * 12) {
    const h = 34 + r() * 46
    const w = 12 + r() * 12
    out += `<path d="M${x.toFixed(0)},${base} l${(w / 2).toFixed(1)},${(-h).toFixed(1)} l${(w / 2).toFixed(1)},${h.toFixed(1)} Z" fill="${color}"/>`
  }
  return out + `<rect x="0" y="${base}" width="${W}" height="${H - base}" fill="${color}"/>`
}

function skyline(seed: number, base: number, color: string, windows: string) {
  const r = rng(seed)
  let out = ''
  let x = -4
  while (x < W) {
    const w = 26 + r() * 40
    const h = 50 + r() * 110
    out += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${w.toFixed(0)}" height="${(h + H - base).toFixed(0)}" fill="${color}"/>`
    for (let wy = base - h + 8; wy < base - 6; wy += 11) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() > 0.62) out += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="3" height="5" fill="${windows}" opacity="0.8"/>`
    x += w + 2 + r() * 6
  }
  return out
}

function waves(base: number, amp: number, color: string, phase: number) {
  let d = `M0,${H} L0,${base}`
  for (let x = 0; x <= W; x += 10) d += ` L${x},${(base + Math.sin(x / 48 + phase) * amp).toFixed(1)}`
  return `<path d="${d} L${W},${H} Z" fill="${color}"/>`
}

/** Các lớp từ xa tới gần; `depth` là độ sâu (px) dùng để dịch chuyển/nghiêng khi rê chuột. */
export function sceneLayers(variant: number): SceneLayer[] {
  const v = ((variant % PALETTES.length) + PALETTES.length) % PALETTES.length
  const p = PALETTES[v]
  const layers: SceneLayer[] = [
    { id: 'stars-far', depth: 10, svg: svg(stars(11 + v, 70, 1.1, p.accent)) },
    { id: 'stars-near', depth: 22, svg: svg(stars(31 + v, 22, 1.9, p.accent)) },
  ]
  if (v === 2) {
    layers.push({ id: 'far', depth: 34, svg: svg(waves(150, 9, p.far, 0)) }, { id: 'near', depth: 52, svg: svg(waves(190, 12, p.near, 1.7)) }, { id: 'front', depth: 74, svg: svg(waves(236, 10, p.tree, 3.1)) })
  } else if (v === 3) {
    layers.push({ id: 'far', depth: 34, svg: svg(skyline(5, 205, p.far, p.accent)) }, { id: 'near', depth: 56, svg: svg(skyline(9, 250, p.near, p.accent)) }, { id: 'front', depth: 78, svg: svg(`<rect x="0" y="262" width="${W}" height="20" fill="${p.tree}"/>`) })
  } else {
    layers.push(
      { id: 'far', depth: 34, svg: svg(`<path d="${ridge(7 + v, 150, 70, 38)}" fill="${p.far}"/>`) },
      { id: 'near', depth: 52, svg: svg(`<path d="${ridge(13 + v, 190, 60, 30)}" fill="${p.near}"/>`) },
      { id: 'front', depth: 78, svg: svg(v === 0 ? trees(3, 236, p.tree) : `<path d="${ridge(21, 232, 36, 26)}" fill="${p.tree}"/>`) },
    )
  }
  return layers
}

export function sceneSky(variant: number) {
  const p = PALETTES[((variant % PALETTES.length) + PALETTES.length) % PALETTES.length]
  return `linear-gradient(160deg, ${p.sky[0]} 0%, ${p.sky[1]} 55%, ${p.sky[2]} 100%)`
}

/** Toàn bộ cảnh gộp thành một SVG (nền trời + mọi lớp) để vẽ vào canvas làm "mặt nước" khúc xạ. */
export function sceneComposite(variant: number) {
  const v = ((variant % PALETTES.length) + PALETTES.length) % PALETTES.length
  const p = PALETTES[v]
  const body = sceneLayers(v).map((l) => l.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${body}</svg>`
}

export function SceneLayers({ variant }: { variant: number }) {
  return (
    <>
      {sceneLayers(variant).map((l) => (
        <div key={l.id} className="bn-layer" data-layer={l.id} style={{ ['--depth' as string]: l.depth }} aria-hidden dangerouslySetInnerHTML={{ __html: l.svg }} />
      ))}
    </>
  )
}
