'use client'

import { useEffect, useMemo, useState } from 'react'
import { CameraOff, ChevronLeft, ChevronRight, Images, Maximize2, Pause, Play } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { Button, EmptyState, Skeleton } from './ui'

type Shot = { side: 'team_a' | 'team_b'; at: number; file: string }

function useShotUrl(tournamentId: string, matchId: string, shot?: Shot) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!shot) { setUrl(null); return }
    let live = true
    let made = ''
    arenaApi.snapshotUrl(tournamentId, matchId, shot.file).then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u) }).catch(() => live && setUrl(null))
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [tournamentId, matchId, shot?.file])
  return url
}

function Frame({ tournamentId, matchId, shot, label, tone }: { tournamentId: string; matchId: string; shot?: Shot; label: string; tone: 'red' | 'blue' }) {
  const url = useShotUrl(tournamentId, matchId, shot)
  return (
    <figure className={cn('group relative aspect-video overflow-hidden rounded-xl bg-black/70 ring-2', tone === 'red' ? 'ring-red-500/60' : 'ring-blue-500/60')}>
      {url ? <img src={url} alt={`Ảnh camera ${label}`} className="size-full object-cover" />
        : <div className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-white/60"><CameraOff className="size-5" />{shot ? 'Đang tải ảnh…' : 'Không có ảnh'}</div>}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-6 text-xs font-semibold text-white">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1.5 tabular-nums opacity-80">{shot ? new Date(shot.at * 1000).toLocaleTimeString('vi-VN') : '—'}
          {url && <a href={url} target="_blank" rel="noreferrer" aria-label="Mở ảnh lớn" className="rounded p-0.5 hover:bg-white/20"><Maximize2 className="size-3.5" /></a>}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * Camera lưu lại của một hiệp: ảnh chụp định kỳ của hai đội trong lúc đấu (không phải camera trực tiếp).
 * Tua theo thời gian; mỗi thời điểm hiện ảnh gần nhất của từng đội.
 */
export function SnapshotPanel({ tournamentId, matchId, round, redName, blueName }: { tournamentId: string; matchId: string; round: number; redName: string; blueName: string }) {
  const shots = useResource(`snaps:${tournamentId}:${matchId}:${round}`, () => arenaApi.getSnapshots(tournamentId, matchId, round), { ttl: 30_000 })
  const items: Shot[] = shots.data?.items || []
  const times = useMemo(() => [...new Set(items.map((s) => s.at))].sort((a, b) => a - b), [items])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setIndex(0); setPlaying(false) }, [round, times.length])
  useEffect(() => {
    if (!playing) return
    if (index >= times.length - 1) { setPlaying(false); return }
    const timer = window.setTimeout(() => setIndex((i) => i + 1), 900)
    return () => window.clearTimeout(timer)
  }, [playing, index, times.length])

  const at = times[Math.min(index, Math.max(0, times.length - 1))]
  const latest = (side: Shot['side']) => [...items].filter((s) => s.side === side && s.at <= (at ?? Infinity)).pop() || items.find((s) => s.side === side)

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4" aria-label="Camera lưu lại của hiệp">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Images className="size-4 text-primary" />Camera lưu lại · Hiệp {round}</h3>
        <span className="text-[11px] text-muted-foreground">{items.length ? `${times.length} mốc ảnh` : ''}</span>
      </div>
      {shots.loading ? <div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-video rounded-xl" /><Skeleton className="aspect-video rounded-xl" /></div>
        : shots.error ? <p className="text-xs text-muted-foreground">{shots.error.message}</p>
        : !items.length ? <EmptyState icon={<CameraOff className="size-6" />} title="Không có ảnh camera cho hiệp này" hint="Ảnh chỉ được lưu khi đội bật camera trong phòng trận lúc đang đấu." />
        : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Frame tournamentId={tournamentId} matchId={matchId} shot={latest('team_a')} label={redName} tone="red" />
              <Frame tournamentId={tournamentId} matchId={matchId} shot={latest('team_b')} label={blueName} tone="blue" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" aria-label="Ảnh trước" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)) }}><ChevronLeft className="size-4" /></Button>
              <Button size="sm" aria-label={playing ? 'Tạm dừng' : 'Phát ảnh'} onClick={() => { if (index >= times.length - 1) setIndex(0); setPlaying((p) => !p) }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
              <Button size="sm" variant="secondary" aria-label="Ảnh sau" onClick={() => { setPlaying(false); setIndex((i) => Math.min(times.length - 1, i + 1)) }}><ChevronRight className="size-4" /></Button>
              <input type="range" min={0} max={Math.max(0, times.length - 1)} value={Math.min(index, Math.max(0, times.length - 1))} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }} className="min-w-0 flex-1 accent-primary" aria-label="Chọn mốc ảnh" />
              <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">{Math.min(index + 1, times.length)}/{times.length}</span>
            </div>
          </div>
        )}
      <p className="mt-2 text-[11px] text-muted-foreground">Ảnh chụp tự động 10 giây/lần khi đội bật camera; chỉ ban tổ chức và hai đội của trận xem được.</p>
    </section>
  )
}
