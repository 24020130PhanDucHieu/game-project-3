'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { countdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from './context'
import { useNow } from './shared'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'
import { usePointerMotion } from '@/lib/interaction-motion'

type Slide = { key: string; eyebrow: string; title: string; lines: string[]; accent: string; emoji: string; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }
const ACCENTS = ['from-violet-600 via-fuchsia-500 to-cyan-400', 'from-amber-500 via-orange-500 to-rose-500', 'from-emerald-500 via-teal-500 to-sky-500', 'from-sky-600 via-indigo-500 to-violet-500']

/**
 * Banner quảng cáo 3D: thẻ nhiều lớp xếp theo trục Z (nền → lưới/hình khối trôi → khung kính → chữ).
 * Chữ luôn ngay ngắn; thẻ nghiêng và các lớp lệch nhau theo chuột nên có chiều sâu; rê chuột như chạm mặt nước.
 */
export function Billboard() {
  const { tournaments, qualifiers, tournament, setTournamentId, navigate, setQualifierId, enterMatch } = useLive()
  const now = useNow()
  const [index, setIndex] = useState(0)
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const [fx] = useFx()
  const card = usePointerMotion<HTMLDivElement>('tilt')
  const swipe = useRef<{ x: number; moved: boolean } | null>(null)

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = []
    const liveMatch = Object.entries(tournament.data?.matches || {}).find(([, m]: [string, any]) => m.status === 'IN_PROGRESS') as [string, any] | undefined
    if (liveMatch) {
      const [id, m] = liveMatch
      out.push({ key: `live-${id}`, eyebrow: 'TRỰC TIẾP', title: `${m.team_a?.team_name || '?'}  ${m.team_a?.rounds_won ?? 0} – ${m.team_b?.rounds_won ?? 0}  ${m.team_b?.team_name || '?'}`, lines: [`${m.title || m.round_name} · Hiệp ${m.current_round_idx || 1}/${m.max_rounds || 5}`, 'Bấm để vào xem diễn biến'], accent: 'from-red-600 via-rose-500 to-blue-600', emoji: '', live: true, onClick: () => { void enterMatch(id) } })
    }
    for (const q of qualifiers.data || []) {
      if (q.status !== 'OPEN') continue
      const left = Math.floor((Number(q.deadline) * 1000 - now) / 1000)
      out.push({ key: `q-${q.id}`, eyebrow: 'VÒNG LOẠI ĐANG MỞ', title: q.name, lines: [left > 0 ? `Còn ${countdown(left)} để nộp bài` : 'Sắp khóa bài', `Top ${q.top_k} vào giải chính`], accent: ACCENTS[2], emoji: '', onClick: () => { setQualifierId(q.id); navigate('qualifier') } })
    }
    ;(tournaments.data || []).forEach((t, i) => {
      const champ = typeof t.champion === 'string' ? t.champion : t.champion?.team_name
      out.push({ key: `t-${t.tournament_id}`, eyebrow: STATUS[t.status] || t.status || 'GIẢI ĐẤU', title: t.name, lines: [champ ? `Quán quân: ${champ}` : `${t.num_teams} đội · Loại trực tiếp Bo5`, 'Bấm để xem bảng đấu'], accent: ACCENTS[i % ACCENTS.length], emoji: '', onClick: () => { setTournamentId(t.tournament_id); navigate('bracket') } })
    })
    out.push({ key: 'cta', eyebrow: 'FRESHMAN BOT ARENA · K69', title: 'Viết bot. Ra trận. Lên ngôi.', lines: ['Oẳn Tù Tì trên bàn cờ 9×9', 'Python hoặc C++ — đấu thử boss miễn phí'], accent: ACCENTS[3], emoji: '' })
    return out
  }, [tournaments.data, qualifiers.data, tournament.data, now, enterMatch, navigate, setQualifierId, setTournamentId])

  useEffect(() => { if (index >= slides.length) setIndex(0) }, [slides.length, index])
  useEffect(() => {
    if (hover || reduced || fx !== 'full' || slides.length < 2) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), 6000)
    return () => window.clearTimeout(timer)
  }, [index, hover, slides.length, reduced, fx])

  const go = (d: number) => setIndex((i) => (i + d + slides.length) % slides.length)
  const active = slides[index] || slides[0]
  if (!active) return null
  const open = () => { if (!swipe.current?.moved) active.onClick?.() }
  return (
    <div className="bn-scene select-none" data-testid="billboard" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setHover(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false) }}>
      <div
        ref={card}
        className={cn('bn-card water water-trail', active.onClick && 'bn-clickable')}
        role={active.onClick ? 'link' : 'group'}
        tabIndex={active.onClick ? 0 : undefined}
        aria-label={`${active.eyebrow}. ${active.title}. ${active.lines.join('. ')}`}
        onClick={open}
        onKeyDown={(e) => { if (active.onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); active.onClick() } }}
        onPointerDown={(e) => { swipe.current = { x: e.clientX, moved: false } }}
        onPointerMove={(e) => { const s = swipe.current; if (s && Math.abs(e.clientX - s.x) > 12) s.moved = true }}
        onPointerUp={(e) => { const s = swipe.current; if (s && Math.abs(e.clientX - s.x) > 56) go(e.clientX < s.x ? 1 : -1); window.setTimeout(() => { swipe.current = null }, 0) }}
        onPointerCancel={() => { swipe.current = null }}
      >
        <div className="bn-clip" aria-hidden>
          {slides.map((s, i) => <div key={s.key} className={cn('bn-palette bg-gradient-to-br', s.accent, i === index && 'bn-palette-active')} />)}
          <div className="bn-fx">
            <div className="bn-grid" />
            <span className="bn-blob bn-blob-a" /><span className="bn-blob bn-blob-b" /><span className="bn-blob bn-blob-c" />
          </div>
          <div className="bn-light" />
        </div>
        <div className="bn-glass" aria-hidden />
        <div key={active.key} className="bn-copy">
          <span className="bn-eyebrow">{active.live && <i className="bn-live" aria-hidden />}{active.eyebrow}</span>
          <h2 className="bn-title">{active.title}</h2>
          <p className="bn-lines">{active.lines.map((l) => <span key={l}>{l}</span>)}</p>
          {active.onClick && <span className="bn-cta">Khám phá <ArrowRight className="size-4" aria-hidden /></span>}
        </div>
      </div>
      <div className="bn-shadow" aria-hidden />
      {slides.length > 1 && (
        <div className="relative flex items-center justify-center gap-2">
          <button aria-label="Biển trước" onClick={() => go(-1)} className="water rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {slides.map((s, i) => <button key={s.key} aria-current={i === index ? true : undefined} aria-label={`Biển ${i + 1}: ${s.title}`} onClick={() => setIndex(i)} className={cn('h-2 rounded-full transition-all duration-500', i === index ? 'w-7 bg-primary' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70')} />)}
          <button aria-label="Biển sau" onClick={() => go(1)} className="water rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
