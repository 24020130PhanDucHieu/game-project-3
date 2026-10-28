'use client'

import { useEffect, useMemo, useState } from 'react'

import { countdown } from '@/lib/format'

import { useLive } from './context'
import { useNow } from './shared'
import { useReducedMotion } from '@/lib/motion'
import { useFx } from '@/lib/fx'

import { HologramStage } from './hologram-stage'


type Slide = { key: string; eyebrow: string; title: string; lines: string[]; variant: number; onClick?: () => void; live?: boolean }

const STATUS: Record<string, string> = { RUNNING: 'Đang diễn ra', FINISHED: 'Đã kết thúc', CONFIGURING: 'Sắp khởi tranh', READY: 'Sẵn sàng' }

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
  return <HologramStage slide={active} index={index} count={n} go={go} onPause={setHover} effectsEnabled={fx === 'full' && !reduced} />
}
