'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellOff, BellRing } from 'lucide-react'
import { Button } from './ui'
import { useLive } from './context'

const KEY = 'arena.alerts'

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.16)
      osc.stop(now + i * 0.16 + 0.16)
    })
    window.setTimeout(() => void ctx.close(), 600)
  } catch { /* không có âm thanh */ }
}

/** Nhắc việc bằng thông báo hệ điều hành + âm thanh; chỉ hoạt động khi người dùng bật. */
export function useAlerts() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    try { setEnabled(localStorage.getItem(KEY) === '1' && 'Notification' in window && Notification.permission === 'granted') } catch { /* bỏ qua */ }
  }, [])
  const toggle = useCallback(async () => {
    if (enabled) { setEnabled(false); try { localStorage.setItem(KEY, '0') } catch { /* */ } return true }
    if (!('Notification' in window)) return false
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    const ok = permission === 'granted'
    setEnabled(ok)
    try { localStorage.setItem(KEY, ok ? '1' : '0') } catch { /* */ }
    if (ok) beep()
    return ok
  }, [enabled])
  return { enabled, toggle }
}

export function AlertsToggle() {
  const { toast } = useLive()
  const { enabled, toggle } = useAlerts()
  return (
    <Button variant="ghost" size="sm" aria-pressed={enabled} title={enabled ? 'Đang bật nhắc việc (âm thanh + thông báo)' : 'Bật nhắc việc'} aria-label={enabled ? 'Tắt nhắc việc' : 'Bật nhắc việc'}
      onClick={async () => {
        const ok = await toggle()
        if (!ok) toast('error', 'Trình duyệt không cho phép thông báo. Hãy bật quyền thông báo cho trang này.')
        else toast('info', enabled ? 'Đã tắt nhắc việc.' : 'Đã bật nhắc việc: báo khi sang hiệp mới, sắp hết hạn và có thông báo BTC.')
        window.dispatchEvent(new Event('arena-alerts'))
      }}>
      {enabled ? <BellRing className="size-4 text-primary" /> : <BellOff className="size-4" />}
    </Button>
  )
}

/** Theo dõi dữ liệu đang có và phát nhắc việc khi có thay đổi đáng chú ý. Không gọi thêm API. */
export function AlertsWatcher() {
  const { role, notifications, ownMatches, qualifiers, tournament, navigate } = useLive()
  const [on, setOn] = useState(false)
  const seen = useRef<{ unread: number | null; rounds: Record<string, number>; statuses: Record<string, string>; warned: Set<string> }>({ unread: null, rounds: {}, statuses: {}, warned: new Set() })

  useEffect(() => {
    const read = () => { try { setOn(localStorage.getItem(KEY) === '1' && 'Notification' in window && Notification.permission === 'granted') } catch { setOn(false) } }
    read()
    window.addEventListener('arena-alerts', read)
    return () => window.removeEventListener('arena-alerts', read)
  }, [])

  const fire = useCallback((title: string, body: string, view?: Parameters<typeof navigate>[0]) => {
    beep()
    try {
      const n = new Notification(title, { body, icon: '/icon.svg', tag: title })
      n.onclick = () => { window.focus(); if (view) navigate(view); n.close() }
    } catch { /* bỏ qua */ }
  }, [navigate])

  // Thông báo mới từ BTC.
  useEffect(() => {
    const unread = notifications.data?.unread_count
    if (unread === undefined) return
    const prev = seen.current.unread
    seen.current.unread = unread
    if (on && role !== 'GUEST' && prev !== null && unread > prev) {
      const latest = notifications.data?.notifications.find((n) => !n.is_read)
      fire(latest?.title || 'Có thông báo mới', latest?.message || 'Mở Arena để xem chi tiết.', 'profile')
    }
  }, [notifications.data, on, role, fire])

  // Trận của đội sang hiệp mới.
  useEffect(() => {
    for (const [id, m] of ownMatches) {
      const round = Number(m.current_round_idx || 1)
      const prev = seen.current.rounds[id]
      const prevStatus = seen.current.statuses[id]
      seen.current.rounds[id] = round
      seen.current.statuses[id] = m.status
      if (on && prev !== undefined && round > prev && m.status !== 'COMPLETED') fire(`Hiệp ${round} — ${m.title || 'trận của đội'}`, 'Đã sang hiệp mới: hãy nộp bot cho hiệp này.', 'match')
      if (on && prevStatus !== undefined && prevStatus !== 'COMPLETED' && m.status === 'COMPLETED') {
        fire('Trận đấu kết thúc', `${m.winner_name || 'Đã có đội thắng'} — xem lại replay trong tab Trận đấu.`, 'match')
      }
    }
  }, [ownMatches, on, fire])

  // Sắp hết hạn: vòng loại còn ≤ 10 phút; cửa sổ vòng của đội còn ≤ 10 phút.
  useEffect(() => {
    if (!on || role !== 'TEAM') return
    const check = () => {
      const now = Date.now()
      for (const q of qualifiers.data || []) {
        const left = Number(q.deadline) * 1000 - now
        const key = `q:${q.id}`
        if (q.status === 'OPEN' && left > 0 && left <= 10 * 60_000 && !seen.current.warned.has(key)) {
          seen.current.warned.add(key)
          fire('Vòng loại sắp đóng', `${q.name}: còn khoảng ${Math.ceil(left / 60_000)} phút để nộp bài.`, 'qualifier')
        }
      }
      for (const [id, m] of ownMatches) {
        const w = tournament.data?.stage_schedule?.[m.round_level]
        const left = Number(w?.ends_at) * 1000 - now
        const key = `w:${id}:${m.round_level}`
        if (w && m.status !== 'COMPLETED' && left > 0 && left <= 10 * 60_000 && !seen.current.warned.has(key)) {
          seen.current.warned.add(key)
          fire('Vòng đấu sắp đóng', `${m.round_name}: còn khoảng ${Math.ceil(left / 60_000)} phút.`, 'match')
        }
      }
    }
    check()
    const timer = window.setInterval(check, 30_000)
    return () => window.clearInterval(timer)
  }, [on, role, qualifiers.data, ownMatches, tournament.data, fire])

  return null
}
