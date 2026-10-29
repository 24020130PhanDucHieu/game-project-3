'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { usePointerMotion } from '@/lib/interaction-motion'
import './hologram.css'

const PALETTES = [['#a78bfa', '#22d3ee'], ['#fb7185', '#a78bfa'], ['#22d3ee', '#34d399'], ['#fbbf24', '#fb7185']]
const PIECES = [{ x: 1, y: 1, side: 0, label: 'R' }, { x: 3, y: 1, side: 0, label: 'P' }, { x: 6, y: 2, side: 0, label: 'S' }, { x: 2, y: 3, side: 0, label: 'S' }, { x: 5, y: 5, side: 1, label: 'R' }, { x: 2, y: 6, side: 1, label: 'P' }, { x: 6, y: 7, side: 1, label: 'S' }, { x: 4, y: 7, side: 1, label: 'R' }]
type Slide = { key: string; eyebrow: string; title: string; lines: string[]; variant: number; onClick?: () => void; live?: boolean }

export function HologramStage({ slide, index, count, go, onPause, effectsEnabled }: { slide: Slide; index: number; count: number; go: (delta: number) => void; onPause: (paused: boolean) => void; effectsEnabled: boolean }) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const tilt = usePointerMotion<HTMLDivElement>(effectsEnabled && visible ? 'tilt' : 'none')
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const stopped = hover || focus || paused || !visible
  useEffect(() => { onPause(stopped) }, [stopped, onPause])
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    update(); document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const palette = PALETTES[slide.variant % PALETTES.length]
  return <div ref={tilt} className="holo-arena" data-testid="billboard" data-motion={effectsEnabled && visible ? 'on' : 'off'} style={{ '--holo-accent': palette[0], '--holo-secondary': palette[1] } as CSSProperties}
    role="region" aria-roledescription="carousel" aria-label={`Các giải đấu nổi bật · ${index + 1}/${count}`}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onFocusCapture={() => setFocus(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false) }}
    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1) } }}>
    <div className="holo-topline"><span><i /> FRESHMAN ARENA</span><span>TOURNAMENT / {String(index + 1).padStart(2, '0')}</span></div>
    <button className="holo-pause" aria-label={paused ? 'Tiếp tục tự chuyển' : 'Tạm dừng tự chuyển'} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>
    <div className="holo-stage"
      onPointerDown={e => { if (e.pointerType === 'touch') swipe.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={e => { const s = swipe.current; swipe.current = null; if (s && Math.abs(e.clientX - s.x) > 65 && Math.abs(e.clientX - s.x) > Math.abs(e.clientY - s.y)) { go(e.clientX < s.x ? 1 : -1) } }}
      onPointerCancel={() => { swipe.current = null }}>
      <div className="holo-copy" key={slide.key}>
        <span className="holo-status">{slide.live && <i />}{slide.eyebrow}</span>
        <h2>{slide.title}</h2><p>{slide.lines[0]}</p>
        {slide.key.startsWith('q-') && <p>{slide.lines[1]}</p>}
      </div>
      <div className="holo-visual" aria-hidden="true">
        <div className="holo-orbit" />
        <div className="holo-board">
          <div className="holo-grid">{Array.from({ length: 81 }, (_, i) => <span key={i} className={(Math.floor(i / 9) + i % 9) % 2 ? 'holo-cell alternate' : 'holo-cell'} />)}</div>
          <div className="holo-scan" />
          {PIECES.map((p, i) => <span key={i} className={`holo-piece side-${p.side}`} style={{ left: `${(p.x + .5) / 9 * 100}%`, top: `${(p.y + .5) / 9 * 100}%`, animationDelay: `${i * -.4}s` }}><b>{p.label}</b></span>)}
          <span className="holo-path" />
        </div>
        <div className="holo-floor" /><span className="holo-caption">BOT ARENA <span>9 × 9</span></span>
      </div>
    </div>
    <div className="holo-actions">
      {slide.onClick ? <button className="holo-cta" onClick={slide.onClick}>{slide.key.startsWith('t-') ? 'Xem bảng đấu' : slide.key.startsWith('q-') ? 'Vào vòng loại' : 'Xem trực tiếp'}<ArrowRight size={16} /></button> : <span className="holo-invitation">{slide.lines[1]}</span>}
      <span className="holo-illustration">Sân đấu minh họa</span>
    </div>

  </div>
}
