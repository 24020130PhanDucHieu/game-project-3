'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { countdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from './context'
import { useNow } from './shared'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'
import { useCubeDrag } from '@/lib/cube-drag'
import { GlobeAdvert } from './globe-advert'

type Slide = { key: string; eyebrow: string; title: string; lines: string[]; accent: string; emoji: string; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }
const ACCENTS = ['from-violet-600 via-fuchsia-500 to-cyan-400', 'from-amber-500 via-orange-500 to-rose-500', 'from-emerald-500 via-teal-500 to-sky-500', 'from-sky-600 via-indigo-500 to-violet-500']

/** Quả cầu quảng cáo: màu theo giải, bề mặt tự quay; nội dung giữ ngay ngắn. */
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
  const active = slides[index] || slides[0]
  return (
    <div className="orb-scene select-none" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setHover(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false) }}>
      <div ref={cube.ref} className="orb-interaction" {...cube.handlers}>
        <div className="advert-orb">
          {slides.map((s, i) => <div key={s.key} aria-hidden className={cn('orb-palette bg-gradient-to-br', s.accent, i === index && 'orb-palette-active')} />)}
          <div className="orb-longitudes" aria-hidden>
            <div className="orb-spin">{[0, 30, 60, 90, 120, 150].map(deg => <span key={deg} className="orb-meridian" style={{ transform: `rotateY(${deg}deg)` }} />)}</div>
          </div>
          <div className="orb-shading" aria-hidden />
          <button key={active.key} type="button" onClick={active.onClick} aria-label={`${active.eyebrow}. ${active.title}. ${active.lines.join('. ')}`} className={cn('orb-copy orb-copy-curved', active.onClick ? 'cursor-pointer' : 'cursor-grab')}>
            <GlobeAdvert eyebrow={active.eyebrow} title={active.title} lines={active.lines} actionable={!!active.onClick} />
          </button>
        </div>
      </div>
      <div className="orb-shadow" aria-hidden />
      {slides.length > 1 && (
        <div className="relative flex items-center justify-center gap-2">
          <button aria-label="Biển trước" onClick={() => go(-1)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {slides.map((s, i) => <button key={s.key} aria-current={i === index ? true : undefined} aria-label={`Biển ${i + 1}: ${s.title}`} onClick={() => { cube.reset(); setIndex(i) }} className={cn('h-2 rounded-full transition-all duration-500', i === index ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40')} />)}
          <button aria-label="Biển sau" onClick={() => go(1)} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
