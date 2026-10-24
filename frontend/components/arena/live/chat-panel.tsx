'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Lock, LockOpen, MessagesSquare, Send, ShieldCheck, Trash2, WifiOff } from 'lucide-react'
import { chatStore, type ChatMessage, type ChatState } from '@/lib/chat-store'
import { cn } from '@/lib/utils'
import { Avatar, Badge, Button, Card, EmptyState } from './ui'
import { useLive } from './context'

const MAX = 500

export function useChat() {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get, chatStore.server)
}

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function dayKey(ts: number) { return new Date(ts).toDateString() }

function sideTone(m: ChatMessage) {
  if (m.role === 'ADMIN') return { name: 'text-violet-600 dark:text-violet-300', bubble: 'border-violet-500/30 bg-violet-500/10' }
  if (m.side === 'team_a') return { name: 'text-rose-600 dark:text-rose-300', bubble: 'border-rose-500/25 bg-rose-500/10' }
  return { name: 'text-sky-600 dark:text-sky-300', bubble: 'border-sky-500/25 bg-sky-500/10' }
}

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const tone = sideTone(m)
  return (
    <div className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
      {m.role === 'ADMIN'
        ? <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-inner" aria-hidden><ShieldCheck className="size-4" /></span>
        : <Avatar name={m.name} size="sm" ring={m.side === 'team_a' ? 'red' : 'blue'} />}
      <div className={cn('min-w-0 max-w-[78%]', mine && 'text-right')}>
        <div className={cn('mb-0.5 flex items-center gap-1.5 text-[11px]', mine && 'flex-row-reverse')}>
          <span className={cn('truncate font-semibold', tone.name)}>{mine ? 'Bạn' : m.name}</span>
          {m.role === 'ADMIN' && <Badge tone="accent" className="!px-1.5 !py-0 !text-[10px]">BTC</Badge>}
          <span className="text-muted-foreground">{clock(m.ts)}</span>
        </div>
        <p className={cn('inline-block whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-left text-sm leading-snug', tone.bubble, mine ? 'rounded-br-md' : 'rounded-bl-md')}>{m.text}</p>
      </div>
    </div>
  )
}

function isMine(st: ChatState, m: ChatMessage) {
  return !!st.self && m.role === st.self.role && (m.side || '') === (st.self.side || '')
}

export function ChatPanel({ tournamentId, matchId, match }: { tournamentId: string; matchId: string; match: any }) {
  const { role, session } = useLive()
  const st = useChat()
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const canChat = role === 'ADMIN' || session.match_id === matchId
  const mine = st.key === `${tournamentId}:${matchId}`

  useEffect(() => {
    chatStore.setVisible(true)
    return () => chatStore.setVisible(false)
  }, [])

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [st.messages.length, mine])

  function submit() {
    if (!text.trim()) return
    if (chatStore.send(text)) {
      setText('')
      stick.current = true
    }
  }

  if (!canChat) {
    return <Card icon={<MessagesSquare />} title="Trò chuyện"><EmptyState title="Chưa vào phòng trận" hint="Bấm “Trận của đội tôi” để vào phòng, sau đó chat với đối thủ và ban tổ chức." /></Card>
  }

  const messages = mine ? st.messages : []
  const a = match?.team_a?.team_name || 'Đội A'
  const b = match?.team_b?.team_name || 'Đội B'
  const isAdmin = role === 'ADMIN'
  const locked = mine && st.muted && !isAdmin
  const onlineSide = (side: string) => st.online.some((p) => p.side === side)
  const adminOnline = st.online.some((p) => p.role === 'ADMIN')

  return (
    <Card
      icon={<MessagesSquare />}
      title="Trò chuyện trong trận"
      subtitle="Cả hai đội và ban tổ chức đều thấy tin nhắn trong phòng này"
      padded={false}
      action={isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => chatStore.setMuted(!st.muted)}>{st.muted ? <><LockOpen className="size-4" />Mở chat đội</> : <><Lock className="size-4" />Khóa chat đội</>}</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Xóa toàn bộ lịch sử chat của trận này?')) chatStore.clear() }}><Trash2 className="size-4" />Xóa</Button>
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300"><i className={cn('size-1.5 rounded-full', onlineSide('team_a') ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />{a}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-700 dark:text-sky-300"><i className={cn('size-1.5 rounded-full', onlineSide('team_b') ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />{b}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-700 dark:text-violet-300"><i className={cn('size-1.5 rounded-full', adminOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />Ban tổ chức</span>
        {mine && st.status !== 'open' && <span className="ml-auto inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><WifiOff className="size-3.5" />{st.status === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối, đang thử lại…'}</span>}
        {mine && st.muted && <Badge tone="warning" className="ml-auto"><Lock className="size-3" />Chat của đội đang khóa</Badge>}
      </div>

      <div
        ref={box}
        data-testid="chat-list"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }}
        className="h-[min(26rem,55vh)] space-y-3 overflow-y-auto bg-gradient-to-b from-muted/30 to-transparent px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <div><MessagesSquare className="mx-auto mb-2 size-8 opacity-40" />Chưa có tin nhắn nào.<br />Hãy gửi lời chào đầu tiên.</div>
          </div>
        ) : messages.map((m, i) => (
          <div key={m.id}>
            {(i === 0 || dayKey(messages[i - 1].ts) !== dayKey(m.ts)) && (
              <div className="mb-3 text-center text-[11px] font-medium text-muted-foreground">{new Date(m.ts).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
            )}
            <Bubble m={m} mine={isMine(st, m)} />
          </div>
        ))}
      </div>

      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {st.error && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">{st.error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Nội dung tin nhắn"
            data-testid="chat-input"
            rows={1}
            maxLength={MAX}
            value={text}
            disabled={locked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={locked ? 'Ban tổ chức đang khóa chat của các đội' : 'Nhập tin nhắn, Enter để gửi'}
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <Button type="submit" disabled={locked || !text.trim() || st.status !== 'open'} aria-label="Gửi tin nhắn"><Send className="size-4" />Gửi</Button>
        </div>
        <p className="mt-1.5 text-right text-[11px] text-muted-foreground">{text.length}/{MAX}</p>
      </form>
    </Card>
  )
}
