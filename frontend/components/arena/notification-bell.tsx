'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initialNotifications } from '@/lib/arena-data'
import { arenaApi } from '@/lib/api-client'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initialNotifications)
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => n.unread).length

  useEffect(() => {
    arenaApi.getNotifications().then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setItems(
          data.map((n: any, idx: number) => ({
            id: n.id || `notif-${idx}`,
            title: n.title || 'Thông báo mới',
            body: n.body || n.content || '',
            time: n.time || (n.created_at ? new Date(n.created_at * 1000).toLocaleTimeString('vi-VN') : 'Vừa xong'),
            unread: n.unread !== false && !n.read,
            target: n.target || 'Tất cả',
          })),
        )
      }
    }).catch(() => {})
  }, [])

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Thông báo, ${unread} chưa đọc`}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground',
          open && 'border-primary/40 text-foreground ring-3 ring-primary/15',
        )}
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-[0_12px_32px_-8px_rgb(15_23_42/0.18)] animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Thông báo</p>
              <p className="text-xs text-muted-foreground">{unread} chưa đọc</p>
            </div>
            <button
              type="button"
              onClick={() => {
                arenaApi.markNotificationRead().catch(() => {})
                setItems((list) => list.map((n) => ({ ...n, unread: false })))
              }}
              disabled={unread === 0}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Đánh dấu đã đọc
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    arenaApi.markNotificationRead(n.id).catch(() => {})
                    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, unread: false } : x)))
                  }}
                  className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-secondary/70"
                >
                  <span
                    className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.unread ? 'bg-primary' : 'bg-transparent')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', n.unread ? 'font-semibold text-foreground' : 'text-foreground/80')}>
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">{n.time}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
