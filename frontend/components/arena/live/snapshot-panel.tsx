'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraOff, Images, Maximize2, Pause, Play, Video } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { useReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Button, EmptyState, Skeleton } from './ui'

type Shot = { side: 'team_a' | 'team_b'; at: number; file: string }
type Clip = { side: 'team_a' | 'team_b'; file: string; bytes?: number }

/**
 * Tải trước toàn bộ ảnh của hiệp (nhỏ, vài chục KB mỗi ảnh) vào bộ nhớ dưới dạng blob URL để đổi ảnh tức thì, không chờ mạng
 * lúc phát. Chỉ thu hồi khi rời màn hình/đổi hiệp nên ảnh đang hiện không bao giờ bị mất giữa chừng.
 */
function useShotCache(tournamentId: string, matchId: string, items: Shot[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const made = useRef<string[]>([])
  useEffect(() => {
    let live = true
    const queue = items.map((s) => s.file)
    const run = async () => {
      while (live && queue.length) {
        const file = queue.shift()!
        try {
          const url = await arenaApi.snapshotUrl(tournamentId, matchId, file)
          if (!live) { URL.revokeObjectURL(url); return }
          made.current.push(url)
          setUrls((old) => ({ ...old, [file]: url }))
        } catch { /* ảnh lỗi thì bỏ qua, khung hiện ảnh gần nhất đã có */ }
      }
    }
    void Promise.all([run(), run(), run()])
    return () => { live = false }
  }, [tournamentId, matchId, items])
  useEffect(() => () => { made.current.forEach((u) => URL.revokeObjectURL(u)); made.current = [] }, [tournamentId, matchId])
  return urls
}

/** Hai lớp ảnh chồng nhau: ảnh mới mờ dần hiện lên trên ảnh cũ nên không bao giờ nháy hay hụt khung. */
function Frame({ url, shot, label, tone }: { url?: string; shot?: Shot; label: string; tone: 'red' | 'blue' }) {
  const [layers, setLayers] = useState<string[]>([])
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!url) return
    let live = true
    const img = new Image()
    img.src = url
    const show = () => { if (live) setLayers((old) => (old[old.length - 1] === url ? old : [...old.slice(-1), url])) }
    if (img.decode) img.decode().then(show, show); else img.onload = show
    return () => { live = false }
  }, [url])
  const top = layers[layers.length - 1]
  return (
    <figure className={cn('group relative aspect-video overflow-hidden rounded-xl bg-black/70 ring-2', tone === 'red' ? 'ring-red-500/60' : 'ring-blue-500/60')}>
      {layers.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt={i === layers.length - 1 ? `Ảnh camera ${label}` : ''} aria-hidden={i !== layers.length - 1} className={cn('absolute inset-0 size-full object-cover', i === layers.length - 1 && layers.length > 1 && !reduced && 'snap-fade')} />
      ))}
      {!top && <div className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-white/60"><CameraOff className="size-5" />{shot ? 'Đang tải ảnh…' : 'Chưa có ảnh ở thời điểm này'}</div>}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-6 text-xs font-semibold text-white">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1.5 tabular-nums opacity-80">{shot ? new Date(shot.at * 1000).toLocaleTimeString('vi-VN') : '—'}
          {top && <a href={top} target="_blank" rel="noreferrer" aria-label="Mở ảnh lớn" className="rounded p-0.5 hover:bg-white/20"><Maximize2 className="size-3.5" /></a>}
        </span>
      </figcaption>
    </figure>
  )
}

/** Hai ô video của hai đội phát đồng bộ theo một đồng hồ chung. */
function ClipDuo({ tournamentId, matchId, clips, redName, blueName }: { tournamentId: string; matchId: string; clips: Clip[]; redName: string; blueName: string }) {
  const a = clips.find((c) => c.side === 'team_a')
  const b = clips.find((c) => c.side === 'team_b')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const refs = { team_a: useRef<HTMLVideoElement>(null), team_b: useRef<HTMLVideoElement>(null) }
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    let live = true
    const made: string[] = []
    void (async () => {
      for (const c of [a, b]) {
        if (!c) continue
        try { const u = await arenaApi.clipUrl(tournamentId, matchId, c.file); made.push(u); if (live) setUrls((o) => ({ ...o, [c.side]: u })); else URL.revokeObjectURL(u) } catch { /* bỏ qua */ }
      }
    })()
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)) }
  }, [tournamentId, matchId, a?.file, b?.file]) // eslint-disable-line react-hooks/exhaustive-deps
  const each = (fn: (v: HTMLVideoElement) => void) => { for (const k of ['team_a', 'team_b'] as const) { const v = refs[k].current; if (v) fn(v) } }
  // WebM do MediaRecorder tạo ra thường báo thời lượng vô hạn: kéo tới cuối một lần để trình duyệt tính ra thời lượng thật.
  const onMeta = (v: HTMLVideoElement) => {
    if (Number.isFinite(v.duration)) { setDuration((d) => Math.max(d, v.duration)); return }
    const back = () => { v.removeEventListener('timeupdate', back); setDuration((d) => Math.max(d, v.duration)); v.currentTime = 0 }
    v.addEventListener('timeupdate', back)
    v.currentTime = 1e101
  }
  useEffect(() => {
    if (!playing) { each((v) => v.pause()); return }
    each((v) => { v.playbackRate = speed; void v.play().catch(() => setPlaying(false)) })
    let frame = 0
    const tick = () => {
      const lead = refs.team_a.current || refs.team_b.current
      if (lead) {
        setTime(lead.currentTime)
        const other = lead === refs.team_a.current ? refs.team_b.current : refs.team_a.current
        if (other && Math.abs(other.currentTime - lead.currentTime) > 0.3) other.currentTime = lead.currentTime // giữ hai ô khớp nhau
        if (lead.ended) setPlaying(false)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed]) // eslint-disable-line react-hooks/exhaustive-deps
  const seek = (t: number) => { setTime(t); each((v) => { v.currentTime = t }) }
  return (
    <div className="space-y-3" data-testid="clip-duo">
      <div className="grid grid-cols-2 gap-3">
        {([['team_a', redName, 'red', a], ['team_b', blueName, 'blue', b]] as const).map(([side, name, tone, c]) => (
          <figure key={side} className={cn('relative aspect-video overflow-hidden rounded-xl bg-black/70 ring-2', tone === 'red' ? 'ring-red-500/60' : 'ring-blue-500/60')}>
            {c && urls[side] ? <video ref={refs[side]} src={urls[side]} muted playsInline preload="auto" onLoadedMetadata={(e) => onMeta(e.currentTarget)} className="size-full object-cover" aria-label={`Video camera ${name}`} />
              : <div className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-white/60"><CameraOff className="size-5" />{c ? 'Đang tải video…' : 'Đội này không có video'}</div>}
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-6 text-xs font-semibold text-white">{name}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" aria-label={playing ? 'Tạm dừng' : 'Phát'} onClick={() => { if (duration && time >= duration - 0.2) seek(0); setPlaying((p) => !p) }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
        <input type="range" min={0} max={duration || 1} step={0.05} value={Math.min(time, duration || 1)} onChange={(e) => { setPlaying(false); seek(Number(e.target.value)) }} className="min-w-0 flex-1 accent-primary" aria-label="Tua video" />
        <span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">{time.toFixed(0)}s / {duration ? duration.toFixed(0) : '—'}s</span>
        <Button size="sm" variant="secondary" aria-label="Đổi tốc độ" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}>{speed}×</Button>
      </div>
    </div>
  )
}

/**
 * Camera lưu lại của một hiệp. Ưu tiên video ngắn do trình duyệt ghi (mượt); không có thì phát ảnh chụp định kỳ
 * theo THỜI GIAN THẬT với chuyển mờ giữa các ảnh (không còn nhảy theo số thứ tự ảnh).
 */
export function SnapshotPanel({ tournamentId, matchId, round, redName, blueName }: { tournamentId: string; matchId: string; round: number; redName: string; blueName: string }) {
  const shots = useResource(`snaps:${tournamentId}:${matchId}:${round}`, () => arenaApi.getSnapshots(tournamentId, matchId, round), { ttl: 30_000 })
  const clipRes = useResource(`clips:${tournamentId}:${matchId}:${round}`, () => arenaApi.getClips(tournamentId, matchId, round).catch(() => ({ items: [] as Clip[] })), { ttl: 30_000 })
  const items: Shot[] = useMemo(() => shots.data?.items || [], [shots.data])
  const clips: Clip[] = clipRes.data?.items || []
  const urls = useShotCache(tournamentId, matchId, items)
  const start = items.length ? Math.min(...items.map((s) => s.at)) : 0
  const end = items.length ? Math.max(...items.map((s) => s.at)) : 0
  const span = Math.max(0.001, end - start)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(4)
  const timeRef = useRef(0)
  useEffect(() => { setTime(0); timeRef.current = 0; setPlaying(false) }, [round, items.length])
  // Đồng hồ phát: tiến theo thời gian thật nhân tốc độ, vẽ lại mỗi khung hình; ảnh chỉ đổi khi tới mốc của ảnh kế tiếp.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      timeRef.current = Math.min(span, timeRef.current + dt * speed)
      setTime(timeRef.current)
      if (timeRef.current >= span) { setPlaying(false); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, span])
  const clock = start + time
  const latest = (side: Shot['side']) => [...items].filter((s) => s.side === side && s.at <= clock + 1e-6).pop() || items.find((s) => s.side === side)
  const sa = latest('team_a')
  const sb = latest('team_b')
  const gap = items.length > 1 ? span / (items.length - 1) : 0

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4" aria-label="Camera lưu lại của hiệp">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">{clips.length ? <Video className="size-4 text-primary" /> : <Images className="size-4 text-primary" />}Camera lưu lại · Hiệp {round}</h3>
        <span className="text-[11px] text-muted-foreground">{clips.length ? 'Video' : items.length ? `${items.length} ảnh · ${Math.round(span)} giây` : ''}</span>
      </div>
      {(shots.loading && clipRes.loading) ? <div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-video rounded-xl" /><Skeleton className="aspect-video rounded-xl" /></div>
        : clips.length ? <ClipDuo tournamentId={tournamentId} matchId={matchId} clips={clips} redName={redName} blueName={blueName} />
        : shots.error ? <p className="text-xs text-muted-foreground">{shots.error.message}</p>
        : !items.length ? <EmptyState icon={<CameraOff className="size-6" />} title="Không có hình camera cho hiệp này" hint="Hình chỉ được lưu khi đội bật camera trong phòng trận lúc đang đấu." />
        : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3" data-testid="snap-frames">
              <Frame url={sa && urls[sa.file]} shot={sa} label={redName} tone="red" />
              <Frame url={sb && urls[sb.file]} shot={sb} label={blueName} tone="blue" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" aria-label={playing ? 'Tạm dừng' : 'Phát lại'} onClick={() => { if (timeRef.current >= span) { timeRef.current = 0; setTime(0) } setPlaying((p) => !p) }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
              <input type="range" min={0} max={span} step={0.05} value={Math.min(time, span)} onChange={(e) => { setPlaying(false); timeRef.current = Number(e.target.value); setTime(timeRef.current) }} className="min-w-0 flex-1 accent-primary" aria-label="Tua theo thời gian" />
              <span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">{time.toFixed(0)}s / {Math.round(span)}s</span>
              <Button size="sm" variant="secondary" aria-label="Đổi tốc độ" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : s === 4 ? 8 : 1))}>{speed}×</Button>
            </div>
          </div>
        )}
      <p className="mt-2 text-[11px] text-muted-foreground">{clips.length
        ? 'Video ngắn ghi trong lúc đấu khi đội bật camera (không ghi âm), lưu 30 ngày; chỉ ban tổ chức và hai đội của trận xem được.'
        : `Ảnh chụp tự động${gap ? ` khoảng ${Math.round(gap)} giây/lần` : ''} khi đội bật camera, lưu 30 ngày; chỉ ban tổ chức và hai đội của trận xem được.`}</p>
    </section>
  )
}
