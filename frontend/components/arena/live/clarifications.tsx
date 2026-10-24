'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Globe2, Lock, MessageCircleQuestion, Send, XCircle } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { relative, stamp, type Tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Pagination, Select, SkeletonRows, Tabs, TextArea } from './ui'
import { useLive } from './context'

export const CLAR_TOPICS: Record<string, string> = { RULES: 'Luật thi đấu', TECH: 'Kỹ thuật / nộp bài', SCHEDULE: 'Lịch thi', INCIDENT: 'Sự cố', OTHER: 'Khác' }
const STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Chờ trả lời', tone: 'warning' },
  ANSWERED: { label: 'Đã trả lời', tone: 'success' },
  REJECTED: { label: 'Không trả lời', tone: 'neutral' },
}

function ClarItem({ item, admin, onAnswered }: { item: any; admin?: boolean; onAnswered?: () => void }) {
  const { run, busy } = useLive()
  const [answer, setAnswer] = useState('')
  const [publicAnswer, setPublicAnswer] = useState(true)
  const status = STATUS[item.status] ?? STATUS.OPEN
  return (
    <article className={cn('rounded-xl border p-4', item.status === 'OPEN' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card/60')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Avatar name={item.team_name || 'Đội'} size="sm" />
          <span className="min-w-0 truncate font-semibold">{item.team_name || 'Một đội thi'}</span>
          {admin && item.student_id && <span className="font-mono text-xs text-muted-foreground">{item.student_id}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <Badge>{CLAR_TOPICS[item.topic] ?? item.topic}</Badge>
          {item.public ? <Badge tone="info"><Globe2 className="size-3" />Công khai</Badge> : <Badge><Lock className="size-3" />Riêng</Badge>}
          <Badge tone={status.tone} dot>{status.label}</Badge>
        </span>
      </header>
      <p className="mt-3 whitespace-pre-wrap text-sm">{item.question}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{stamp(item.created_at)} · {relative(item.created_at)}</p>
      {item.answer && (
        <div className="mt-3 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Ban tổ chức trả lời{admin && item.answered_by ? ` · ${item.answered_by}` : ''}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.answer}</p>
        </div>
      )}
      {admin && item.status === 'OPEN' && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void run(() => arenaApi.answerClarification(item.id, { answer, public: publicAnswer }), 'Đã gửi câu trả lời', () => { setAnswer(''); onAnswered?.() }) }}>
          <TextArea rows={3} value={answer} maxLength={2000} onChange={(e) => setAnswer(e.target.value)} placeholder="Nhập câu trả lời…" aria-label="Câu trả lời" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" className="accent-primary" checked={publicAnswer} onChange={(e) => setPublicAnswer(e.target.checked)} />Công khai cho mọi đội (ẩn mã sinh viên)</label>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => arenaApi.answerClarification(item.id, { answer: answer || 'Câu hỏi không thuộc phạm vi trả lời của ban tổ chức.', public: false, status: 'REJECTED' }), 'Đã đóng câu hỏi', onAnswered)}><XCircle className="size-3.5" />Không trả lời</Button>
            <Button size="sm" type="submit" disabled={busy || !answer.trim()}><CheckCircle2 className="size-3.5" />Trả lời</Button>
          </div>
        </form>
      )}
    </article>
  )
}

/** Mục hỏi đáp cho đội thi và khách (trong tab Hướng dẫn thi đấu). */
export function TeamClarifications() {
  const { role, run, busy, tournamentId, scope, openAuth } = useLive()
  const [page, setPage] = useState(1)
  const [topic, setTopic] = useState('RULES')
  const [question, setQuestion] = useState('')
  const list = useResource(`clar:${scope}:${page}`, () => arenaApi.getClarifications({ page }), { ttl: 10_000, refreshMs: 30_000 })
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
      <Card title="Gửi câu hỏi cho Ban tổ chức" subtitle="Hỏi về luật, kỹ thuật, lịch thi hoặc báo sự cố. Câu trả lời riêng chỉ đội bạn thấy; câu trả lời chung được công khai và ẩn tên mã sinh viên.">
        {role === 'TEAM' ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => arenaApi.askClarification({ topic, question, tournament_id: tournamentId }), 'Đã gửi câu hỏi. BTC sẽ trả lời sớm.', () => { setQuestion(''); invalidate('clar:') }) }}>
            <Select label="Chủ đề" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {Object.entries(CLAR_TOPICS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <TextArea label={`Câu hỏi (${question.length}/1000)`} rows={5} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Mô tả rõ câu hỏi; không dán mã nguồn bot của bạn vào đây." />
            <Button type="submit" disabled={busy || !question.trim()}><Send className="size-4" />Gửi câu hỏi</Button>
          </form>
        ) : role === 'ADMIN' ? (
          <p className="text-sm text-muted-foreground">Bạn đang đăng nhập Ban tổ chức — trả lời câu hỏi ở <strong>Quản trị Admin → Hỏi đáp</strong>.</p>
        ) : (
          <EmptyState icon={<MessageCircleQuestion className="size-7" />} title="Đăng nhập để gửi câu hỏi" action={<Button onClick={() => openAuth('login')}>Đăng nhập</Button>} />
        )}
      </Card>
      <Card title={role === 'TEAM' ? 'Câu hỏi của bạn & câu trả lời công khai' : 'Câu trả lời công khai'}>
        {list.loading ? <SkeletonRows rows={3} /> : list.error && !list.data ? <ErrorNote message={list.error.message} onRetry={() => void list.reload()} /> : list.data?.items.length ? (
          <div className="space-y-3">
            {list.data.items.map((item) => <ClarItem key={item.id} item={item} />)}
            <Pagination page={page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
          </div>
        ) : <EmptyState title="Chưa có câu hỏi nào" />}
      </Card>
    </div>
  )
}

/** Hàng đợi trả lời của Ban tổ chức (Quản trị Admin → Hỏi đáp). */
export function AdminClarifications() {
  const [status, setStatus] = useState<'OPEN' | 'ANSWERED' | 'REJECTED' | ''>('OPEN')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [status])
  const list = useResource(`clar:admin:${status}:${page}`, () => arenaApi.getClarifications({ page, status }), { ttl: 5_000, refreshMs: 15_000 })
  return (
    <Card title="Hỏi đáp của các đội" subtitle="Câu hỏi mới cũng xuất hiện ở chuông thông báo." action={
      <Tabs value={status} onChange={setStatus} tabs={[
        { id: 'OPEN', label: 'Chờ trả lời', badge: list.data?.open ? <Badge tone="warning">{list.data.open}</Badge> : undefined },
        { id: 'ANSWERED', label: 'Đã trả lời' }, { id: 'REJECTED', label: 'Đã đóng' }, { id: '', label: 'Tất cả' },
      ]} />
    }>
      {list.loading ? <SkeletonRows rows={4} /> : list.error && !list.data ? <ErrorNote message={list.error.message} onRetry={() => void list.reload()} /> : list.data?.items.length ? (
        <div className="space-y-3">
          {list.data.items.map((item) => <ClarItem key={item.id} item={item} admin onAnswered={() => invalidate('clar:')} />)}
          <Pagination page={page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
        </div>
      ) : <EmptyState icon={<CheckCircle2 className="size-7" />} title={status === 'OPEN' ? 'Không còn câu hỏi chờ trả lời' : 'Chưa có câu hỏi'} />}
    </Card>
  )
}
