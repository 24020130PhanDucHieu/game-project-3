'use client'

/**
 * Webcam trong phòng trận bằng WebRTC P2P. Máy chủ chỉ chuyển tiếp "tín hiệu" (offer/answer/ice); video đi thẳng giữa các trình duyệt.
 *
 * Mô hình đơn giản, không cần đàm phán lại (không có "glare"):
 *  - Người XEM luôn là bên gửi offer, với transceiver chỉ nhận (recvonly).
 *  - Người PHÁT là bên trả lời; transceiver chuyển thành sendonly và gắn track camera bằng replaceTrack.
 *    Bật/tắt camera về sau chỉ là replaceTrack, không cần thương lượng lại.
 *  - Quyền xem: Admin xem mọi đội; đội xem Admin; hai đội xem nhau chỉ khi Admin bật allow_opponent.
 */

import { getSessionToken } from './api-client'
import { buildWsUrl } from './match-socket'

export type PeerInfo = { id: string; role: 'ADMIN' | 'TEAM'; side?: 'team_a' | 'team_b'; name?: string }
export type Remote = { peer: PeerInfo; stream: MediaStream | null; live: boolean; state: RTCPeerConnectionState | 'new' }
export type RtcSnapshot = {
  status: 'idle' | 'connecting' | 'open' | 'closed'
  self: PeerInfo | null
  peers: PeerInfo[]
  allowOpponent: boolean
  remotes: Remote[]
  error: string
}

type ViewEntry = { pc: RTCPeerConnection; stream: MediaStream | null; live: boolean; retries: number; pending: RTCIceCandidateInit[] }
type PubEntry = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] }

function iceServers(): RTCIceServer[] {
  try {
    const raw = process.env.NEXT_PUBLIC_ICE_SERVERS
    if (raw) return JSON.parse(raw)
  } catch { /* dùng mặc định */ }
  return [{ urls: 'stun:stun.l.google.com:19302' }]
}

export class RtcRoom {
  private ws: WebSocket | null = null
  private self: PeerInfo | null = null
  private peers = new Map<string, PeerInfo>()
  private views = new Map<string, ViewEntry>()
  private pubs = new Map<string, PubEntry>()
  private allow = false
  private status: RtcSnapshot['status'] = 'idle'
  private error = ''
  private local: MediaStream | null = null
  private destroyed = false
  private attempts = 0
  private timer: number | undefined

  constructor(private tournamentId: string, private matchId: string, private onChange: () => void) {}

  snapshot(): RtcSnapshot {
    return {
      status: this.status,
      self: this.self,
      peers: [...this.peers.values()],
      allowOpponent: this.allow,
      error: this.error,
      remotes: [...this.peers.values()].filter((p) => this.views.has(p.id)).map((peer) => {
        const v = this.views.get(peer.id)!
        return { peer, stream: v.stream, live: v.live, state: v.pc.connectionState }
      }),
    }
  }

  connect() {
    if (this.destroyed || this.ws) return
    const token = getSessionToken()
    if (!token) { this.error = 'Cần đăng nhập để dùng webcam.'; this.emit(); return }
    this.status = 'connecting'
    this.emit()
    const url = buildWsUrl(`/ws/rtc/${encodeURIComponent(this.tournamentId)}/${encodeURIComponent(this.matchId)}`) + `?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => { this.attempts = 0 }
    ws.onmessage = (event) => { try { this.handle(JSON.parse(event.data)) } catch { /* bỏ qua thông điệp lỗi */ } }
    ws.onclose = (event) => {
      if (this.ws !== ws) return
      if (event.code === 1008) this.error = 'Máy chủ ngắt kết nối vì gửi quá nhiều tín hiệu.'
      console.warn('[rtc] signaling closed', event.code, event.reason)
      this.ws = null
      this.resetPeers()
      this.status = 'closed'
      this.emit()
      if (!this.destroyed && this.attempts < 8) {
        this.attempts++
        this.timer = window.setTimeout(() => this.connect(), Math.min(1000 * 1.6 ** this.attempts, 12000))
      } else if (!this.destroyed) {
        this.error = 'Không kết nối được phòng webcam. Hãy kiểm tra đăng nhập/mạng rồi mở lại.'
        this.emit()
      }
    }
    ws.onerror = () => ws.close()
  }

  destroy() {
    this.destroyed = true
    window.clearTimeout(this.timer)
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.resetPeers()
  }

  setAllowOpponent(value: boolean) { this.send({ type: 'allow-opponent', value }) }

  /** Cập nhật camera/mic đang phát cho mọi người đang xem mình (không cần đàm phán lại). */
  setLocalStream(stream: MediaStream | null) {
    this.local = stream
    for (const entry of this.pubs.values()) this.attachLocal(entry.pc)
  }

  // ---------------------------------------------------------------- nội bộ
  private emit() { this.onChange() }
  private send(message: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message)) }

  private resetPeers() {
    this.views.forEach((v) => v.pc.close())
    this.pubs.forEach((p) => p.pc.close())
    this.views.clear(); this.pubs.clear(); this.peers.clear()
  }

  private shouldView(peer: PeerInfo): boolean {
    if (!this.self) return false
    if (this.self.role === 'ADMIN') return peer.role === 'TEAM'
    if (peer.role === 'ADMIN') return true
    return this.allow && !!peer.side && peer.side !== this.self.side
  }

  private handle(msg: any) {
    switch (msg.type) {
      case 'welcome':
        this.resetPeers()
        this.self = msg.self
        this.allow = !!msg.allow_opponent
        this.status = 'open'
        this.error = ''
        for (const p of msg.peers || []) this.peers.set(p.id, p)
        this.syncViews()
        break
      case 'peer-joined':
        this.peers.set(msg.peer.id, msg.peer)
        this.syncViews()
        break
      case 'peer-left':
        this.peers.delete(msg.id)
        this.closeView(msg.id)
        this.pubs.get(msg.id)?.pc.close()
        this.pubs.delete(msg.id)
        break
      case 'allow-opponent':
        this.allow = !!msg.value
        this.syncViews()
        break
      case 'offer': void this.onOffer(msg.from, msg.data); break
      case 'answer': void this.onAnswer(msg.from, msg.data); break
      case 'ice': void this.onIce(msg.from, msg.role, msg.data); break
      case 'error': this.error = msg.detail || ''; break
    }
    this.emit()
  }

  /** Mở/đóng các kết nối xem theo quyền hiện tại. */
  private syncViews() {
    for (const peer of this.peers.values()) {
      const want = this.shouldView(peer)
      if (want && !this.views.has(peer.id)) void this.startView(peer)
      if (!want && this.views.has(peer.id)) { this.closeView(peer.id); this.emit() }
    }
  }

  private closeView(id: string) {
    const v = this.views.get(id)
    if (!v) return
    v.pc.close()
    this.views.delete(id)
  }

  private async startView(peer: PeerInfo) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    const entry: ViewEntry = { pc, stream: null, live: false, retries: 0, pending: [] }
    this.views.set(peer.id, entry)
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })
    pc.ontrack = (event) => {
      const stream = entry.stream ?? event.streams[0] ?? new MediaStream()
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track)
      entry.stream = stream
      const refresh = () => { entry.live = stream.getVideoTracks().some((t) => !t.muted && t.readyState === 'live'); this.emit() }
      event.track.onunmute = refresh
      event.track.onmute = refresh
      event.track.onended = refresh
      refresh()
    }
    pc.onicecandidate = (event) => { if (event.candidate) this.send({ type: 'ice', to: peer.id, role: 'offerer', data: event.candidate.toJSON() }) }
    pc.onconnectionstatechange = () => {
      this.emit()
      if (pc.connectionState === 'failed' && this.views.get(peer.id) === entry && entry.retries < 3) {
        const retries = entry.retries + 1
        pc.close()
        this.views.delete(peer.id)
        window.setTimeout(() => {
          const still = this.peers.get(peer.id)
          if (still && this.shouldView(still) && !this.destroyed) { void this.startView(still).then(() => { const v = this.views.get(peer.id); if (v) v.retries = retries }) }
        }, 1500 * retries)
      }
    }
    try {
      await pc.setLocalDescription(await pc.createOffer())
      this.send({ type: 'offer', to: peer.id, role: 'offerer', data: pc.localDescription })
    } catch {
      this.error = 'Không khởi tạo được kết nối webcam.'
      this.emit()
    }
  }

  private attachLocal(pc: RTCPeerConnection) {
    const video = this.local?.getVideoTracks()[0] ?? null
    const audio = this.local?.getAudioTracks()[0] ?? null
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver.track.kind
      void transceiver.sender.replaceTrack(kind === 'video' ? video : audio).catch(() => undefined)
    }
  }

  private async onOffer(from: string, description: RTCSessionDescriptionInit) {
    this.pubs.get(from)?.pc.close()
    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    const entry: PubEntry = { pc, pending: [] }
    this.pubs.set(from, entry)
    pc.onicecandidate = (event) => { if (event.candidate) this.send({ type: 'ice', to: from, role: 'answerer', data: event.candidate.toJSON() }) }
    try {
      await pc.setRemoteDescription(description)
      for (const transceiver of pc.getTransceivers()) transceiver.direction = 'sendonly'
      this.attachLocal(pc)
      await pc.setLocalDescription(await pc.createAnswer())
      this.send({ type: 'answer', to: from, role: 'answerer', data: pc.localDescription })
      for (const c of entry.pending.splice(0)) await pc.addIceCandidate(c).catch(() => undefined)
    } catch {
      pc.close()
      this.pubs.delete(from)
    }
  }

  private async onAnswer(from: string, description: RTCSessionDescriptionInit) {
    const entry = this.views.get(from)
    if (!entry) return
    try {
      await entry.pc.setRemoteDescription(description)
      for (const c of entry.pending.splice(0)) await entry.pc.addIceCandidate(c).catch(() => undefined)
    } catch { /* kết nối sẽ được thử lại khi thất bại */ }
  }

  private async onIce(from: string, role: string, candidate: RTCIceCandidateInit) {
    // role là vai của NGƯỜI GỬI: 'offerer' → nó là người xem, đối tượng của tôi là pubs; ngược lại là views.
    const entry = role === 'offerer' ? this.pubs.get(from) : this.views.get(from)
    if (!entry) return
    if (!entry.pc.remoteDescription) { entry.pending.push(candidate); return }
    await entry.pc.addIceCandidate(candidate).catch(() => undefined)
  }
}
