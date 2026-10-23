'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { Maximize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { countdown, decodeRule, shortTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, Badge } from '../ui'
import { useLive } from '../context'
import { MatchCard, useNow, useRanking, winnerSide } from '../shared'
import { BOARD_THEMES } from '../board-themes'

const Board3D = dynamic(() => import('../board-3d'), { ssr: false })

const SLIDE_MS = 20_000
type Slide = 'bracket' | 'live' | 'top' | 'clock'
const SLIDES: { id: Slide; label: string }[] = [
  { id: 'bracket', label: 'Bảng đấu' },
  { id: 'live', label: 'Trận đang diễn ra' },
  { id: 'top', label: 'Bảng xếp hạng' },
  { id: 'clock', label: 'Lịch & thông báo' },
]

function BracketSlide({ tournament }: { tournament: any }) {
  const rounds = useMemo(() => {
    const groups = new Map<number, [string, any][]>()
    Object.entries(tournament?.matches || {}).forEach(([id, m]: [string, any]) => groups.set(Number(m.round_level) || 1, [...(groups.get(Number(m.round_level) || 1) || []), [id, m]]))
    return [...groups.entries()].sort((a, b) => a[0] - b[0])
  }, [tournament])
  return (
    <div className="flex h-full min-h-0 gap-6 overflow-x-auto px-2">
      {rounds.map(([level, list]) => (
        <div key={level} className="flex min-w-72 flex-1 flex-col">
          <p className="font-display mb-4 text-center text-2xl font-black text-primary">{list[0][1].round_name}</p>
          <div className="flex flex-1 flex-col justify-around gap-4">{list.map(([id, m]) => <div key={id} className="origin-center scale-[1.08]"><MatchCard id={id} match={m} /></div>)}</div>
        </div>
      ))}
    </div>
  )
}

function LiveSlide({ tournament }: { tournament: any }) {
  const pick = useMemo(() => {
    const all = Object.entries(tournament?.matches || {}) as [string, any][]
    return all.find(([, m]) => m.status === 'IN_PROGRESS' && m.rounds_history?.length) ?? all.filter(([, m]) => m.rounds_history?.length).sort((a, b) => (b[1].rounds_history.at(-1)?.timestamp || 0) - (a[1].rounds_history.at(-1)?.timestamp || 0))[0]
  }, [tournament])
  const steps: any[] = pick?.[1]?.rounds_history?.at(-1)?.board_steps || []
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [pick?.[0], steps.length])
  useEffect(() => {
    if (!steps.length) return
    const t = window.setTimeout(() => setI((x) => (x + 1 >= steps.length ? 0 : x + 1)), i + 1 >= steps.length ? 3000 : 700)
    return () => window.clearTimeout(t)
  }, [i, steps.length])
  if (!pick) return <p className="text-center text-3xl text-muted-foreground">Chưa có trận nào diễn ra.</p>
  const m = pick[1]
  const won = winnerSide(m)
  const round = m.rounds_history.at(-1)
  return (
    <div className="grid h-full min-h-0 gap-8 lg:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col justify-center gap-6">
        <p className="font-display text-center text-2xl font-black uppercase tracking-[0.2em] text-primary">{m.title || m.round_name}</p>
        {(['team_a', 'team_b'] as const).map((side) => (
          <div key={side} className={cn('flex items-center gap-5 rounded-3xl border-2 p-5', side === 'team_a' ? 'border-red-500/50 bg-red-500/10' : 'border-blue-500/50 bg-blue-500/10', won === side && 'glow-gold')}>
            <Avatar name={m[side]?.team_name} size="xl" ring={won === side ? 'gold' : side === 'team_a' ? 'red' : 'blue'} />
            <span className="font-display min-w-0 flex-1 truncate text-4xl font-black">{m[side]?.team_name || 'Chờ đội'}</span>
            <span className="font-display text-7xl font-black tabular-nums">{m[side]?.rounds_won ?? 0}</span>
          </div>
        ))}
        <div className="flex flex-wrap justify-center gap-2">
          <Badge tone={m.status === 'COMPLETED' ? 'accent' : 'success'}>{m.status === 'COMPLETED' ? `🏆 ${m.winner_name}` : `Hiệp ${m.current_round_idx}/${m.max_rounds || 5}`}</Badge>
          {decodeRule(round?.stage_rule).active.map((r) => <Badge key={r} tone="accent">{r}</Badge>)}
        </div>
        {steps[i]?.log && <p className="rounded-2xl bg-card/70 px-5 py-3 text-center text-lg">{steps[i].log}</p>}
      </div>
      <div className="min-h-0">
        {steps.length ? <Board3D step={steps[i]} prev={i > 0 ? steps[i - 1] : undefined} animate={i > 0} theme={BOARD_THEMES[0]} camera="cinematic" quality="high" /> : null}
      </div>
    </div>
  )
}

function TopSlide() {
  const ranking = useRanking()
  const rows = (ranking.data || []).slice(0, 10)
  return (
    <div className="mx-auto grid h-full max-w-5xl content-center gap-3">
      {rows.length ? rows.map((r, i) => (
        <div key={r.student_id} className={cn('flex items-center gap-5 rounded-2xl border px-6 py-3', i === 0 ? 'glow-gold border-amber-400/60 bg-amber-400/10' : i < 3 ? 'border-primary/40 bg-primary/10' : 'border-border bg-card/70')}>
          <span className="font-display w-14 text-center text-4xl font-black text-muted-foreground">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
          <Avatar name={r.bot_name} size="lg" />
          <span className="font-display min-w-0 flex-1 truncate text-3xl font-extrabold">{r.bot_name}</span>
          <span className="text-xl text-muted-foreground tabular-nums">{r.wins}/{r.matches_played} trận</span>
          <span className="font-display gradient-text w-28 text-right text-4xl font-black tabular-nums">{r.elo_score}</span>
        </div>
      )) : <p className="text-center text-3xl text-muted-foreground">Chưa có dữ liệu xếp hạng.</p>}
    </div>
  )
}

function ClockSlide({ tournament }: { tournament: any }) {
  const now = useNow()
  const { qualifiers, notifications } = useLive()
  const clar = useResource('clar:stage', () => arenaApi.getClarifications({ page: 1 }), { ttl: 30_000, refreshMs: 30_000 })
  const windows = Object.entries(tournament?.stage_schedule || {}).map(([level, w]: [string, any]) => ({ level: Number(level), starts: Number(w.starts_at) * 1000, ends: Number(w.ends_at) * 1000 })).filter((w) => w.starts && w.ends).sort((a, b) => a.starts - b.starts)
  const open = windows.find((w) => now >= w.starts && now < w.ends)
  const next = windows.find((w) => w.starts > now)
  const name = (level: number) => (Object.values(tournament?.matches || {}).find((m: any) => m.round_level === level) as any)?.round_name || `Vòng ${level}`
  const q = qualifiers.data?.find((x) => x.status === 'OPEN')
  const big = open ? { label: `${name(open.level)} đóng sau`, ms: open.ends - now } : next ? { label: `${name(next.level)} bắt đầu sau`, ms: next.starts - now } : q ? { label: `${q.name} hết hạn nộp sau`, ms: Number(q.deadline) * 1000 - now } : null
  return (
    <div className="grid h-full gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card/60 p-8 text-center">
        {big && big.ms > 0 ? (
          <>
            <p className="text-3xl font-semibold text-muted-foreground">{big.label}</p>
            <p className="font-display gradient-text mt-4 text-[clamp(64px,10vw,160px)] font-black leading-none tabular-nums">{countdown(Math.floor(big.ms / 1000))}</p>
            <p className="mt-4 text-xl text-muted-foreground">Giờ máy chủ: {new Date(now).toLocaleTimeString('vi-VN', { hour12: false })}</p>
          </>
        ) : <p className="font-display text-6xl font-black tabular-nums">{new Date(now).toLocaleTimeString('vi-VN', { hour12: false })}</p>}
      </div>
      <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <p className="font-display text-2xl font-black">📣 Thông báo</p>
        {(notifications.data?.notifications || []).slice(0, 3).map((n) => <div key={n.id} className="rounded-2xl border border-border bg-card/70 p-4"><p className="text-xl font-bold">{n.title}</p><p className="text-lg text-muted-foreground">{n.message}</p></div>)}
        {(clar.data?.items || []).filter((c: any) => c.public).slice(0, 2).map((c: any) => <div key={c.id} className="rounded-2xl border-l-4 border-primary bg-primary/10 p-4"><p className="text-lg font-semibold">❓ {c.question}</p><p className="text-lg text-muted-foreground">💬 {c.answer}</p></div>)}
        {!notifications.data?.notifications.length && !clar.data?.items.length && <p className="text-xl text-muted-foreground">Chưa có thông báo.</p>}
        {windows.length > 0 && <p className="mt-auto text-base text-muted-foreground">Lịch: {windows.map((w) => `${name(w.level)} ${shortTime(w.starts / 1000)}–${shortTime(w.ends / 1000)}`).join(' · ')}</p>}
      </div>
    </div>
  )
}

/** Màn hình trình chiếu cho máy chiếu/TV tại sự kiện: tự luân phiên, chữ lớn, chỉ dữ liệu công khai. */
export function StageView({ onExit }: { onExit: () => void }) {
  const { tournament, tournaments, socketOpen } = useLive()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(() => Date.now())
  const [tick, setTick] = useState(Date.now())
  const t = tournament.data

  useEffect(() => { setStarted(Date.now()) }, [index])
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick(Date.now())
      if (!paused && Date.now() - started >= SLIDE_MS) setIndex((i) => (i + 1) % SLIDES.length)
    }, 250)
    return () => window.clearInterval(timer)
  }, [paused, started])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % SLIDES.length)
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key.toLowerCase() === 'f') void document.documentElement.requestFullscreen?.()
      else if (e.key === 'Escape' && !document.fullscreenElement) onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const slide = SLIDES[index]
  const progress = paused ? 0 : Math.min(100, ((tick - started) / SLIDE_MS) * 100)
  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background text-foreground">
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <header className="relative flex items-center gap-4 px-8 pt-6">
        <div className="font-display bg-brand glow flex size-14 items-center justify-center rounded-2xl text-lg font-black text-primary-foreground">K69</div>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-3xl font-black">{t?.name || tournaments.data?.[0]?.name || 'BOT K69 ARENA'}</p>
          <p className="text-lg text-muted-foreground">{slide.label}</p>
        </div>
        <Badge tone={socketOpen ? 'success' : 'warning'}>{socketOpen ? '● TRỰC TIẾP' : 'Đang kết nối lại'}</Badge>
        <div className="flex items-center gap-1 opacity-40 transition-opacity hover:opacity-100">
          <button aria-label="Trang trước" className="rounded-lg p-2 hover:bg-muted" onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}><SkipBack className="size-5" /></button>
          <button aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'} className="rounded-lg p-2 hover:bg-muted" onClick={() => setPaused((p) => !p)}>{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</button>
          <button aria-label="Trang sau" className="rounded-lg p-2 hover:bg-muted" onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}><SkipForward className="size-5" /></button>
          <button aria-label="Toàn màn hình" className="rounded-lg p-2 hover:bg-muted" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 className="size-5" /></button>
          <button aria-label="Thoát trình chiếu" className="rounded-lg p-2 hover:bg-muted" onClick={onExit}><X className="size-5" /></button>
        </div>
      </header>
      <main className="relative min-h-0 flex-1 px-8 py-6 animate-fade-up" key={slide.id}>
        {!t ? <p className="text-center text-3xl text-muted-foreground">Chưa có giải đấu.</p>
          : slide.id === 'bracket' ? <BracketSlide tournament={t} />
          : slide.id === 'live' ? <LiveSlide tournament={t} />
          : slide.id === 'top' ? <TopSlide />
          : <ClockSlide tournament={t} />}
      </main>
      <footer className="relative flex items-center gap-3 px-8 pb-5">
        {SLIDES.map((s, i) => (
          <button key={s.id} onClick={() => setIndex(i)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-label={s.label}>
            <span className="block h-full rounded-full bg-primary" style={{ width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }} />
          </button>
        ))}
        <span className="text-sm text-muted-foreground">← → chuyển · Space dừng · F toàn màn hình · Esc thoát</span>
      </footer>
    </div>
  )
}
