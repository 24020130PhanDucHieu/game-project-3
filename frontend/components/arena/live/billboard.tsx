'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { countdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from './context'
import { useNow } from './shared'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'
import { motionEnabled, usePointerMotion } from '@/lib/interaction-motion'
import { createWater, type Water } from '@/lib/water-canvas'
import { SceneLayers, sceneComposite, sceneSky } from './banner-scene'

type Slide = { key: string; eyebrow: string; title: string; lines: string[]; variant: number; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }

/** Một thẻ của dải cover-flow. Chỉ thẻ giữa nhận chuột (nghiêng, lớp lệch, sóng nước); thẻ bên chỉ bấm để chuyển. */
function SlideCard({ slide, active, offset, onPick, effectsEnabled }: { slide: Slide; active: boolean; offset: number; onPick: () => void; effectsEnabled: boolean }) {
  // Gắn lên khung ngoài (không nghiêng) để vùng bắt chuột ổn định; các biến --tilt/--par/--pointer được thừa kế xuống thẻ.
  const tilt = usePointerMotion<HTMLDivElement>(active ? 'tilt' : 'none')
  const canvas = useRef<HTMLCanvasElement>(null)
  const water = useRef<Water | null>(null)
  const lastDrop = useRef({ x: -99, y: -99 })
  const delayedDrop = useRef<number | null>(null)
  const canDrop = useRef(false)

  useLayoutEffect(() => {
    canDrop.current = active && effectsEnabled
    return () => {
      canDrop.current = false
      if (delayedDrop.current !== null) window.clearTimeout(delayedDrop.current)
      delayedDrop.current = null
      water.current?.destroy(); water.current = null
    }
  }, [active, slide.variant, effectsEnabled])

  const ensureWater = () => {
    if (!canDrop.current || !motionEnabled()) return null
    if (water.current) return water.current
    const el = canvas.current
    if (!el || !motionEnabled()) return null
    water.current = createWater(el, sceneComposite(slide.variant))
    return water.current
  }
  const dropAt = (e: { clientX: number; clientY: number }, strength: number, radius: number) => {
    const el = canvas.current
    const w = ensureWater()
    if (!el || !w) return
    const box = el.getBoundingClientRect()
    w.drop((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, strength, radius)
  }

  return (
    <div
      ref={tilt}
      className={cn('cf-card', active && 'cf-active', active && 'water water-trail')}
      data-offset={offset}
      style={{ ['--off' as string]: offset, ['--abs' as string]: Math.abs(offset) }}
      onClick={() => { if (active) slide.onClick?.(); else onPick() }}
    >
      <div
        className={cn('cf-tilt bn-card', active && slide.onClick && 'bn-clickable')}
        role={active && slide.onClick ? 'link' : 'group'}
        tabIndex={active ? 0 : -1}
        data-banner-target
        aria-hidden={active ? undefined : true}
        aria-label={`${slide.eyebrow}. ${slide.title}. ${slide.lines.join('. ')}`}
        onKeyDown={(e) => { if (active && slide.onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); slide.onClick() } }}
        onPointerMove={(e) => {
          if (!active) return
          const last = lastDrop.current
          if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 16) return
          const speed = Math.min(1, Math.hypot(e.clientX - last.x, e.clientY - last.y) / 90)
          lastDrop.current = { x: e.clientX, y: e.clientY }
          dropAt(e, 0.45 + speed * 0.7, 3)
        }}
        onPointerDown={(e) => {
          if (!active || !canDrop.current || !motionEnabled()) return
          const point = { clientX: e.clientX, clientY: e.clientY }
          dropAt(point, 1.8, 6)
          if (delayedDrop.current !== null) window.clearTimeout(delayedDrop.current)
          delayedDrop.current = window.setTimeout(() => {
            delayedDrop.current = null
            dropAt(point, 1.0, 9)
          }, 140)
        }}
      >
        <div className="bn-clip" aria-hidden style={{ background: sceneSky(slide.variant) }}>
          <SceneLayers variant={slide.variant} />
          <canvas ref={canvas} className="bn-water" />
          <div className="bn-glare" />
        </div>
        <div className="bn-glass" aria-hidden />
        <div className="bn-copy">
          <span className="bn-eyebrow">{slide.live && <i className="bn-live" aria-hidden />}{slide.eyebrow}</span>
          <h2 className="bn-title">{slide.title}</h2>
          <p className="bn-lines">{slide.lines.map((l) => <span key={l}>{l}</span>)}</p>
          {slide.onClick && <span className="bn-cta">Khám phá <ArrowRight className="size-4" aria-hidden /></span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Banner cover-flow 3D: thẻ đang chọn ở giữa, hai bên là các thẻ nghiêng và lùi sâu; đổi biển thì mọi thẻ trượt/xoay mượt.
 * Thẻ giữa nhiều lớp (sao, núi, rừng/thành phố, chữ) lệch nhau theo chuột, rê chuột và bấm làm mặt nước gợn sóng.
 */
export function Billboard() {
  const { tournaments, qualifiers, tournament, setTournamentId, navigate, setQualifierId, enterMatch } = useLive()
  const now = useNow()
  const [index, setIndex] = useState(0)
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const [fx] = useFx()
  const swipe = useRef<{ x: number; moved: boolean } | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const focusAfterChange = useRef(false)
  useLayoutEffect(() => {
    if (!focusAfterChange.current) return
    focusAfterChange.current = false
    stage.current?.querySelector<HTMLElement>('.cf-active [data-banner-target]')?.focus({ preventScroll: true })
  }, [index])

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = []
    const liveMatch = Object.entries(tournament.data?.matches || {}).find(([, m]: [string, any]) => m.status === 'IN_PROGRESS') as [string, any] | undefined
    if (liveMatch) {
      const [id, m] = liveMatch
      out.push({ key: `live-${id}`, eyebrow: 'TRỰC TIẾP', title: `${m.team_a?.team_name || '?'}  ${m.team_a?.rounds_won ?? 0} – ${m.team_b?.rounds_won ?? 0}  ${m.team_b?.team_name || '?'}`, lines: [`${m.title || m.round_name} · Hiệp ${m.current_round_idx || 1}/${m.max_rounds || 5}`, 'Bấm để vào xem diễn biến'], variant: 1, live: true, onClick: () => { void enterMatch(id) } })
    }
    for (const q of qualifiers.data || []) {
      if (q.status !== 'OPEN') continue
      const left = Math.floor((Number(q.deadline) * 1000 - now) / 1000)
      out.push({ key: `q-${q.id}`, eyebrow: 'VÒNG LOẠI ĐANG MỞ', title: q.name, lines: [left > 0 ? `Còn ${countdown(left)} để nộp bài` : 'Sắp khóa bài', `Top ${q.top_k} vào giải chính`], variant: 2, onClick: () => { setQualifierId(q.id); navigate('qualifier') } })
    }
    ;(tournaments.data || []).forEach((t, i) => {
      const champ = typeof t.champion === 'string' ? t.champion : t.champion?.team_name
      out.push({ key: `t-${t.tournament_id}`, eyebrow: STATUS[t.status] || t.status || 'GIẢI ĐẤU', title: t.name, lines: [champ ? `Quán quân: ${champ}` : `${t.num_teams} đội · Loại trực tiếp Bo5`, 'Bấm để xem bảng đấu'], variant: i % 4, onClick: () => { setTournamentId(t.tournament_id); navigate('bracket') } })
    })
    out.push({ key: 'cta', eyebrow: 'FRESHMAN BOT ARENA · K69', title: 'Viết bot. Ra trận. Lên ngôi.', lines: ['Oẳn Tù Tì trên bàn cờ 9×9', 'Python hoặc C++ — đấu thử boss miễn phí'], variant: 3 })
    return out
  }, [tournaments.data, qualifiers.data, tournament.data, now, enterMatch, navigate, setQualifierId, setTournamentId])

  useEffect(() => { if (index >= slides.length) setIndex(0) }, [slides.length, index])
  useEffect(() => {
    if (hover || reduced || fx !== 'full' || slides.length < 2) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), 6000)
    return () => window.clearTimeout(timer)
  }, [index, hover, slides.length, reduced, fx])

  const n = slides.length
  const go = (d: number) => setIndex((i) => (i + d + n) % n)
  const active = slides[index] || slides[0]
  if (!active) return null
  /** Khoảng cách có dấu ngắn nhất trên vòng tròn: thẻ bên phải là +1, bên trái là −1. */
  const offsetOf = (i: number) => { let d = (i - index) % n; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d }
  return (
    <div className="cf-scene select-none" data-testid="billboard" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setHover(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false) }}
      onKeyDown={(e) => {
        if (n < 2 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
        e.preventDefault()
        focusAfterChange.current = !!stage.current?.contains(e.target as Node)
        go(e.key === 'ArrowLeft' ? -1 : 1)
      }}>
      <div
        ref={stage}
        className="cf-stage"
        onClickCapture={(e) => { if (swipe.current?.moved) { e.stopPropagation(); e.preventDefault() } }}
        onPointerDown={(e) => { swipe.current = { x: e.clientX, moved: false } }}
        onPointerMove={(e) => { const s = swipe.current; if (s && Math.abs(e.clientX - s.x) > 14) s.moved = true }}
        onPointerUp={(e) => { const s = swipe.current; if (s && Math.abs(e.clientX - s.x) > 70) go(e.clientX < s.x ? 1 : -1); window.setTimeout(() => { swipe.current = null }, 0) }}
        onPointerCancel={() => { swipe.current = null }}
      >
        {slides.map((s, i) => {
          const off = offsetOf(i)
          if (Math.abs(off) > 2) return null
          return <SlideCard key={s.key} slide={s} active={off === 0} offset={off} onPick={() => setIndex(i)} effectsEnabled={fx === 'full' && !reduced} />
        })}
      </div>
      <div className="bn-shadow" aria-hidden />
      {n > 1 && (
        <div className="relative flex items-center justify-center gap-2">
          <button aria-label="Biển trước" onClick={() => go(-1)} className="water rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {slides.map((s, i) => <button key={s.key} aria-current={i === index ? true : undefined} aria-label={`Biển ${i + 1}: ${s.title}`} onClick={() => setIndex(i)} className={cn('h-2 rounded-full transition-all duration-500', i === index ? 'w-7 bg-primary' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70')} />)}
          <button aria-label="Biển sau" onClick={() => go(1)} className="water rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
