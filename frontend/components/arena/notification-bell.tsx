'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NotificationItem = {
  id: string
  title: string
  body: string
  time: string
  unread: boolean
}

const defaultNotifications: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Hiệp 3 đã bắt đầu',
    body: 'Luật "Đảo tương khắc" đang được áp dụng. Hãy cập nhật bot.',
    time: '2 phút trước',
    unread: true,
  },
  {
    id: 'n2',
    title: 'Kết quả vòng loại',
    body: "Đội 'ap' đạt ELO 1184.00 và lọt vào Tứ Kết.",
    time: '1 giờ trước',
    unread: true,
  },
  {
    id: 'n3',
    title: 'Nhắc hạn nộp',
    body: 'Hạn nộp mã Round 3: 00:32:00 23/10/2026.',
    time: '3 giờ trước',
    unread: true,
  },
  {
    id: 'n4',
    title: 'Bảo trì hệ thống',
    body: 'Nâng cấp server máy chấm sandbox kết nối WebSocket phân tán.',
    time: '5 giờ trước',
    unread: false,
  },
]

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>(defaultNotifications)
  const ref = useRef<HTMLDivElement>(null)
  const unreadCount = items.filter((n) => n.unread).length

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleMarkAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, unread: false })))
  }

  function handleItemClick(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Thông báo, ${unreadCount} chưa đọc`}
        className={cn(
          'relative flex size-10 items-center justify-center rounded-full border border-[#dce4ee] bg-white text-[#475569] shadow-sm transition hover:bg-[#f8fafc] hover:text-[#0f172a]',
          open && 'border-[#434be6] text-[#434be6]',
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 top-12 z-50 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#dce4ee] bg-white shadow-[0_20px_45px_-10px_rgba(15,23,42,0.18),0_0_1px_1px_rgba(15,23,42,0.06)] animate-in fade-in-0 zoom-in-95"
        >
          {/* Header matching Image 1 */}
          <div className="flex items-start justify-between border-b border-[#f1f5f9] px-5 py-4">
            <div>
              <h3 className="text-base font-extrabold text-[#0f172a]">Thông báo</h3>
              <p className="text-xs font-medium text-[#64748b]">
                {unreadCount} chưa đọc
              </p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-[#434be6] hover:text-[#343bc8] hover:underline"
            >
              ✓ Đánh dấu đã đọc
            </button>
          </div>

          {/* List items matching Image 1 */}
          <div className="max-h-[380px] divide-y divide-[#f8fafc] overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="flex cursor-pointer gap-3 px-5 py-3.5 transition hover:bg-[#f8fafd]"
              >
                <div className="pt-1.5 shrink-0">
                  <span
                    className={cn(
                      'block size-2 rounded-full',
                      item.unread ? 'bg-[#2563eb]' : 'bg-transparent',
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[13.5px] font-bold text-[#0f172a] leading-tight mb-1">
                    {item.title}
                  </h4>
                  <p className="text-[12.5px] text-[#475569] leading-relaxed mb-1.5">
                    {item.body}
                  </p>
                  <span className="text-[11.5px] text-[#94a3b8]">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
