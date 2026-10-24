'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Camera, Crosshair, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui'
import type { Board3DHandle, CameraMode } from './board-3d'
import { BASES, BOARD_THEMES, PIECE_ICON, useBoardTheme, type BoardTheme } from './board-themes'
import { asCells, findPiece, highlightFor, NO_HIGHLIGHT, type Highlight } from './board-logic'

const Board3D = dynamic(() => import('./board-3d'), {
  ssr: false,
  loading: () => <div className="grid aspect-[4/3] min-h-[320px] w-full place-items-center rounded-2xl border border-border bg-muted/40 text-sm text-muted-foreground">Đang dựng sân đấu 3D…</div>,
})

type Marker = { icon: string; label: string }

const CLASH_ICON: Record<string, string> = { CLASH: '💥', GOAL: '🏁', WARP: '🌀', TRAP: '☠️', EVOLVE: '✨' }

const BOARD_WIDTH = { md: 'max-w-[520px]', lg: 'max-w-[680px]', xl: 'max-w-[760px]' } as const
export type BoardSize = keyof typeof BOARD_WIDTH

/** Bàn cờ 2D: ô vát có toạ độ, quân huy hiệu kim loại, đá chướng ngại, vệt đường đi; bấm quân để xem nước đi. */
export function Board({ step, prev, theme, size = 'md', selectedId = null, highlight = NO_HIGHLIGHT, onSelect }: {
  step: any; prev?: any; theme: BoardTheme; size?: BoardSize
  selectedId?: string | null; highlight?: Highlight; onSelect?: (id: string | null) => void
}) {
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

  const hints = useMemo(() => {
    const moves = new Set(highlight.moves.map(([c, r]) => `${r}:${c}`))
    const attacks = new Set(highlight.attacks.map(([c, r]) => `${r}:${c}`))
    const path = new Map(highlight.path.slice(0, -1).map(([c, r], i) => [`${r}:${c}`, i + 1]))
    return { moves, attacks, path }
  }, [highlight])
  const selectedSide = findPiece(step, selectedId)?.side

  const vars = { '--cell-a': theme.cellA, '--cell-b': theme.cellB, '--c-red': theme.red, '--c-blue': theme.blue, '--c-accent': theme.accent } as CSSProperties
  const label = 'pointer-events-none absolute select-none font-mono text-[clamp(7px,1.3vw,10px)] font-bold leading-none opacity-55'

  return (
    <div className={cn('mx-auto w-full', BOARD_WIDTH[size])}>
      <div className="rounded-2xl p-2.5 shadow-2xl" style={{ ...vars, background: `linear-gradient(145deg, ${theme.frame}, ${theme.backdrop} 70%, ${theme.frame})`, boxShadow: `0 0 0 1px ${theme.frame}, inset 0 1px 0 #ffffff33, 0 18px 44px -14px ${theme.frame}aa` }}>
        <div className="rounded-xl p-[3px]" style={{ background: 'linear-gradient(135deg,#f3d58a,#b8862f 45%,#f3d58a)' }}>
          <div className="grid grid-cols-9 gap-px overflow-hidden rounded-[10px]" style={{ background: theme.backdrop }} role="grid" aria-label="Bàn cờ 9×9">
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
              const base = (row + col) % 2 ? theme.cellB : theme.cellA
              const chosen = !!entry && entry.piece.id === selectedId
              const step = hints.path.get(key)
              const trailColor = selectedSide === 'blue' ? theme.blue : theme.red
              return (
                <div
                  key={key}
                  role="gridcell"
                  title={entry ? `${entry.side === 'red' ? 'Đỏ' : 'Xanh'} · ${info?.label ?? 'Ẩn'} [${col},${row}]` : wall ? `Chướng ngại [${col},${row}]` : marker ? `${marker.label} [${col},${row}]` : `[${col},${row}]`}
                  onClick={() => onSelect?.(entry && !chosen ? entry.piece.id : null)}
                  className={cn('relative flex aspect-square items-center justify-center', onSelect && 'cursor-pointer')}
                  style={{ background: `linear-gradient(145deg, ${base} 0%, ${base} 60%, color-mix(in srgb, ${base} 82%, #000) 100%)`, boxShadow: 'inset 1px 1px 0 #ffffff22, inset -1px -1px 0 #00000033' }}
                >
                  {row === 8 && <span className={cn(label, 'bottom-[6%] right-[8%]')} style={{ color: theme.accent }}>{col}</span>}
                  {col === 0 && <span className={cn(label, 'left-[8%] top-[6%]')} style={{ color: theme.accent }}>{row}</span>}
                  {(redHome || blueHome) && (
                    <span className="absolute inset-0 flex items-center justify-center text-[clamp(10px,2.2vw,16px)]" style={{ background: `radial-gradient(circle, ${redHome ? theme.baseRed : theme.baseBlue}88, transparent 72%)`, boxShadow: `inset 0 0 0 2px ${redHome ? theme.baseRed : theme.baseBlue}aa` }} aria-label={redHome ? 'Cứ điểm Đỏ' : 'Cứ điểm Xanh'}>🏰</span>
                  )}
                  {wall && (
                    <span className="absolute inset-[10%] flex items-center justify-center rounded-[30%] text-[clamp(10px,2.4vw,18px)]" aria-label="Chướng ngại vật"
                      style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${theme.obstacle} 55%, #fff), ${theme.obstacle} 55%, color-mix(in srgb, ${theme.obstacle} 60%, #000))`, boxShadow: '0 3px 6px #0008, inset 0 -3px 4px #0006, inset 0 2px 2px #ffffff44' }}>🪨</span>
                  )}
                  {marker && !entry && <span className="absolute text-[clamp(10px,2.3vw,17px)] opacity-85" aria-label={marker.label}>{marker.icon}</span>}
                  {trail && <span className="absolute size-[26%] rounded-full opacity-40" style={{ background: trail === 'red' ? theme.red : theme.blue, animation: 'trail-fade 1.4s ease-out forwards' }} aria-hidden />}
                  {hints.moves.has(key) && <span className="absolute inset-[30%] rounded-full bg-emerald-400/70 shadow-[0_0_10px_#34d399]" aria-label="Ô có thể đi" />}
                  {hints.attacks.has(key) && <span className="absolute inset-[3%] z-10 rounded-full border-[3px] border-red-400 shadow-[0_0_12px_#f87171]" aria-label="Có thể tấn công" />}
                  {step !== undefined && !entry && <span className="absolute flex size-[34%] items-center justify-center rounded-full font-mono text-[clamp(6px,1.2vw,9px)] font-bold text-white" style={{ background: `${trailColor}cc` }} aria-hidden>{step}</span>}
                  {ghost && (
                    <span className="absolute inset-[10%] flex items-center justify-center rounded-full text-[clamp(10px,2.4vw,17px)] grayscale" style={{ background: ghost.side === 'red' ? theme.red : theme.blue, animation: 'ghost-out .9s ease-out forwards' }} aria-hidden>
                      {PIECE_ICON[ghost.piece.type]?.icon ?? '❔'}
                    </span>
                  )}
                  {entry && (
                    <span
                      className={cn('absolute inset-[7%] flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-110', entry.moved && 'piece-pop', chosen && 'scale-110')}
                      style={{
                        background: `conic-gradient(from 200deg, #f3d58a, #9a6b1f, #f3d58a, #b8862f, #f3d58a)`,
                        boxShadow: chosen ? `0 0 0 3px ${theme.accent}, 0 0 18px 4px ${theme.accent}` : `0 3px 6px #0009, 0 0 12px 1px ${color}88`,
                      }}
                      aria-label={`${entry.side === 'red' ? 'Đỏ' : 'Xanh'} ${info?.label ?? 'quân ẩn'}`}
                    >
                      <span className="absolute inset-[9%] flex items-center justify-center rounded-full text-[clamp(10px,2.4vw,18px)] leading-none"
                        style={{ background: `radial-gradient(circle at 34% 28%, color-mix(in srgb, ${color} 55%, #fff), ${color} 50%, color-mix(in srgb, ${color} 65%, #000))`, boxShadow: 'inset 0 -3px 5px #0007, inset 0 2px 3px #ffffff66' }}>
                        <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,.7)]">{info?.icon ?? '❔'}</span>
                      </span>
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

/** Thẻ thông tin quân đang chọn: loại, phe, toạ độ, số nước đã đi, lựa chọn ở lượt sau. */
function PieceCard({ step, id, highlight, theme, redName, blueName, follow, onFollow, onClose, show3d }: {
  step: any; id: string; highlight: Highlight; theme: BoardTheme; redName: string; blueName: string
  follow: boolean; onFollow: (v: boolean) => void; onClose: () => void; show3d: boolean
}) {
  const piece = findPiece(step, id)
  if (!piece) return null
  const info = PIECE_ICON[piece.type]
  const color = piece.side === 'red' ? theme.red : theme.blue
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ borderColor: color }} role="status" aria-label="Thông tin quân đang chọn">
      <span className="grid size-9 place-items-center rounded-full text-lg" style={{ background: color }}>{info?.icon ?? '❔'}</span>
      <div className="min-w-0">
        <p className="font-bold">{info?.label ?? 'Quân ẩn'} · <span style={{ color }}>{piece.side === 'red' ? redName : blueName}</span></p>
        <p className="text-muted-foreground">
          Ô [{piece.col},{piece.row}] · {piece.alive ? `${Math.max(0, highlight.path.length - 1)} nước đã đi` : 'đã bị loại'}
          {piece.alive && <> · <span className="text-emerald-500">{highlight.moves.length} ô đi được</span> · <span className="text-red-500">{highlight.attacks.length} mục tiêu</span></>}
          {piece.steps_left !== undefined && <> · còn {piece.steps_left} bước</>}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {show3d && <Button size="sm" variant={follow ? 'primary' : 'secondary'} aria-pressed={follow} onClick={() => onFollow(!follow)}><Crosshair className="size-3.5" />{follow ? 'Đang theo dõi' : 'Theo dõi quân'}</Button>}
        <Button size="sm" variant="ghost" aria-label="Bỏ chọn quân" onClick={onClose}><X className="size-3.5" /></Button>
      </div>
    </div>
  )
}

/** Trình phát các bước của một hiệp (replay, hiệp mới nhất, đấu thử boss). */
export function BoardPlayer({ steps, autoPlay = false, redName = 'Đội Đỏ', blueName = 'Đội Xanh', size = 'md' }: {
  steps: any[]; autoPlay?: boolean; redName?: string; blueName?: string; size?: BoardSize
}) {
  const [theme, setTheme] = useBoardTheme()
  const [index, setIndex] = useState(Math.max(0, steps.length - 1))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [cam, setCam] = useState<CameraMode>('cinematic')
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const stage = useRef<Board3DHandle>(null)
  const lastAt = useRef(0)

  useEffect(() => {
    setIndex(autoPlay ? 0 : Math.max(0, steps.length - 1))
    setPlaying(autoPlay && steps.length > 1)
    setSelected(null)
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

  const at = Math.min(index, Math.max(0, steps.length - 1))
  const step = steps[at]
  const highlight = useMemo(() => (selected && step ? highlightFor(step, steps.slice(0, at + 1), selected) : NO_HIGHLIGHT), [selected, step, steps, at])

  if (!steps.length) return <p className="text-sm text-muted-foreground">Chưa có dữ liệu bàn cờ.</p>
  const animate = at - lastAt.current === 1
  lastAt.current = at
  const prev = at > 0 ? steps[at - 1] : undefined
  const red = (step.red_pieces || []).filter((p: any) => p.alive !== false).length
  const blue = (step.blue_pieces || []).filter((p: any) => p.alive !== false).length
  const choose = (id: string | null) => { setSelected(id); if (!id) setFollow(false) }

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
        <span className="hidden text-[11px] text-muted-foreground sm:inline">Bấm vào quân để xem nước đi</span>
        <span className="min-w-0 truncate text-right font-bold" style={{ color: theme.blue }}>{blueName}: {blue} quân ●</span>
      </div>
      {view === '3d' ? (
        <Board3D handleRef={stage} step={step} prev={prev} animate={animate && playing} theme={theme} camera={cam} quality={quality}
          selectedId={selected} highlight={highlight} follow={follow} onSelect={choose}
          onUnsupported={() => { setView('2d'); setNotice('Thiết bị hoặc trình duyệt không hỗ trợ WebGL nên đã chuyển về bàn cờ 2D.') }} />
      ) : <Board step={step} prev={prev} theme={theme} size={size} selectedId={selected} highlight={highlight} onSelect={choose} />}
      {selected && <PieceCard step={step} id={selected} highlight={highlight} theme={theme} redName={redName} blueName={blueName} follow={follow} onFollow={setFollow} onClose={() => choose(null)} show3d={view === '3d'} />}
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
