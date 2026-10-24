'use client'

import { RtcRoom, type RtcSnapshot } from './rtc'

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
const listeners = new Set<() => void>()

function set(patch: Partial<WebcamState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
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
    room?.destroy(); room = null
    stopTracks()
    set({ key: '', snap: EMPTY_SNAP, stream: null, micOn: false })
  },

  setAllowOpponent(v: boolean) { room?.setAllowOpponent(v) },

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
