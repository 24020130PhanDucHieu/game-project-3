'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Camera, CameraOff, Eye, EyeOff, Lock, Maximize2, Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { type PeerInfo, type Remote, type RtcSnapshot } from '@/lib/rtc'
import { webcamStore } from '@/lib/webcam-store'
import { cn } from '@/lib/utils'
import { Avatar, Badge, Button, Card, EmptyState, Select } from './ui'
import { useLive } from './context'

/** Đọc trạng thái webcam dùng chung; phòng và camera không bị đóng khi component bị gỡ. */
function useWebcam(tournamentId: string, matchId: string, enabled: boolean) {
  const st = useSyncExternalStore(webcamStore.subscribe, webcamStore.get, webcamStore.server)
  useEffect(() => {
    if (enabled && tournamentId && matchId) webcamStore.join(tournamentId, matchId)
    else if (!enabled && st.key === `${tournamentId}:${matchId}`) webcamStore.leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, matchId, enabled])
  const mine = st.key === `${tournamentId}:${matchId}`
  return { st, snap: mine ? st.snap : EMPTY, stream: mine ? st.stream : null }
}

const EMPTY: RtcSnapshot = { status: 'idle', self: null, peers: [], allowOpponent: false, remotes: [], error: '' }

function VideoTile({ stream, label, sub, tone, mirror, muted = true, live, placeholder, locked }: {
  stream: MediaStream | null; label: string; sub?: string; tone?: 'red' | 'blue' | 'gold' | 'primary'; mirror?: boolean
  muted?: boolean; live?: boolean; placeholder?: string; locked?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [sound, setSound] = useState(false)
  useEffect(() => {
    const el = video.current
    if (el && el.srcObject !== stream) el.srcObject = stream
    if (el && stream) void el.play().catch(() => undefined)
  }, [stream])
  const showVideo = !!stream && live !== false
  const ring = { red: 'ring-red-500/60', blue: 'ring-blue-500/60', gold: 'ring-amber-400/70', primary: 'ring-primary/60' }[tone ?? 'primary']
  return (
    <div ref={box} className={cn('group relative aspect-video overflow-hidden rounded-xl bg-black/60 ring-2', ring)}>
      <video ref={video} data-self-cam={mirror ? '' : undefined} playsInline autoPlay muted={muted || !sound} className={cn('size-full object-cover', mirror && '-scale-x-100', !showVideo && 'hidden')} />
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-card to-background p-3 text-center">
          {locked ? <Lock className="size-6 text-muted-foreground" aria-hidden /> : <Avatar name={label} size="lg" />}
          <p className="text-xs text-muted-foreground">{placeholder}</p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-6 text-white">
        <span className="min-w-0 truncate text-xs font-bold">{label}{sub && <span className="ml-1.5 font-normal opacity-70">{sub}</span>}</span>
        <span className="flex items-center gap-1">
          {showVideo && live && <span className="animate-live size-2 rounded-full bg-emerald-400" aria-label="Đang phát" />}
          {!muted && showVideo && (
            <button aria-label={sound ? 'Tắt tiếng' : 'Bật tiếng'} className="rounded p-1 hover:bg-white/20" onClick={() => setSound((v) => !v)}>{sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}</button>
          )}
          {showVideo && <button aria-label="Phóng to" className="rounded p-1 hover:bg-white/20" onClick={() => void box.current?.requestFullscreen?.()}><Maximize2 className="size-3.5" /></button>}
        </span>
      </div>
    </div>
  )
}

function remoteFor(snap: RtcSnapshot, match: (p: PeerInfo) => boolean): { peer?: PeerInfo; remote?: Remote } {
  const peer = snap.peers.find(match)
  return { peer, remote: peer ? snap.remotes.find((r) => r.peer.id === peer.id) : undefined }
}

export function WebcamPanel({ tournamentId, matchId, compact = false, round = 0, running = false }: { tournamentId: string; matchId: string; compact?: boolean; round?: number; running?: boolean }) {
  const { role, session, enterMatch, ownMatches } = useLive()
  const inRoom = role === 'ADMIN' || (role === 'TEAM' && session.match_id === matchId)
  const { st, snap, stream } = useWebcam(tournamentId, matchId, inRoom)
  // Chỉ đội thi ghi video (ban tổ chức chỉ xem).
  useEffect(() => { if (role === 'TEAM' && inRoom) webcamStore.setRound(round, running) }, [role, inRoom, round, running])
  const cam = { stream, micOn: st.micOn, devices: st.devices, deviceId: st.deviceId, start: (id?: string) => webcamStore.start(id), stop: () => webcamStore.stop(), toggleMic: () => webcamStore.toggleMic() }
  const error = st.error || snap.error

  if (role === 'GUEST') {
    return <Card title="Webcam"><EmptyState icon={<CameraOff className="size-7" />} title="Đăng nhập để dùng webcam" hint="Webcam dành cho đội thi trong trận của mình và ban tổ chức." /></Card>
  }
  if (!inRoom) {
    const own = ownMatches.some(([id]) => id === matchId)
    return (
      <Card title="Webcam">
        <EmptyState icon={<CameraOff className="size-7" />} title={own ? 'Vào phòng trận để bật webcam' : 'Webcam chỉ có trong trận của đội bạn'} action={own ? <Button onClick={() => void enterMatch(matchId)}>Vào phòng trận</Button> : undefined} />
      </Card>
    )
  }

  const admin = role === 'ADMIN'
  const connected = snap.status === 'open'
  const sideA = remoteFor(snap, (p) => p.role === 'TEAM' && p.side === 'team_a')
  const sideB = remoteFor(snap, (p) => p.role === 'TEAM' && p.side === 'team_b')
  const referee = remoteFor(snap, (p) => p.role === 'ADMIN')
  const mySide = snap.self?.side
  const opponent = mySide === 'team_a' ? sideB : sideA

  const tileStatus = (e: { peer?: PeerInfo; remote?: Remote }, label: string) =>
    !e.peer ? `${label} chưa vào phòng`
      : !e.remote ? 'Chưa kết nối'
      : e.remote.live ? ''
      : e.remote.state === 'failed' ? 'Không kết nối được (mạng chặn kết nối trực tiếp)'
      : e.remote.state !== 'connected' ? 'Đang kết nối…'
      : 'Chưa có hình (camera chưa bật hoặc đang bị ứng dụng khác dùng)'

  return (
    <Card
      title={compact ? 'Camera hai đội' : 'Webcam phòng đấu'}
      subtitle={compact ? undefined : admin ? 'Giám sát camera hai đội. Video truyền trực tiếp giữa trình duyệt; riêng đội thi còn gửi bản ghi hình ngắn của mỗi hiệp (không có âm thanh) để xem lại, lưu 30 ngày.' : 'Camera của bạn chỉ được gửi trực tiếp cho ban tổ chức (và đối thủ nếu được cho phép). Trong lúc hiệp chạy, hình ngắn của bạn (không âm thanh) được lưu 30 ngày cho replay; chỉ ban tổ chức và hai đội trong trận xem được.'}
      action={<Badge tone={connected ? 'success' : snap.status === 'connecting' ? 'warning' : 'neutral'}>{connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}{connected ? 'Đã kết nối' : snap.status === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối'}</Badge>}
    >
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>}

        {admin ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <VideoTile stream={sideA.remote?.stream ?? null} live={sideA.remote?.live} muted={false} tone="red" label={sideA.peer?.name || 'Đội Đỏ'} sub="Đỏ" placeholder={tileStatus(sideA, 'Đội Đỏ')} />
            <VideoTile stream={sideB.remote?.stream ?? null} live={sideB.remote?.live} muted={false} tone="blue" label={sideB.peer?.name || 'Đội Xanh'} sub="Xanh" placeholder={tileStatus(sideB, 'Đội Xanh')} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <VideoTile stream={cam.stream} mirror live tone={mySide === 'team_a' ? 'red' : 'blue'} label="Bạn" sub={snap.self?.name} placeholder="Bấm “Bật camera” để bắt đầu" />
            <VideoTile
              stream={snap.allowOpponent ? opponent.remote?.stream ?? null : null} live={opponent.remote?.live} muted={false} locked={!snap.allowOpponent}
              tone={mySide === 'team_a' ? 'blue' : 'red'} label={opponent.peer?.name || 'Đối thủ'}
              placeholder={snap.allowOpponent ? tileStatus(opponent, 'Đối thủ') : 'Ban tổ chức chưa cho phép xem camera đối thủ'}
            />
          </div>
        )}

        {!admin && referee.remote?.live && (
          <div className="max-w-xs"><VideoTile stream={referee.remote.stream} live muted={false} tone="gold" label="Ban tổ chức" /></div>
        )}
        {admin && cam.stream && <div className="max-w-xs"><VideoTile stream={cam.stream} mirror live tone="gold" label="Camera của bạn" /></div>}

        <div className="flex flex-wrap items-center gap-2">
          {cam.stream ? (
            <>
              <Button variant="danger" size="sm" onClick={cam.stop}><CameraOff className="size-4" />Tắt camera</Button>
              <Button variant="secondary" size="sm" onClick={cam.toggleMic} aria-pressed={cam.micOn}>{cam.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}{cam.micOn ? 'Mic đang bật' : 'Mic đang tắt'}</Button>
              {cam.devices.length > 1 && (
                <Select aria-label="Chọn camera" value={cam.deviceId} onChange={(e) => void cam.start(e.target.value)} className="w-52">
                  {cam.devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                </Select>
              )}
            </>
          ) : (
            <Button size="sm" disabled={!connected} onClick={() => void cam.start()}><Camera className="size-4" />{st.wasOn ? 'Bật lại camera' : 'Bật camera'}</Button>
          )}
          {admin && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
              <input type="checkbox" className="accent-primary" checked={snap.allowOpponent} disabled={!connected} onChange={(e) => webcamStore.setAllowOpponent(e.target.checked)} />
              {snap.allowOpponent ? <Eye className="size-4 text-primary" /> : <EyeOff className="size-4 text-muted-foreground" />}
              Cho phép hai đội xem nhau
            </label>
          )}
        </div>
        {!compact && <p className="text-[11px] text-muted-foreground">Camera chỉ được gửi sau khi bạn bấm “Bật camera” và đồng ý quyền của trình duyệt; micro luôn tắt cho tới khi bạn bật. Cần HTTPS (hoặc localhost). Nếu mạng chặn kết nối trực tiếp, hình có thể không hiện.</p>}
      </div>
    </Card>
  )
}
