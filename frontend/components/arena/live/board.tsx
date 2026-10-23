'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Camera, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui'
import type { Board3DHandle, CameraMode } from './board-3d'
import { BASES, BOARD_THEMES, PIECE_ICON, useBoardTheme, type BoardTheme } from './board-themes'

const Board3D = dynamic(() => import('./board-3d'), {
  ssr: false,
  loading: () => <div className="grid aspect-[4/3] min-h-[320px] w-full place-items-center rounded-2xl border border-border bg-muted/40 text-sm text-muted-foreground">Đang dựng sân đấu 3D…</div>,
})

type Cell = [number, number]
type Marker = { icon: string; label: string }

function asCells(list: any): Cell[] {
  const out: Cell[] = []
  const walk = (v: any) => {
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') out.push([v[0], v[1]])
    else if (Array.isArray(v)) v.forEach(walk)
  }
  walk(list)
  return out
}

const CLASH_ICON: Record<string, string> = { CLASH: '💥', GOAL: '🏁', WARP: '🌀', TRAP: '☠️', EVOLVE: '✨' }

/** Bàn cờ 2D: ô theo theme, quân huy hiệu phát sáng, vệt đường đi, va chạm và quân bị diệt có hoạt ảnh. */
export function Board({ step, prev, theme }: { step: any; prev?: any; theme: BoardTheme }) {
  const model = useMemo(() => {
    const prevById = new Map<string, any>()
    for (const p of [...(prev?.red_pieces || []), ...(prev?.blue_pieces || [])]) prevById.set(p.id, p)
    const pieces = new Map<string, { piece: any; side: 'red' | 'blue'; moved: boolean }>()
    const trails = new Map<string, 'red' | 'blue'>()
    const ghosts: { key: string; side: 'red' | 'blue'; piece: any }[] = []
    const add = (list: any[] | undefined, side: 'red' | 'blue') => {
      for (const piece of list || []) {
        const before = prevById.get(piece.id)
        if (piece.alive === false) {
          if (before && before.alive !== false) ghosts.push({ key: `${before.row}:${before.col}`, side, piece: before })
          continue
        }
        const moved = !!before && (before.row !== piece.row || before.col !== piece.col)
        if (moved) trails.set(`${before.row}:${before.col}`, side)
        pieces.set(`${piece.row}:${piece.col}`, { piece, side, moved })
      }
    }
    add(step?.red_pieces, 'red')
    add(step?.blue_pieces, 'blue')
    const mystery = step?.mystery_tiles || {}
    const markers = new Map<string, Marker>()
    asCells(mystery.evolve).forEach(([c, r]) => markers.set(`${r}:${c}`, { icon: '✨', label: 'Ô tiến hóa' }))
    asCells(mystery.portals).forEach(([c, r]) => markers.set(`${r}:${c}`, { icon: '🌀', label: 'Cổng dịch chuyển' }))
    asCells(mystery.traps).forEach(([c, r]) => markers.set(`${r}:${c}`, { icon: '☠️', label: 'Bẫy' }))
    const obstacles = new Set(asCells(step?.obstacles || mystery.obstacles).map(([c, r]) => `${r}:${c}`))
    const clash = step?.clash_event
    const clashKey = clash && typeof clash.col === 'number' ? `${clash.row}:${clash.col}` : null
    return { pieces, trails, ghosts, markers, obstacles, clash, clashKey }
  }, [step, prev])

  const vars = {
    '--cell-a': theme.cellA, '--cell-b': theme.cellB, '--c-red': theme.red, '--c-blue': theme.blue, '--c-accent': theme.accent,
  } as CSSProperties

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl p-2 shadow-2xl" style={{ ...vars, background: `linear-gradient(145deg, ${theme.frame}, ${theme.backdrop})`, boxShadow: `0 0 0 1px ${theme.frame}, 0 16px 40px -12px ${theme.frame}88` }}>
        <div className="grid grid-cols-9 overflow-hidden rounded-xl" role="grid" aria-label="Bàn cờ 9×9">
          {Array.from({ length: 81 }, (_, index) => {
            const row = Math.floor(index / 9)
            const col = index % 9
            const key = `${row}:${col}`
            const entry = model.pieces.get(key)
            const marker = model.markers.get(key)
            const redHome = row === BASES.red.row && col === BASES.red.col
            const blueHome = row === BASES.blue.row && col === BASES.blue.col
            const wall = model.obstacles.has(key)
            const trail = model.trails.get(key)
            const ghost = model.ghosts.find((g) => g.key === key)
            const info = entry?.piece.type ? PIECE_ICON[entry.piece.type] : undefined
            const color = entry?.side === 'red' ? theme.red : theme.blue
            return (
              <div
                key={key}
                role="gridcell"
                title={entry ? `${entry.side === 'red' ? 'Đỏ' : 'Xanh'} · ${info?.label ?? 'Ẩn'} (${row}, ${col})` : marker ? `${marker.label} (${row}, ${col})` : `(${row}, ${col})`}
                className="relative flex aspect-square items-center justify-center"
                style={{ background: (row + col) % 2 ? theme.cellB : theme.cellA }}
              >
                {(redHome || blueHome) && (
                  <span className="absolute inset-0 flex items-center justify-center text-[clamp(10px,2.2vw,16px)] opacity-70" style={{ background: `radial-gradient(circle, ${redHome ? theme.baseRed : theme.baseBlue}66, transparent 72%)` }} aria-label={redHome ? 'Cứ điểm Đỏ' : 'Cứ điểm Xanh'}>🏰</span>
                )}
                {wall && <span className="absolute inset-[8%] rounded-md" style={{ background: `repeating-linear-gradient(45deg, ${theme.obstacle}, ${theme.obstacle} 4px, ${theme.frame} 4px, ${theme.frame} 8px)` }} aria-label="Chướng ngại vật" />}
                {marker && !entry && <span className="absolute text-[clamp(10px,2.3vw,17px)] opacity-80" aria-label={marker.label}>{marker.icon}</span>}
                {trail && <span className="absolute size-[26%] rounded-full opacity-40" style={{ background: trail === 'red' ? theme.red : theme.blue, animation: 'trail-fade 1.4s ease-out forwards' }} aria-hidden />}
                {ghost && (
                  <span className="absolute inset-[10%] flex items-center justify-center rounded-full text-[clamp(10px,2.4vw,17px)] grayscale" style={{ background: ghost.side === 'red' ? theme.red : theme.blue, animation: 'ghost-out .9s ease-out forwards' }} aria-hidden>
                    {PIECE_ICON[ghost.piece.type]?.icon ?? '❔'}
                  </span>
                )}
                {entry && (
                  <span
                    className={cn('absolute inset-[9%] flex items-center justify-center rounded-full text-[clamp(11px,2.6vw,19px)] leading-none text-white', entry.moved && 'piece-pop')}
                    style={{
                      background: `radial-gradient(circle at 32% 28%, ${color}ff, ${color}bb 55%, ${color}77)`,
                      boxShadow: `0 0 0 2px ${color}, 0 0 14px 2px ${color}99, inset 0 -3px 5px #0006`,
                    }}
                    aria-label={`${entry.side === 'red' ? 'Đỏ' : 'Xanh'} ${info?.label ?? 'quân ẩn'}`}
                  >
                    <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">{info?.icon ?? '❔'}</span>
                  </span>
                )}
                {model.clashKey === key && model.clash && (
                  <>
                    <span className="clash-ring pointer-events-none absolute inset-[-30%] rounded-full border-2" style={{ borderColor: theme.accent }} aria-hidden />
                    <span className="clash-icon pointer-events-none absolute z-10 text-[clamp(16px,4vw,30px)]" aria-label={`Va chạm: ${model.clash.type}`}>{CLASH_ICON[model.clash.type] ?? '💥'}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ThemePicker({ theme, onChange }: { theme: BoardTheme; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Giao diện bàn cờ">
      {BOARD_THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={t.id === theme.id}
          title={t.label}
          aria-label={t.label}
          onClick={() => onChange(t.id)}
          className={cn('size-6 rounded-full border-2 transition-transform hover:scale-110', t.id === theme.id ? 'border-primary scale-110 shadow-[0_0_10px_var(--primary)]' : 'border-border')}
          style={{ background: `conic-gradient(${t.cellA} 0 25%, ${t.red} 0 50%, ${t.blue} 0 75%, ${t.cellB} 0)` }}
        />
      ))}
    </div>
  )
}

/** Trình phát các bước của một hiệp (replay, hiệp mới nhất, đấu thử boss). */
export function BoardPlayer({ steps, autoPlay = false, redName = 'Đội Đỏ', blueName = 'Đội Xanh' }: {
  steps: any[]; autoPlay?: boolean; redName?: string; blueName?: string
}) {
  const [theme, setTheme] = useBoardTheme()
  const [index, setIndex] = useState(Math.max(0, steps.length - 1))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [cam, setCam] = useState<CameraMode>('cinematic')
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [notice, setNotice] = useState('')
  const stage = useRef<Board3DHandle>(null)
  const lastAt = useRef(0)

  useEffect(() => {
    setIndex(autoPlay ? 0 : Math.max(0, steps.length - 1))
    setPlaying(autoPlay && steps.length > 1)
  }, [steps, autoPlay])

  useEffect(() => {
    if (!playing) return
    if (index >= steps.length - 1) { setPlaying(false); return }
    const timer = window.setTimeout(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), 650 / speed)
    return () => window.clearTimeout(timer)
  }, [playing, index, steps.length, speed])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setQuality('low')
  }, [])

  if (!steps.length) return <p className="text-sm text-muted-foreground">Chưa có dữ liệu bàn cờ.</p>
  const at = Math.min(index, steps.length - 1)
  const animate = at - lastAt.current === 1
  lastAt.current = at
  const step = steps[at]
  const prev = at > 0 ? steps[at - 1] : undefined
  const red = (step.red_pieces || []).filter((p: any) => p.alive !== false).length
  const blue = (step.blue_pieces || []).filter((p: any) => p.alive !== false).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5" role="group" aria-label="Chế độ xem">
            {(['2d', '3d'] as const).map((v) => (
              <button key={v} onClick={() => { setView(v); setNotice('') }} aria-pressed={view === v} className={cn('rounded-md px-3 py-1 text-xs font-extrabold transition-colors', view === v ? 'bg-brand text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>{v === '2d' ? '2D' : '3D 🎬'}</button>
            ))}
          </div>
          <ThemePicker theme={theme} onChange={setTheme} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {view === '3d' && (
            <>
              <select value={cam} onChange={(e) => setCam(e.target.value as CameraMode)} className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground" aria-label="Chế độ camera">
                <option value="cinematic">🎥 Điện ảnh</option><option value="free">🖱️ Tự do</option><option value="top">⬇️ Trên xuống</option>
              </select>
              <select value={quality} onChange={(e) => setQuality(e.target.value as 'high' | 'low')} className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground" aria-label="Chất lượng 3D">
                <option value="high">Chất lượng cao</option><option value="low">Tiết kiệm</option>
              </select>
              <Button size="sm" variant="secondary" aria-label="Chụp ảnh khung hình" onClick={() => {
                const url = stage.current?.capture()
                if (!url) return
                const a = document.createElement('a'); a.href = url; a.download = `arena-${Date.now()}.png`; a.click()
              }}><Camera className="size-3.5" /></Button>
            </>
          )}
          <label className="flex items-center gap-2">Tốc độ
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground" aria-label="Tốc độ phát">
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select>
          </label>
        </div>
      </div>
      {notice && <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{notice}</p>}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-bold" style={{ color: theme.red }}>● {redName}: {red} quân</span>
        <span className="min-w-0 truncate text-right font-bold" style={{ color: theme.blue }}>{blueName}: {blue} quân ●</span>
      </div>
      {view === '3d' ? (
        <Board3D handleRef={stage} step={step} prev={prev} animate={animate && playing} theme={theme} camera={cam} quality={quality}
          onUnsupported={() => { setView('2d'); setNotice('Thiết bị hoặc trình duyệt không hỗ trợ WebGL nên đã chuyển về bàn cờ 2D.') }} />
      ) : <Board step={step} prev={prev} theme={theme} />}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" aria-label="Bước đầu" onClick={() => { setPlaying(false); setIndex(0) }}><SkipBack className="size-4" /></Button>
        <Button size="sm" aria-label={playing ? 'Tạm dừng' : 'Phát'} onClick={() => { if (index >= steps.length - 1) setIndex(0); setPlaying((p) => !p) }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
        <Button size="sm" variant="secondary" aria-label="Bước cuối" onClick={() => { setPlaying(false); setIndex(steps.length - 1) }}><SkipForward className="size-4" /></Button>
        <input type="range" min={0} max={steps.length - 1} value={at} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }} className="min-w-0 flex-1 accent-primary" aria-label="Chọn bước" />
        <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{at + 1}/{steps.length}</span>
      </div>
      {(step.turn_label || step.log) && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {step.turn_label && <strong className="mr-2 text-foreground">{step.turn_label}</strong>}{step.log}
        </p>
      )}
    </div>
  )
}
