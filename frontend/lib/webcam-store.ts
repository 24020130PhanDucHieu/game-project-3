'use client'

import { RtcRoom, type RtcSnapshot } from './rtc'
import { arenaApi } from './api-client'

/**
 * Phòng webcam và camera của chính mình sống ngoài component,
 * nên chuyển tab không làm mất kết nối hay tắt camera.
 * Chỉ đóng khi đổi sang trận khác, bấm tắt, hoặc đăng xuất.
 */
export type WebcamState = {
  key: string
  snap: RtcSnapshot
  stream: MediaStream | null
  micOn: boolean
  error: string
  devices: MediaDeviceInfo[]
  deviceId: string
  wasOn: boolean
}

const EMPTY_SNAP: RtcSnapshot = { status: 'idle', self: null, peers: [], allowOpponent: false, remotes: [], error: '' }
const FLAG = 'arena.cam.on'

function readFlag() { try { return sessionStorage.getItem(FLAG) === '1' } catch { return false } }
function writeFlag(on: boolean) { try { on ? sessionStorage.setItem(FLAG, '1') : sessionStorage.removeItem(FLAG) } catch { /* bỏ qua */ } }

let state: WebcamState = { key: '', snap: EMPTY_SNAP, stream: null, micOn: false, error: '', devices: [], deviceId: '', wasOn: false }
let room: RtcRoom | null = null
let frame = 0

// Ảnh camera định kỳ cho replay: 10 giây một ảnh 320×180 JPEG (~15 KB), chỉ khi đang ở phòng trận và camera bật.
const SNAPSHOT_MS = 10_000
let snapTimer = 0
let snapVideo: HTMLVideoElement | null = null

/** Lấy một khung hình từ camera: ưu tiên ImageCapture (không cần thẻ video), sau đó tới video ẩn trong màn hình. */
async function grabFrame(stream: MediaStream): Promise<CanvasImageSource | null> {
  const track = stream.getVideoTracks()[0]
  const Capture = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture
  if (track && Capture) {
    try { return await new Capture(track).grabFrame() } catch { /* dùng cách dự phòng */ }
  }
  // Ô xem trước camera của chính mình đang hiện trên màn hình: dùng nó nếu đã có hình (luôn được giải mã).
  const preview = document.querySelector<HTMLVideoElement>('video[data-self-cam]')
  if (preview && preview.srcObject === stream && preview.readyState >= 2 && preview.videoWidth > 8) return preview
  if (!snapVideo) {
    // Phải nằm trong khung nhìn: trình duyệt ngừng giải mã video ở ngoài màn hình (sẽ chụp ra ảnh đen).
    snapVideo = document.createElement('video')
    snapVideo.muted = true
    snapVideo.playsInline = true
    snapVideo.setAttribute('aria-hidden', 'true')
    snapVideo.style.cssText = 'position:fixed;right:0;bottom:0;width:64px;height:36px;opacity:0.01;pointer-events:none;z-index:-1'
    document.body.appendChild(snapVideo)
  }
  if (snapVideo.srcObject !== stream) snapVideo.srcObject = stream
  if (snapVideo.paused) await snapVideo.play().catch(() => undefined)
  await new Promise<void>((resolve) => {
    const v = snapVideo as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    const timer = window.setTimeout(resolve, 1500)
    v.requestVideoFrameCallback?.(() => { window.clearTimeout(timer); resolve() })
  })
  return snapVideo.videoWidth > 8 ? snapVideo : null
}

async function captureOnce() {
  const stream = state.stream
  const [tid, mid] = state.key.split(':')
  if (!stream || !tid || !mid) return
  if (rec && rec.ok && !rec.dead) return // đang có video tốt: không cần ảnh chụp
  const frame = await grabFrame(stream)
  if (!frame) return
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 180
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(frame, 0, 0, 320, 180)
  if ('close' in frame && typeof frame.close === 'function') frame.close()
  // Bỏ qua ảnh gần như đen hoàn toàn (camera chưa sẵn sàng hoặc bị che).
  const sample = ctx.getImageData(0, 0, 320, 180).data
  let light = 0
  let count = 0
  for (let i = 0; i < sample.length; i += 4 * 97) { light += sample[i] + sample[i + 1] + sample[i + 2]; count++ }
  if (light / count < 12) return
  for (const quality of [0.6, 0.45, 0.3]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= 38_000) { await arenaApi.uploadSnapshot(tid, mid, blob).catch(() => undefined); return }
  }
}

// Video ngắn của hiệp: ghi bằng MediaRecorder (chỉ hình, ~150 kbps), gửi từng mảnh 5 giây lên máy chủ ngay khi có.
// Ghi lỗi hoặc trình duyệt không hỗ trợ thì cứ để ảnh 10 giây lo phần replay.
const CLIP_PART_MS = 5_000
const CLIP_MIMES = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
type Recording = { mr: MediaRecorder; round: number; seq: number; kind: string; chain: Promise<void>; ok: boolean; dead: boolean; pending: Blob[]; pendingSize: number }
let rec: Recording | null = null
let roundInfo = { round: 0, running: false }

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return CLIP_MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || ''
}

function stopRecording() {
  const r = rec
  rec = null
  if (!r) return
  try { if (r.mr.state !== 'inactive') r.mr.stop() } catch { /* bỏ qua */ }
}

function startRecording(round: number) {
  const stream = state.stream
  const [tid, mid] = state.key.split(':')
  const mime = pickMime()
  if (!stream || !tid || !mid || !mime || !stream.getVideoTracks().length) return
  let mr: MediaRecorder
  try { mr = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType: mime, videoBitsPerSecond: 150_000 }) } catch { return }
  const r: Recording = { mr, round, seq: 0, kind: mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm', chain: Promise.resolve(), ok: false, dead: false, pending: [], pendingSize: 0 }
  // Trình duyệt đôi khi cắt mảnh rất nhỏ: gom lại tới ~4 KB rồi mới gửi (mảnh cuối gửi khi dừng).
  const flush = () => {
    if (!r.pending.length || r.dead) return
    const part = new Blob(r.pending, { type: r.kind })
    r.pending = []; r.pendingSize = 0
    r.chain = r.chain.then(async () => {
      if (r.dead) return
      const seq = r.seq
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await arenaApi.uploadClipPart(tid, mid, r.round, seq, r.kind, part); r.seq = seq + 1; r.ok = true; return }
        catch (e) {
          const status = (e as { status?: number })?.status
          if (status === 429 && attempt === 0) { await new Promise((res) => setTimeout(res, 2200)); continue }
          r.dead = true // 409/413/lỗi mạng: bỏ clip của hiệp này, ảnh 10 giây vẫn chạy
          return
        }
      }
    })
  }
  mr.ondataavailable = (ev) => {
    if (!ev.data || ev.data.size === 0 || r.dead) return
    r.pending.push(ev.data); r.pendingSize += ev.data.size
    if (r.pendingSize >= 4096) flush()
  }
  mr.onstop = flush
  mr.onerror = () => { r.dead = true }
  try { mr.start(CLIP_PART_MS) } catch { return }
  rec = r
}

function syncRecording() {
  const want = !!state.stream && !!state.key && roundInfo.running && roundInfo.round > 0
  if (!want) { stopRecording(); return }
  if (rec && rec.round === roundInfo.round && rec.mr.stream.getVideoTracks()[0] && state.stream?.getVideoTracks().includes(rec.mr.stream.getVideoTracks()[0])) return
  stopRecording()
  startRecording(roundInfo.round)
}

function syncSnapshots() {
  const want = !!state.stream && !!state.key
  if (want && !snapTimer) {
    snapTimer = window.setInterval(() => { void captureOnce() }, SNAPSHOT_MS)
    window.setTimeout(() => { void captureOnce() }, 2000)
  } else if (!want && snapTimer) {
    window.clearInterval(snapTimer); snapTimer = 0
    if (snapVideo) snapVideo.srcObject = null
  }
}
const listeners = new Set<() => void>()

function set(patch: Partial<WebcamState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  if ('stream' in patch || 'key' in patch) { syncSnapshots(); syncRecording() }
}

export const webcamStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => state,
  server: () => state,

  /** Vào phòng của trận; gọi lại với cùng trận thì giữ nguyên kết nối cũ. */
  join(tournamentId: string, matchId: string) {
    const key = `${tournamentId}:${matchId}`
    if (state.key === key && room) return
    this.leave()
    const next = new RtcRoom(tournamentId, matchId, () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; if (room === next) set({ snap: next.snapshot() }) })
    })
    room = next
    set({ key, snap: EMPTY_SNAP, error: '', wasOn: readFlag() })
    next.connect()
    if (state.stream) next.setLocalStream(state.stream)
  },

  leave() {
    cancelAnimationFrame(frame); frame = 0
    stopRecording()
    room?.destroy(); room = null
    stopTracks()
    set({ key: '', snap: EMPTY_SNAP, stream: null, micOn: false })
  },

  setAllowOpponent(v: boolean) { room?.setAllowOpponent(v) },

  /** Báo hiệp hiện tại và hiệp có đang chạy không: ghi video đúng trong lúc hiệp chạy. */
  setRound(round: number, running: boolean) {
    if (roundInfo.round === round && roundInfo.running === running) return
    roundInfo = { round, running }
    syncRecording()
  },

  async start(id?: string) {
    set({ error: '' })
    if (!navigator.mediaDevices?.getUserMedia) {
      set({ error: window.isSecureContext ? 'Trình duyệt không hỗ trợ camera.' : 'Camera chỉ dùng được trên HTTPS hoặc localhost.' })
      return
    }
    const video: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, ...(id ? { deviceId: { exact: id } } : {}) }
    try {
      let next: MediaStream
      try { next = await navigator.mediaDevices.getUserMedia({ video, audio: true }) }
      catch (e) {
        if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) throw e
        next = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      }
      next.getAudioTracks().forEach((t) => { t.enabled = false })
      stopTracks()
      room?.setLocalStream(next)
      writeFlag(true)
      set({ stream: next, micOn: false, wasOn: true, deviceId: next.getVideoTracks()[0]?.getSettings().deviceId || '' })
      set({ devices: (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput') })
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      set({ error: name === 'NotAllowedError' ? 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.'
        : name === 'NotFoundError' ? 'Không tìm thấy camera trên thiết bị này.'
        : name === 'NotReadableError' ? 'Camera đang được ứng dụng khác sử dụng.'
        : 'Không bật được camera.' })
    }
  },

  stop() {
    stopTracks()
    room?.setLocalStream(null)
    writeFlag(false)
    set({ stream: null, micOn: false, wasOn: false })
  },

  toggleMic() {
    const track = state.stream?.getAudioTracks()[0]
    if (!track) { set({ error: 'Không có micro khả dụng.' }); return }
    track.enabled = !track.enabled
    set({ micOn: track.enabled })
  },
}

function stopTracks() { state.stream?.getTracks().forEach((t) => t.stop()) }
