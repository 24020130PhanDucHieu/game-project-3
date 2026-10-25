'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, FileText, Headset, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { aiStore, type AiMessage } from '@/lib/ai-store'
import { intents } from '@/lib/ui-intents'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, EmptyState } from './ui'
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
function useOpenSource() {
  const { navigate } = useLive()
  return (link: string) => {
    if (link.startsWith('guide/')) {
      const section = link.slice(6)
      if (intents.isGuideSection(section)) intents.openGuide(section)
      navigate('guide')
    } else if (VIEW_BY_LINK[link]) navigate(VIEW_BY_LINK[link])
  }
}

function SourceChip({ s }: { s: NonNullable<AiMessage['sources']>[number] }) {
  const [open, setOpen] = useState(false)
  const openSource = useOpenSource()
  return (
    <div className="rounded-xl border border-border bg-card/70">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs">
        <FileText className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          <p className="border-l-2 border-primary/50 pl-2 text-xs italic text-muted-foreground">“{s.quote}”</p>
          <Button size="sm" variant="ghost" onClick={() => openSource(s.link)}>Mở mục này</Button>
        </div>
      )}
    </div>
  )
}

function Bubble({ m }: { m: AiMessage }) {
  const { navigate } = useLive()
  if (m.role === 'user') {
    return <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{m.text}</p></div>
  }
  const askHuman = () => {
    intents.setClarificationDraft(m.question || '')
    intents.openGuide('ask')
    navigate('guide')
  }
  return (
    <div className="flex items-start gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-inner" aria-hidden><Sparkles className="size-4" /></span>
      <div className="min-w-0 max-w-[88%] space-y-2">
        <div className={cn('rounded-2xl rounded-tl-md border px-3 py-2 text-sm leading-snug', m.error ? 'border-red-500/30 bg-red-500/10' : m.needsHuman ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card')}>
          {m.pending ? <span className="inline-flex items-center gap-2 text-muted-foreground"><span className="animate-live size-2 rounded-full bg-primary" />{m.text}</span> : <span className="whitespace-pre-wrap break-words">{m.text}</span>}
        </div>
        {!m.pending && !!m.sources?.length && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />Căn cứ ({m.sources.length}) — bấm để xem đoạn trích nguyên văn</p>
            {m.sources.map((s) => <SourceChip key={s.id} s={s} />)}
          </div>
        )}
        {!m.pending && m.needsHuman && (
          <Button size="sm" variant="secondary" onClick={askHuman}><Headset className="size-4" />Hỏi ban tổ chức</Button>
        )}
      </div>
    </div>
  )
}

/** Khung hỏi đáp: dùng trong tab Trợ lý của Hướng dẫn và trong ngăn nổi. */
export function AiAssistantPanel({ compact = false }: { compact?: boolean }) {
  const { role, tournamentId, scope } = useLive()
  const st = useAi()
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const lastScope = useRef(scope)

  useEffect(() => {
    if (lastScope.current !== scope) { aiStore.reset(); lastScope.current = scope }
    if (role !== 'GUEST') void aiStore.refreshUsage()
  }, [role, scope])

  useLayoutEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [st.messages])

  const out = st.remaining === 0
  const disabled = st.busy || out || st.available === false
  const send = (q: string) => {
    if (!q.trim() || disabled) return
    setText('')
    void aiStore.ask(q, tournamentId)
  }

  if (role === 'GUEST') return <EmptyState icon={<Sparkles className="size-6" />} title="Đăng nhập để hỏi trợ lý" hint="Trợ lý trả lời về luật và lịch thi dựa trên tài liệu chính thức." />

  return (
    <div className="flex flex-col">
      <div ref={box} data-testid="ai-list" className={cn('space-y-3 overflow-y-auto px-1 py-2', compact ? 'h-[min(24rem,50vh)]' : 'h-[min(28rem,55vh)]')} aria-live="polite">
        {st.messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Mình trả lời về luật chơi, cách viết bot, lịch và trạng thái trận của đội bạn. Mình chỉ nói điều có trong tài liệu hoặc dữ liệu của giải, kèm nguồn; không có thì mình chuyển cho ban tổ chức.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={disabled} className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50">{s}</button>)}
            </div>
          </div>
        ) : st.messages.map((m) => <Bubble key={m.id} m={m} />)}
      </div>
      <form className="mt-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        {st.available === false && <p role="alert" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">Trợ lý AI đang tắt hoặc chưa được cấu hình. Bạn vẫn có thể gửi câu hỏi cho ban tổ chức ở tab Hỏi BTC.</p>}
        {out && st.available !== false && <p role="alert" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">Hôm nay đội bạn đã dùng hết lượt hỏi trợ lý. Hãy gửi câu hỏi cho ban tổ chức.</p>}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Câu hỏi cho trợ lý"
            data-testid="ai-input"
            rows={1}
            maxLength={400}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
            placeholder="Hỏi về luật, lịch thi, cách viết bot…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <Button type="submit" loading={st.busy} disabled={disabled || !text.trim()} aria-label="Gửi câu hỏi cho trợ lý"><Send className="size-4" />Hỏi</Button>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>AI có thể sai. Luật chính thức nằm ở các mục Hướng dẫn.</span>
          {st.remaining !== null && st.limit !== null && <Badge tone={st.remaining > 3 ? 'neutral' : 'warning'}>Còn {st.remaining}/{st.limit} lượt hôm nay</Badge>}
        </p>
      </form>
    </div>
  )
}

/** Thẻ dùng trong tab Trợ lý của Hướng dẫn. */
export function AiAssistantCard() {
  return (
    <Card icon={<Sparkles />} title="Trợ lý hỏi đáp luật" subtitle="Chỉ trả lời từ tài liệu chính thức, cấu hình giải và hỏi đáp công khai của ban tổ chức; luôn kèm nguồn. Không có căn cứ thì chuyển cho ban tổ chức.">
      <AiAssistantPanel />
    </Card>
  )
}

/** Nút nổi mở ngăn trợ lý trên mọi trang cho tài khoản đã đăng nhập. */
export function AiLauncher() {
  const { role, scope, view } = useLive()
  const st = useAi()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (role !== 'GUEST') void aiStore.refreshUsage() }, [role, scope])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (role === 'GUEST' || st.available !== true) return null
  if (view === 'guide') return null // Hướng dẫn đã có tab Trợ lý riêng
  return (
    <>
      {open && (
        <div role="dialog" aria-label="Trợ lý hỏi đáp luật" className="animate-fade-up fixed bottom-20 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold"><span className="grid size-7 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white" aria-hidden><Sparkles className="size-4" /></span>Trợ lý hỏi đáp luật</p>
            <Button size="sm" variant="ghost" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}><X className="size-4" /></Button>
          </div>
          <AiAssistantPanel compact />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Đóng trợ lý hỏi đáp' : 'Mở trợ lý hỏi đáp luật'}
        aria-expanded={open}
        data-testid="ai-launcher"
        className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Sparkles className="size-4" aria-hidden />{open ? 'Đóng' : 'Hỏi trợ lý'}
      </button>
    </>
  )
}
