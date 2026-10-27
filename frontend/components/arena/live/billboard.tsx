'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, MoveHorizontal } from 'lucide-react'
import { countdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from './context'
import { useNow } from './shared'
import { MotionSurface } from './motion-surface'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'
import { useCubeDrag } from '@/lib/cube-drag'

type Slide = { key: string; eyebrow: string; title: string; lines: string[]; accent: string; emoji: string; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }
const ACCENTS = ['from-violet-600 via-fuchsia-500 to-cyan-400', 'from-amber-500 via-orange-500 to-rose-500', 'from-emerald-500 via-teal-500 to-sky-500', 'from-sky-600 via-indigo-500 to-violet-500']

/** Bảng quảng cáo 3D: tấm biển nghiêng phối cảnh, tự lật qua từng giải đấu / vòng loại / trận trực tiếp. */
export function Billboard() {
  const { tournaments, qualifiers, tournament, setTournamentId, navigate, setQualifierId, enterMatch } = useLive()
  const now = useNow()
  const cube = useCubeDrag()
  const [index, setIndex] = useState(0)
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const [fx] = useFx()

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = []
    const liveMatch = Object.entries(tournament.data?.matches || {}).find(([, m]: [string, any]) => m.status === 'IN_PROGRESS') as [string, any] | undefined
    if (liveMatch) {
      const [id, m] = liveMatch
      out.push({ key: `live-${id}`, eyebrow: '● TRỰC TIẾP', title: `${m.team_a?.team_name || '?'}  ${m.team_a?.rounds_won ?? 0} – ${m.team_b?.rounds_won ?? 0}  ${m.team_b?.team_name || '?'}`, lines: [`${m.title || m.round_name} · Hiệp ${m.current_round_idx}/${m.max_rounds || 5}`, 'Bấm để vào xem diễn biến'], accent: 'from-red-600 via-rose-500 to-blue-600', emoji: '', live: true, onClick: () => void enterMatch(id) })
    }
    for (const q of qualifiers.data || []) {
      if (q.status !== 'OPEN') continue
      const left = Math.floor((Number(q.deadline) * 1000 - now) / 1000)
      out.push({ key: `q-${q.id}`, eyebrow: 'VÒNG LOẠI ĐANG MỞ', title: q.name, lines: [left > 0 ? `Còn ${countdown(left)} để nộp bài` : 'Sắp khóa bài', `Top ${q.top_k} vào giải chính`], accent: ACCENTS[2], emoji: '', onClick: () => { setQualifierId(q.id); navigate('qualifier') } })
    }
    ;(tournaments.data || []).forEach((t, i) => {
      const champ = typeof t.champion === 'string' ? t.champion : t.champion?.team_name
      out.push({ key: `t-${t.tournament_id}`, eyebrow: STATUS[t.status] || t.status || 'GIẢI ĐẤU', title: t.name, lines: [champ ? `Quán quân: ${champ}` : `${t.num_teams} đội · Loại trực tiếp Bo5`, 'Bấm để xem bảng đấu'], accent: ACCENTS[i % ACCENTS.length], emoji: champ ? '' : '', onClick: () => { setTournamentId(t.tournament_id); navigate('bracket') } })
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

  const go = (d: number) => { cube.reset(); setIndex((i) => (i + d + slides.length) % slides.length) }
  return (
    <div className="billboard-scene select-none" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setHover(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false) }}>
      <div className="billboard-halo" aria-hidden />
      <div ref={cube.ref} className="cube-drag-zone" {...cube.handlers} onTouchStart={() => setHover(true)} aria-label="Khối thông tin 3D. Kéo ngang để xoay; dùng các nút bên dưới để chọn thông tin.">
      <MotionSurface className="billboard-cube fx-tilt">
        <div className="cube-face cube-top" aria-hidden><span>ARENA / LIVE</span><span className="cube-top-grid" /></div>
        <div className="cube-face cube-bottom" aria-hidden />
        {(['front', 'right', 'back', 'left'] as const).map((face, offset) => {
          const s = slides[(index + offset) % slides.length]
          if (!s) return null
          return <div key={face} className={`cube-face cube-${face}`}>
            <button key={s.key} type="button" tabIndex={offset === 0 ? 0 : -1} onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) cube.orient(-offset * 90 - 24) }} onClick={s.onClick}
              className={cn('cube-slide bg-gradient-to-br', s.accent, 'cube-slide-active', s.onClick ? 'cursor-pointer' : 'cursor-default')}>
              <span className="hero-grid absolute inset-0 opacity-30" aria-hidden />
              <span className="cube-slide-light" aria-hidden />
              <span className="relative flex items-center justify-between text-[10px] font-bold tracking-[.2em] text-white/75"><span>FRESHMAN ARENA</span><span>0{(index + offset) % slides.length + 1}</span></span>
              <span className="relative mt-auto block">
                <span className={cn('inline-flex rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest', s.live && 'animate-pulse')}>{s.eyebrow}</span>
                <span className="mt-4 line-clamp-3 block text-2xl font-black leading-tight sm:text-3xl">{s.title}</span>
                <span className="mt-3 block space-y-1 text-xs font-medium text-white/90 sm:text-sm">{s.lines.map(l => <span key={l} className="block">{l}</span>)}</span>
              </span>
              <span className="relative mt-5 flex items-center justify-between border-t border-white/25 pt-3 text-[10px] font-semibold tracking-wider"><span>{s.onClick ? 'KHÁM PHÁ GIẢI ĐẤU' : 'SẴN SÀNG RA TRẬN'}</span><ChevronRight className="size-4" /></span>
            </button>
        </div>
        })}
      </MotionSurface>
      </div>
      <div className="cube-ground" aria-hidden />
      <div className="relative mb-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><MoveHorizontal className="size-3.5" />Kéo ngang để xoay · Bấm mặt để xem</span>
        <button type="button" onClick={cube.reset} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-2 transition-colors hover:border-primary/60 hover:text-primary"><RotateCcw className="size-3.5" />Đặt lại góc nhìn</button>
      </div>
      {slides.length > 1 && (
        <div className="cube-controls relative flex items-center justify-center gap-2">
          <button aria-label="Biển trước" onClick={() => go(-1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {slides.map((s, i) => <button key={s.key} aria-current={i === index ? true : undefined} aria-label={`Biển ${i + 1}: ${s.title}`} onClick={() => { cube.reset(); setIndex(i) }} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40')} />)}
          <button aria-label="Biển sau" onClick={() => go(1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
