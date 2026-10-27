'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { countdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from './context'
import { useNow } from './shared'
import { MotionSurface } from './motion-surface'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'

type Slide = { key: string; eyebrow: string; title: string; lines: string[]; accent: string; emoji: string; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }
const ACCENTS = ['from-violet-600 via-fuchsia-500 to-cyan-400', 'from-amber-500 via-orange-500 to-rose-500', 'from-emerald-500 via-teal-500 to-sky-500', 'from-sky-600 via-indigo-500 to-violet-500']

/** Bảng quảng cáo 3D: tấm biển nghiêng phối cảnh, tự lật qua từng giải đấu / vòng loại / trận trực tiếp. */
export function Billboard() {
  const { tournaments, qualifiers, tournament, setTournamentId, navigate, setQualifierId, enterMatch } = useLive()
  const now = useNow()
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

  const go = (d: number) => setIndex((i) => (i + d + slides.length) % slides.length)
  return (
    <div className="relative mx-auto w-full max-w-[560px] select-none" style={{ perspective: '1400px' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <MotionSurface tilt className="relative rounded-[22px]" style={{ transformStyle: 'preserve-3d' }}>
        {/* Khung biển: viền kim loại + đèn chiếu phía trên */}
        <div className="relative aspect-[16/9] rounded-[22px] border-[6px] border-slate-700 bg-slate-900 shadow-[0_40px_80px_-30px_rgba(0,0,0,.7),inset_0_0_0_2px_rgba(255,255,255,.08)] dark:border-slate-600" style={{ transformStyle: 'preserve-3d' }}>
          <div className="pointer-events-none absolute -top-5 left-[12%] right-[12%] flex justify-between" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="h-4 w-10 rounded-t-full bg-slate-600 shadow-[0_12px_30px_8px_rgba(255,255,220,.35)]" />)}
          </div>
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-hidden={i !== index}
              tabIndex={i === index ? 0 : -1}
              onClick={s.onClick}
              className={cn('absolute inset-0 overflow-hidden rounded-[16px] bg-gradient-to-br p-5 text-left text-white transition-all duration-700 [backface-visibility:hidden] md:p-7', s.accent, s.onClick ? 'cursor-pointer' : 'cursor-default')}
              style={{ transform: i === index ? 'rotateX(0deg)' : i < index ? 'rotateX(90deg)' : 'rotateX(-90deg)', opacity: i === index ? 1 : 0, transformOrigin: 'center center' }}
            >
              <span className="hero-grid absolute inset-0 opacity-40" aria-hidden />
              <span className="absolute -right-4 -bottom-6 text-[120px] leading-none opacity-30 md:text-[150px]" aria-hidden>{s.emoji}</span>
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,.28)_50%,transparent_65%)] billboard-shine" aria-hidden />
              <span className={cn('relative inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.18em]', s.live && 'animate-pulse')}>{s.eyebrow}</span>
              <span className="fx-depth font-display relative mt-3 line-clamp-2 block text-2xl font-black leading-tight drop-shadow md:text-3xl">{s.title}</span>
              <span className="relative mt-3 block space-y-0.5 text-sm font-semibold text-white/90">{s.lines.map((l) => <span key={l} className="block truncate">{l}</span>)}</span>
            </button>
          ))}
        </div>
        {/* Chân biển */}
        <div className="mx-auto flex w-[55%] justify-between" aria-hidden>
          <span className="h-10 w-3 rounded-b bg-gradient-to-b from-slate-600 to-slate-800" /><span className="h-10 w-3 rounded-b bg-gradient-to-b from-slate-600 to-slate-800" />
        </div>
      </MotionSurface>
      {slides.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button aria-label="Biển trước" onClick={() => go(-1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {slides.map((s, i) => <button key={s.key} aria-label={`Biển ${i + 1}: ${s.title}`} onClick={() => setIndex(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40')} />)}
          <button aria-label="Biển sau" onClick={() => go(1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
