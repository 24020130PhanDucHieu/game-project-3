'use client'

import { useState } from 'react'
import { Bell, CheckCheck, Megaphone, Send } from 'lucide-react'
import type { Notification, ViewId } from '@/lib/arena-data'
import { initialNotifications } from '@/lib/arena-data'
import { Btn, Field, Modal, Notice, Pill, SelectField, TextArea } from '../primitives'

export function BroadcastModal({
  open,
  onClose,
  isAdmin = false,
  onNavigate,
  onBroadcast,
}: {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
  onNavigate?: (view: ViewId) => void
  onBroadcast?: (notif: { title: string; body: string; target: ViewId }) => void
}) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastTarget, setBroadcastTarget] = useState<ViewId>('match')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastNotice, setBroadcastNotice] = useState<string | null>(null)

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return
    setBroadcastLoading(true)

    setTimeout(() => {
      setBroadcastLoading(false)
      const newNotif: Notification = {
        id: `notif-${Date.now()}`,
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        target: broadcastTarget,
        time: 'Vừa xong',
        unread: true,
      }
      setNotifications((prev) => [newNotif, ...prev])
      onBroadcast?.({ title: broadcastTitle, body: broadcastBody, target: broadcastTarget })
      setBroadcastNotice('Đã phát thông báo mới tới toàn bộ thí sinh trực tuyến!')
      setBroadcastTitle('')
      setBroadcastBody('')
      setTimeout(() => setBroadcastNotice(null), 3000)
    }, 600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Trung Tâm Thông Báo &amp; Điều Hành"
      description="Cập nhật diễn biến giải đấu, lịch thi, cảnh báo hệ thống và chỉ đạo từ Ban Tổ Chức."
      size="md"
    >
      <div className="flex flex-col gap-4">
        {/* Nút hành động đầu modal */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {notifications.filter((n) => n.unread).length} thông báo chưa đọc
            </span>
          </div>
          <button
            type="button"
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-3.5" />
            Đánh dấu đã đọc tất cả
          </button>
        </div>

        {/* Khối Phát thông báo của Ban Tổ Chức (Admin only) */}
        {isAdmin && (
          <details className="rounded-lg border border-primary/20 bg-accent/40 p-3 sm:p-3.5">
            <summary className="cursor-pointer text-xs font-bold text-accent-foreground flex items-center gap-1.5">
              <Megaphone className="size-4 text-primary" />
              Phát thông báo mới từ Ban Tổ Chức tới toàn thể thí sinh
            </summary>

            <form onSubmit={handleBroadcast} className="mt-3 flex flex-col gap-3">
              {broadcastNotice && <Notice tone="success">{broadcastNotice}</Notice>}

              <Field
                label="Tiêu đề thông báo"
                placeholder="Ví dụ: Vòng Bán Kết sẽ bắt đầu sau 15 phút..."
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
              />

              <TextArea
                label="Nội dung thông báo"
                placeholder="Thông báo chi tiết tới toàn bộ đội thi..."
                rows={2}
                required
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Điều hướng khi nhấn:</span>
                  <select
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs outline-none focus:border-primary"
                    value={broadcastTarget}
                    onChange={(e) => setBroadcastTarget(e.target.value as ViewId)}
                  >
                    <option value="match">Trận đấu (Match)</option>
                    <option value="bracket">Bảng đấu (Bracket)</option>
                    <option value="qualifier">Vòng loại (Qualifier)</option>
                    <option value="overview">Tổng quan (Overview)</option>
                    <option value="guide">Hướng dẫn (Guide)</option>
                  </select>
                </div>

                <Btn type="submit" variant="primary" size="sm" loading={broadcastLoading}>
                  <Send className="size-3.5" />
                  Gửi Thông Báo
                </Btn>
              </div>
            </form>
          </details>
        )}

        {/* Danh sách thông báo */}
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Chưa có thông báo nào mới.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (n.target && onNavigate) {
                    onNavigate(n.target)
                    onClose()
                  }
                }}
                className={`cursor-pointer p-3 transition hover:bg-secondary/40 ${
                  n.unread ? 'bg-accent/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{n.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{n.time}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                {n.target && (
                  <span className="mt-2 inline-block font-mono text-[10px] text-primary hover:underline">
                    Xem tại: {n.target} &rarr;
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
