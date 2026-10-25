'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, FileText, Headset, MessageCircle, RotateCcw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { aiStore, type AiMessage } from '@/lib/ai-store'
import { intents } from '@/lib/ui-intents'
import { cn } from '@/lib/utils'
import { Button } from './ui'
import { useLive, type ViewId } from './context'

const SUGGESTIONS = [
  'Bàn cờ có kích thước bao nhiêu và mỗi bên có mấy quân?',
  'Luật sương mù hoạt động thế nào?',
  'Vòng của giải này dùng luật gì?',
  'Hạn nộp bài của vòng hiện tại còn bao lâu?',
  'Đội mình đang đấu với ai, đã nộp bot chưa?',
  'ELO giải chính được tính thế nào?',
]

const VIEW_BY_LINK: Record<string, ViewId> = { 'view/match': 'match', 'view/bracket': 'bracket', 'view/profile': 'profile', 'view/ranking': 'ranking', 'view/qualifier': 'qualifier' }

export function useAi() {
  return useSyncExternalStore(aiStore.subscribe, aiStore.get, aiStore.server)
}

/** Mở mục nguồn: mục Hướng dẫn hoặc trang tương ứng. */
function useOpenSource(close: () => void) {
  const { navigate } = useLive()
  return (link: string) => {
    if (link.startsWith('guide/')) {
      const section = link.slice(6)
      if (intents.isGuideSection(section)) intents.openGuide(section)
      navigate('guide')
    } else if (VIEW_BY_LINK[link]) navigate(VIEW_BY_LINK[link])
    close()
  }
}

function Avatar() {
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-inner" aria-hidden><Sparkles className="size-4" /></span>
}

function SourceChip({ s, close }: { s: NonNullable<AiMessage['sources']>[number]; close: () => void }) {
  const [open, setOpen] = useState(false)
  const openSource = useOpenSource(close)
  return (
    <div className="rounded-xl border border-border bg-card/70">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs">
        <FileText className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          <p className="max-h-40 overflow-y-auto border-l-2 border-primary/50 pl-2 text-xs italic text-muted-foreground">“{s.quote}”</p>
          <Button size="sm" variant="ghost" onClick={() => openSource(s.link)}>Mở mục này</Button>
        </div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="Trợ lý đang tra cứu">
      {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70" style={{ animationDelay: `${i * 150}ms` }} />)}
    </span>
  )
}

function Bubble({ m, close }: { m: AiMessage; close: () => void }) {
  const { navigate } = useLive()
  if (m.role === 'user') {
    return <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-600 px-3.5 py-2 text-sm text-white shadow-sm">{m.text}</p></div>
  }
  const askHuman = () => {
    intents.setClarificationDraft(m.question || '')
    intents.openGuide('ask')
    navigate('guide')
    close()
  }
  return (
    <div className="flex items-end gap-2">
      <Avatar />
      <div className="min-w-0 max-w-[88%] space-y-2">
        <div className={cn('rounded-2xl rounded-bl-md border px-3.5 py-2 text-sm leading-snug', m.error ? 'border-red-500/30 bg-red-500/10' : m.needsHuman ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card')}>
          {m.pending ? <TypingDots /> : <span className="whitespace-pre-wrap break-words">{m.text}</span>}
        </div>
        {!m.pending && !!m.sources?.length && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />Căn cứ ({m.sources.length}) — bấm để xem trích nguyên văn</p>
            {m.sources.map((s) => <SourceChip key={s.id} s={s} close={close} />)}
          </div>
        )}
        {!m.pending && m.needsHuman && (
          <Button size="sm" variant="secondary" onClick={askHuman}><Headset className="size-4" />Hỏi ban tổ chức</Button>
        )}
      </div>
    </div>
  )
}

function ChatWindow({ onClose }: { onClose: () => void }) {
  const { tournamentId } = useLive()
  const st = useAi()
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [st.messages])
  useEffect(() => { input.current?.focus() }, [])

  const out = st.remaining === 0
  const disabled = st.busy || out || st.available === false
  const send = (q: string) => {
    if (!q.trim() || disabled) return
    setText('')
    void aiStore.ask(q, tournamentId)
  }

  return (
    <div role="dialog" aria-label="Trợ lý hỏi đáp luật" className="animate-fade-up fixed inset-x-2 bottom-20 z-[60] flex h-[min(36rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/40 sm:inset-x-auto sm:right-4 sm:w-[24rem]">
      <header className="flex items-center gap-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-white">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20 ring-2 ring-white/30" aria-hidden><Sparkles className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">Trợ lý K69</p>
          <p className="flex items-center gap-1.5 text-[11px] text-white/85"><span className="size-1.5 rounded-full bg-emerald-300" aria-hidden />Luôn dẫn nguồn · AI có thể sai</p>
        </div>
        <button type="button" onClick={() => aiStore.clear()} disabled={!st.messages.length || st.busy} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới" className="grid size-8 place-items-center rounded-full text-white/90 transition hover:bg-white/15 disabled:opacity-40"><RotateCcw className="size-4" /></button>
        <button type="button" onClick={onClose} aria-label="Đóng trợ lý" className="grid size-8 place-items-center rounded-full text-white/90 transition hover:bg-white/15"><X className="size-5" /></button>
      </header>

      <div ref={box} data-testid="ai-list" className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-muted/30 to-transparent px-3 py-4" aria-live="polite">
        <div className="flex items-end gap-2">
          <Avatar />
          <p className="max-w-[88%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2 text-sm leading-snug">Chào bạn, mình là trợ lý K69. Mình trả lời về luật chơi, cách viết bot, lịch thi và trạng thái trận của đội bạn, chỉ dựa trên tài liệu và dữ liệu thật của giải. Điều gì mình không chắc, mình sẽ chuyển cho ban tổ chức.</p>
        </div>
        {st.messages.length === 0 && (
          <div className="flex flex-wrap justify-end gap-2 pl-10">
            {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={disabled} className="rounded-2xl border border-primary/40 bg-card px-3 py-1.5 text-left text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">{s}</button>)}
          </div>
        )}
        {st.messages.map((m) => <Bubble key={m.id} m={m} close={onClose} />)}
      </div>

      <form className="border-t border-border bg-card/60 p-3" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        {st.available === false && <p role="alert" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">Trợ lý đang tắt. Bạn vẫn gửi được câu hỏi cho ban tổ chức ở Hướng dẫn → Hỏi BTC.</p>}
        {out && st.available !== false && <p role="alert" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">Hôm nay đội bạn đã dùng hết lượt hỏi. Hãy gửi câu hỏi cho ban tổ chức.</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            aria-label="Câu hỏi cho trợ lý"
            data-testid="ai-input"
            rows={1}
            maxLength={400}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
            placeholder="Nhập câu hỏi…"
            className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <button type="submit" disabled={disabled || !text.trim()} aria-label="Gửi câu hỏi cho trợ lý" className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md transition hover:brightness-110 disabled:opacity-50"><Send className="size-4" /></button>
        </div>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>AI có thể sai. Luật chính thức nằm ở Hướng dẫn.</span>
          {st.remaining !== null && st.limit !== null && <span className={cn('font-medium', st.remaining <= 3 && 'text-amber-600 dark:text-amber-300')}>Còn {st.remaining}/{st.limit} lượt hôm nay</span>}
        </p>
      </form>
    </div>
  )
}

/** Bong bóng chat tròn góc phải màn hình; bấm mở cửa sổ chat. Chỉ hiện cho tài khoản đã đăng nhập khi trợ lý đang bật. */
export function AiLauncher() {
  const { role, scope } = useLive()
  const st = useAi()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  useEffect(() => { if (role !== 'GUEST') void aiStore.refreshUsage() }, [role, scope])
  useEffect(() => { aiStore.resetOnScope(scope) }, [scope])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const replies = st.messages.filter((m) => m.role === 'ai' && !m.pending).length
  useEffect(() => { if (open) setSeen(replies) }, [open, replies])
  if (role === 'GUEST' || st.available !== true) return null
  const unread = !open && replies > seen
  return (
    <>
      {open && <ChatWindow onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Đóng trợ lý hỏi đáp' : 'Mở trợ lý hỏi đáp luật'}
        aria-expanded={open}
        title="Hỏi trợ lý"
        data-testid="ai-launcher"
        className="fixed bottom-4 right-4 z-[60] grid size-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/40 transition hover:scale-105 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        {unread && <span data-testid="ai-unread" className="absolute right-0.5 top-0.5 size-3.5 rounded-full bg-rose-500 ring-2 ring-background" aria-label="Có câu trả lời mới" />}
      </button>
    </>
  )
}
