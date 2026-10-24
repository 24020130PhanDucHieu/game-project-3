'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, CloudUpload, Code2, Download, HardDrive, RefreshCw, Server, Trash2, TriangleAlert } from 'lucide-react'
import { remove, type OutboxItem } from '@/lib/outbox'
import { stamp } from '@/lib/format'
import { useOnline } from '@/lib/use-online'
import { cn } from '@/lib/utils'
import { Badge, Button } from './ui'
import { useLive } from './context'
import { CodeViewer } from './replay-viewer'

export type ServerCopy = { id: string; code?: string; language?: string; at: number; valid?: boolean } | null

async function sha256(text: string) {
  if (!text) return ''
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n')))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return '' }
}

function useDraft(draftKey: string) {
  const [draft, setDraft] = useState<{ code: string; language: string }>({ code: '', language: 'PYTHON' })
  useEffect(() => {
    const read = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(`arena.draft.${draftKey}`) || 'null')
        setDraft((d) => (d.code === (saved?.code || '') ? d : { code: saved?.code || '', language: saved?.language || 'PYTHON' }))
      } catch { /* bỏ qua */ }
    }
    read()
    const timer = window.setInterval(read, 1500) // khung soạn tự lưu sau 0,4 s
    return () => window.clearInterval(timer)
  }, [draftKey])
  return draft
}

function useHash(text: string) {
  const [hash, setHash] = useState('')
  useEffect(() => { let live = true; void sha256(text).then((h) => { if (live) setHash(h) }); return () => { live = false } }, [text])
  return hash
}

const short = (h: string) => (h ? h.slice(0, 10) : '—')

/**
 * Cho đội biết bài đang ở đâu và đã khớp với máy chủ chưa:
 * bản nháp (trình duyệt) → hàng chờ gửi (trình duyệt) → bài máy chủ đã nhận. So khớp bằng SHA-256 nội dung mã.
 */
export function SyncStatusCard({ draftKey, pending, server, serverLoading }: { draftKey: string; pending: OutboxItem[]; server: ServerCopy; serverLoading?: boolean }) {
  const { flushOutbox, toast } = useLive()
  const online = useOnline()
  const draft = useDraft(draftKey)
  const draftHash = useHash(draft.code)
  const serverHash = useHash(server?.code || '')
  const [viewing, setViewing] = useState<{ code: string; language: string; title: string } | null>(null)

  const status = pending.length
    ? { tone: 'warning' as const, icon: <CloudUpload className="size-4" />, label: online ? 'Chờ gửi lên máy chủ' : 'Chờ gửi — đang mất mạng', hint: 'Bài mới nhất mới nằm trên thiết bị này. Giữ trang mở; khi có mạng bài sẽ tự gửi với cùng mã bài nộp nên không bị nộp trùng.' }
    : !server ? { tone: 'neutral' as const, icon: <HardDrive className="size-4" />, label: 'Chưa có bài trên máy chủ', hint: draft.code ? 'Bạn mới có bản nháp trên thiết bị. Bấm “Nộp bài” để gửi lên máy chủ.' : 'Chưa có bản nháp hay bài nộp nào.' }
    : !draft.code || draftHash === serverHash ? { tone: 'success' as const, icon: <CheckCircle2 className="size-4" />, label: 'Đã đồng bộ', hint: 'Bản trên máy chủ trùng khớp với bản nháp trên thiết bị (cùng mã băm SHA-256).' }
    : { tone: 'info' as const, icon: <TriangleAlert className="size-4" />, label: 'Bản nháp khác bài đã nộp', hint: 'Bạn đã sửa mã sau lần nộp cuối. Máy chủ vẫn dùng bản đã nộp cho tới khi bạn nộp lại.' }

  const download = (code: string, language: string, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    a.download = `${name}.${language === 'CPP' ? 'cpp' : 'py'}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const row = 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card px-3 py-2 text-xs'
  return (
    <section aria-label="Trạng thái lưu và đồng bộ bài nộp" className={cn('rounded-xl border p-3', status.tone === 'warning' ? 'border-amber-500/40 bg-amber-500/10' : status.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/30')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">{status.icon}Trạng thái bài: <Badge tone={status.tone}>{status.label}</Badge>{!online && <Badge tone="danger"><CloudOff className="size-3" />Mất mạng</Badge>}</p>
        {pending.length > 0 && <Button size="sm" disabled={!online} onClick={() => void flushOutbox()}><RefreshCw className="size-3.5" />Gửi lại ngay</Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{status.hint}</p>

      <ol className="mt-3 space-y-1.5">
        <li className={row}>
          <HardDrive className="size-3.5 text-primary" />
          <span className="font-semibold">Bản nháp</span>
          <span className="text-muted-foreground">Trên thiết bị này · bộ nhớ trình duyệt (localStorage), tự lưu khi gõ</span>
          <code className="ml-auto font-mono text-[11px] text-muted-foreground" title={draftHash}>sha256 {short(draftHash)}</code>
          {draft.code && <Button size="sm" variant="ghost" aria-label="Xem bản nháp" onClick={() => setViewing({ code: draft.code, language: draft.language, title: 'Bản nháp trên thiết bị' })}><Code2 className="size-3.5" /></Button>}
        </li>
        {pending.map((item) => (
          <li key={item.id} className={cn(row, 'ring-1 ring-amber-500/40')}>
            <CloudUpload className="size-3.5 text-amber-600" />
            <span className="font-semibold">Chờ gửi</span>
            <span className="text-muted-foreground">Trên thiết bị này · hàng chờ nộp bài · lưu lúc {stamp(item.savedAt)} · {item.attempts} lần thử{item.lastError ? ` · ${item.lastError}` : ''}</span>
            <code className="ml-auto font-mono text-[11px] text-muted-foreground" title={item.id}>mã nộp {item.id.slice(0, 8)}</code>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Xem mã đang chờ gửi" onClick={() => setViewing({ code: item.payload.code, language: item.payload.language, title: 'Bài đang chờ gửi' })}><Code2 className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label="Tải bản dự phòng" onClick={() => download(item.payload.code, item.payload.language, `bot-du-phong-${item.id.slice(0, 8)}`)}><Download className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label="Bỏ bài khỏi hàng chờ" onClick={() => { remove(item.id); toast('info', 'Đã bỏ bài khỏi hàng chờ') }}><Trash2 className="size-3.5" /></Button>
            </span>
          </li>
        ))}
        <li className={row}>
          <Server className="size-3.5 text-emerald-600" />
          <span className="font-semibold">Máy chủ</span>
          <span className="text-muted-foreground">{serverLoading && !server ? 'Đang kiểm tra…' : server ? `Bài đã nhận lúc ${stamp(server.at)}${server.valid === false ? ' · mã không hợp lệ' : ''}` : online ? 'Chưa nhận bài nào' : 'Không kiểm tra được khi mất mạng'}</span>
          <code className="ml-auto font-mono text-[11px] text-muted-foreground" title={serverHash}>sha256 {short(serverHash)}</code>
          {server?.code && <Button size="sm" variant="ghost" aria-label="Xem bài trên máy chủ" onClick={() => setViewing({ code: server.code!, language: server.language || 'PYTHON', title: 'Bài trên máy chủ' })}><Code2 className="size-3.5" /></Button>}
        </li>
      </ol>
      {viewing && <CodeViewer submission={{ code: viewing.code, language: viewing.language, team_name: viewing.title, submitted_at: Date.now() / 1000 }} onClose={() => setViewing(null)} />}
    </section>
  )
}
