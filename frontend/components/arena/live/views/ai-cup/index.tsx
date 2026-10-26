'use client'

import { useEffect, useState } from 'react'
import { Ban, BookOpenCheck, BrainCircuit, CalendarClock, Check, CheckCircle2, Circle, ClipboardList, Cpu, FileText, Flag, ListChecks, ListOrdered, LogIn, Medal, Swords, Timer, Trophy, Users } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { qualifierSteps, relative, shortTime } from '@/lib/format'
import { Badge, Button, Card, EmptyState, ErrorNote, Select, Skeleton, StatusBadge, Tabs } from '../../ui'
import { useLive } from '../../context'
import { useNow } from '../../shared'
import { STEP_LABEL, TECH_SHORT } from './common'
import { TaskTab } from './task'
import { SubmitTab } from './submit'
import { BoardTab, MyResults } from './board'
import { MainTab } from './main'
import { ReportTab } from './report'
import { AiBadges } from './badges'

const TINT: Record<string, [string, string]> = {
  OPEN: ['#8b5cf6', '#06b6d4'], CLOSING: ['#8b5cf6', '#06b6d4'], LOCKED: ['#6366f1', '#06b6d4'],
  RUNNING: ['#ec4899', '#8b5cf6'], PAUSED: ['#64748b', '#8b5cf6'], FINISHED: ['#10b981', '#06b6d4'], PROMOTED: ['#10b981', '#f59e0b'],
}

function Stepper({ status }: { status: string }) {
  const current = status === 'CLOSING' ? 0 : status === 'PAUSED' ? 2 : Math.max(0, qualifierSteps.indexOf(status as (typeof qualifierSteps)[number]))
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Tiến trình vòng loại AI">
      {qualifierSteps.map((step, i) => (
        <li key={step} className="min-w-0">
          <div className={cn('h-1.5 rounded-full transition-colors', i < current ? 'bg-primary' : i === current ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,.8)]' : 'bg-muted')} />
          <p className={cn('mt-1.5 truncate text-[11px]', i === current ? 'font-bold text-foreground' : 'text-muted-foreground')}>{i < current && <Check className="mr-0.5 inline size-3" aria-hidden />}{STEP_LABEL[step]}</p>
        </li>
      ))}
    </ol>
  )
}

function Countdown({ seconds }: { seconds: number }) {
  const s = Math.max(0, seconds)
  const parts: [number, string][] = [[Math.floor(s / 86400), 'ngày'], [Math.floor((s % 86400) / 3600), 'giờ'], [Math.floor((s % 3600) / 60), 'phút'], [s % 60, 'giây']]
  return (
    <div className="flex gap-2" role="timer" aria-label="Thời gian còn lại để nộp mô hình">
      {parts.map(([v, label]) => (
        <div key={label} className="min-w-14 rounded-xl bg-card/90 px-2 py-1.5 text-center shadow-sm ring-1 ring-border">
          <div className="font-display text-2xl font-black tabular-nums leading-none">{String(v).padStart(2, '0')}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  )
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card/80 px-3 py-2.5 shadow-sm ring-1 ring-border">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><span className="text-primary">{icon}</span>{label}</p>
      <p className="font-display mt-0.5 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  )
}

/** Bốn bước của một đội ở vòng loại AI, tự đánh dấu theo trạng thái thật; nút chính luôn dẫn tới bước chưa xong đầu tiên. */
function TeamSteps({ tasksMode, tasksReady, declared, hasModel, locked, open, go }: { tasksMode: boolean; tasksReady: boolean; declared: boolean; hasModel: boolean; locked: boolean; open: boolean; go: (s: Section) => void }) {
  const steps: { title: string; done: boolean; hint: string; to: Section; label: string; blocked?: boolean }[] = [
    { title: 'Xem đề và tải dữ liệu', done: tasksReady, hint: tasksReady ? 'Đọc đề ở tab “Đề bài & dữ liệu”.' : 'Ban tổ chức chưa công bố bộ đề. Trang sẽ tự cập nhật khi có đề.', to: 'task', label: 'Xem đề', blocked: !tasksReady },
    { title: 'Chấm thử rồi nộp mô hình', done: hasModel, hint: !tasksReady ? 'Chưa nộp được vì đề chưa công bố.' : hasModel ? 'Bạn đã có mô hình hợp lệ. Có thể nộp bản tốt hơn trước hạn.' : 'Ở tab “Nộp mô hình”: bấm “Chấm thử” để thử trên máy, rồi “Gửi mô hình”.', to: 'submit', label: 'Nộp mô hình', blocked: !tasksReady || !open },
    { title: 'Khai báo kỹ thuật bạn dùng', done: declared, hint: declared ? 'Đã khai báo.' : 'Chọn kỹ thuật và mô tả ngắn ở đầu tab “Nộp mô hình” rồi bấm “Lưu khai báo”.', to: 'submit', label: 'Khai báo', blocked: !tasksReady },
    { title: 'Theo dõi điểm và nộp báo cáo kỹ thuật', done: false, hint: locked ? 'Mô hình đã khóa. Xem bảng điểm; nếu vào giải chính hãy nộp báo cáo kỹ thuật.' : 'Sau hạn, bảng điểm chính thức mở. Đội vào giải chính nộp báo cáo kỹ thuật ở tab “Báo cáo kỹ thuật”.', to: 'board', label: 'Xem bảng điểm', blocked: false },
  ]
  const next = steps.find((s) => !s.done && !s.blocked) || steps.find((s) => !s.done)
  return (
    <Card icon={<ListChecks />} title="Việc của đội bạn" subtitle="Làm lần lượt; bước sáng là việc nên làm tiếp">
      <ol className="space-y-2" data-testid="ai-team-steps">
        {steps.map((s, i) => (
          <li key={s.title} data-done={s.done ? '1' : '0'} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm', s === next ? 'border-primary/50 bg-primary/5' : 'border-border', s.done && 'opacity-70')}>
            {s.done ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Đã xong" /> : <Circle className={cn('size-5 shrink-0', s === next && 'text-primary')} aria-label="Chưa làm" />}
            <div className="min-w-0 flex-1"><p className="font-semibold">{i + 1}. {s.title}</p><p className="text-xs text-muted-foreground">{s.hint}</p></div>
            {!s.done && <Button size="sm" variant={s === next ? 'primary' : 'secondary'} disabled={s.blocked && s !== next} onClick={() => go(s.to)}>{s.label}</Button>}
          </li>
        ))}
      </ol>
    </Card>
  )
}

type Section = 'overview' | 'task' | 'submit' | 'board' | 'main' | 'report'

export function AiCupView() {
  const { aiEvents, aiEventId, setAiEventId, role, session, scope, run, openAuth, navigate } = useLive()
  const now = useNow()
  const [section, setSection] = useState<Section>('overview')
  const list = aiEvents.data
  const event0 = list?.find((q) => q.id === aiEventId)
  const detail = useResource<any>(aiEventId ? `q:ai:detail:${scope}:${aiEventId}` : null, () => arenaApi.getQualifier(aiEventId), { ttl: 5_000, refreshMs: event0?.status === 'RUNNING' ? 8_000 : 20_000 })
  const problem = useResource<any>(aiEventId ? `q:ai:problem:${aiEventId}` : null, () => arenaApi.getAiCupProblem(aiEventId), { ttl: 60_000, refreshMs: event0?.mode === 'TASKS' && !event0?.tasks_locked ? 10_000 : undefined })
  const mine = useResource<any>(aiEventId && role !== 'GUEST' ? `q:ai:mine:${scope}:${aiEventId}` : null, () => arenaApi.getAiCupMine(aiEventId), { ttl: 5_000, refreshMs: event0?.status === 'RUNNING' ? 8_000 : 20_000 })
  const event = detail.data?.event ?? event0
  const participant = detail.data?.participant
  const registered = !!participant?.student_id
  const deadline = Number(event?.deadline || 0) * 1000
  const open = event?.status === 'OPEN' && (!deadline || now < deadline)

  let blocked = ''
  if (!event) blocked = ''
  else if (participant?.banned) blocked = `Đội đã bị loại khỏi vòng loại: ${participant.ban_reason || ''}`
  else if (!registered) blocked = 'Hãy đăng ký tham gia vòng loại trước khi nộp mô hình.'
  else if (event.status !== 'OPEN') blocked = 'Vòng loại không còn nhận mô hình.'
  else if (deadline && now >= deadline) blocked = 'Đã quá hạn nộp.'

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Tổng quan', icon: <BrainCircuit className="size-4" /> },
    { id: 'task', label: 'Đề bài & dữ liệu', icon: <BookOpenCheck className="size-4" /> },
    ...(role === 'TEAM' ? [{ id: 'submit' as const, label: 'Nộp mô hình', icon: <ClipboardList className="size-4" /> }] : []),
    { id: 'board', label: 'Bảng điểm', icon: <ListOrdered className="size-4" /> },
    { id: 'main', label: 'Giải chính AI', icon: <Trophy className="size-4" /> },
    { id: 'report', label: 'Báo cáo kỹ thuật', icon: <FileText className="size-4" /> },
  ]
  useEffect(() => { if (!tabs.some((t) => t.id === section)) setSection('overview') }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  if (aiEvents.loading) return <Skeleton className="h-72 w-full rounded-3xl" />
  if (!list?.length) {
    return (
      <Card>
        <EmptyState icon={<BrainCircuit className="size-7" />} title="Giải AI chưa mở" hint="Ban tổ chức sẽ mở vòng loại Giải AI trong khu Quản trị. Đây là cuộc thi viết mô hình học máy đọc lối chơi của đối thủ." />
      </Card>
    )
  }
  const rounds = event?.rounds || 0

  return (
    <div className="space-y-6">
      {detail.loading && !event ? <Skeleton className="h-72 w-full rounded-3xl" /> : detail.error && !detail.data ? <ErrorNote message={detail.error.message} onRetry={() => void detail.reload()} /> : event && (
        <section className="banner-soft relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ ['--tint-a' as string]: (TINT[event.status] || TINT.OPEN)[0], ['--tint-b' as string]: (TINT[event.status] || TINT.OPEN)[1] }}>
          <div className="aurora-blob pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--tint-b)' }} aria-hidden />
          <div className="aurora-blob-slow pointer-events-none absolute -bottom-28 left-6 -z-10 size-72 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--tint-a)' }} aria-hidden />
          <div className="soft-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.25em] text-primary"><BrainCircuit className="size-4" />Giải AI · Vòng loại mô hình</p>
                <h1 className="font-display mt-1 text-3xl font-black sm:text-4xl" data-testid="ai-event-name">{event.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <StatusBadge status={event.status} />
                  {event.status === 'PAUSED' && <Badge tone="warning">Tạm dừng sau lượt hiện tại</Badge>}
                  <span className="flex items-center gap-1"><CalendarClock className="size-4 text-primary" />Hạn nộp {shortTime(event.deadline)}{deadline ? ` · ${relative(event.deadline, now)}` : ''}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {list.length > 1 && (
                  <Select aria-label="Chọn vòng loại AI" value={aiEventId} onChange={(e) => setAiEventId(e.target.value)} className="w-full sm:w-60">
                    {list.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </Select>
                )}
                {open && <Countdown seconds={Math.floor((deadline - now) / 1000)} />}
              </div>
            </div>
            <Stepper status={event.status} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat icon={<Swords className="size-3.5" />} label="Lượt đã chấm" value={`${event.applied_round ?? 0}/${rounds}`} />
              <HeroStat icon={<Users className="size-3.5" />} label="Mô hình đủ điều kiện" value={event.eligible ?? '—'} />
              <HeroStat icon={<Medal className="size-3.5" />} label="Đội vào giải chính" value={`${event.top_k} đội đầu`} />
              <HeroStat icon={<Timer className="size-3.5" />} label="Lượt chấm đã xong" value={`${event.completed ?? 0}/${event.total ?? 0}`} />
            </div>
            {event.error && <ErrorNote message={event.error} />}
          </div>
        </section>
      )}

      {event && role === 'GUEST' && (
        <Card><EmptyState icon={<LogIn className="size-7" />} title="Đăng nhập để tham gia Giải AI" hint="Bạn vẫn xem được đề bài, dữ liệu mẫu và bảng điểm mà không cần đăng nhập." action={<Button onClick={() => openAuth('login')}>Đăng nhập</Button>} /></Card>
      )}
      {event && role === 'ADMIN' && <Card><p className="text-sm text-muted-foreground">Bạn đang xem với quyền quản trị. Điều hành Giải AI nằm ở <button className="font-semibold text-primary hover:underline" onClick={() => navigate('admin')}>Quản trị Admin → Giải AI</button>.</p></Card>}

      {event && role === 'TEAM' && (
        participant?.banned ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            <Ban className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Đội đã bị ban tổ chức loại khỏi vòng loại này.</p>{participant.ban_reason && <p className="mt-1">Lý do: {participant.ban_reason}</p>}</div>
          </div>
        ) : registered ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="ai-my-status">
            {[
              ['Điểm công khai', mine.data?.rounds_done ? Number(mine.data.public).toFixed(1) : '—'],
              ['Số lượt đã chấm', `${mine.data?.rounds_done ?? 0}/${rounds}`],
              ['Kỹ thuật khai báo', mine.data?.technique ? TECH_SHORT[mine.data.technique] || mine.data.technique : 'Chưa khai báo'],
              ['Mô hình của bạn', participant.locked_id ? 'Đã khóa' : participant.pending_submissions ? 'Đang kiểm tra' : participant.valid_id ? 'Có bản hợp lệ' : (detail.data?.history || []).length ? 'Chưa hợp lệ' : 'Chưa nộp'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display mt-1 text-xl font-extrabold tabular-nums">{value}</p></div>
            ))}
          </div>
        ) : (
          <Card><EmptyState icon={<Flag className="size-7" />} title="Bạn chưa đăng ký vòng loại AI này" hint="Đăng ký để nộp mô hình và được chấm trên bộ đề ẩn." action={<div className="space-y-2"><Button disabled={event.status !== 'OPEN'} data-testid="ai-register" onClick={() => void run(() => arenaApi.registerQualifier(aiEventId), 'Đã đăng ký vòng loại AI', () => invalidate('q'))}>Đăng ký tham gia</Button>{event.status !== 'OPEN' && <p className="text-xs text-muted-foreground">Vòng loại không còn nhận đăng ký.</p>}</div>} /></Card>
        )
      )}

      {event && <Tabs value={section} onChange={setSection} tabs={tabs} />}

      {event && section === 'overview' && (
        <div className="space-y-6">
          {role === 'TEAM' && registered && !participant?.banned && (
            <TeamSteps
              tasksMode={problem.data?.mode === 'TASKS'}
              tasksReady={problem.data?.mode !== 'TASKS' || !!problem.data?.tasks_locked}
              declared={!!mine.data?.technique}
              hasModel={!!(participant?.valid_id || participant?.locked_id)}
              locked={!!participant?.locked_id}
              open={open}
              go={setSection}
            />
          )}
          <Card icon={<Cpu />} title="Giải AI vận hành thế nào" subtitle="Cùng cơ chế vòng loại → giải chính như giải thường, nhưng thi bằng mô hình học máy">
            <ol className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              {(problem.data?.mode === 'TASKS' ? [
                ['1. Đọc đề, tải dữ liệu', 'Mỗi đề là một bài toán học máy nhỏ về bàn cờ 9×9. Tải dữ liệu có đáp án của từng đề để học.'],
                ['2. Huấn luyện & chấm thử', 'Viết hàm solve, bấm “Chấm thử” để thấy điểm ước lượng và thế cờ đoán đúng/sai ngay trên máy bạn.'],
                ['3. Nộp trước hạn', 'Nộp Python thuần (tối đa 64 KB). Bản hợp lệ cuối cùng được khóa khi hết hạn.'],
                ['4. Chấm trên thế cờ ẩn', `Máy chủ chấm ${rounds || 'nhiều'} lượt trên thế cờ bạn chưa từng thấy. ${event.top_k} đội đứng đầu vào giải chính (đấu loại trực tiếp, thắng 3 trong 5 hiệp) và nộp báo cáo kỹ thuật để giám khảo chấm (Giải Kỹ thuật).`],
              ] : [
                ['1. Đọc đề, tải dữ liệu', 'Hiểu bài toán đọc đối thủ oẳn tù tì, tải bộ dữ liệu huấn luyện công khai.'],
                ['2. Huấn luyện & chấm thử', 'Tự xây mô hình, chấm thử trên máy bằng đúng bộ đối thủ công khai trước khi nộp.'],
                ['3. Nộp trước hạn', 'Nộp Python thuần (≤ 64 KB). Bản hợp lệ cuối cùng được khóa khi hết hạn.'],
                ['4. Chấm trên bộ ẩn', `Máy chủ chấm ${rounds || 'nhiều'} lượt trên bộ đề ẩn. ${event.top_k} đội đứng đầu vào giải chính (đấu loại trực tiếp, thắng 3 trong 5 hiệp) và nộp báo cáo kỹ thuật để giám khảo chấm (Giải Kỹ thuật).`],
              ]).map(([title, body]) => (
                <li key={title} className="rounded-xl border border-border p-4"><p className="font-semibold">{title}</p><p className="mt-1.5 text-muted-foreground">{body}</p></li>
              ))}
            </ol>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setSection('task')}><BookOpenCheck className="size-4" />Xem đề bài và dữ liệu</Button>
            {role === 'TEAM' && <Button variant="secondary" onClick={() => setSection('submit')}><ClipboardList className="size-4" />Nộp mô hình</Button>}
            <Button variant="secondary" onClick={() => setSection('board')}><ListOrdered className="size-4" />Xem bảng điểm</Button>
          </div>
          {role === 'TEAM' && <MyResults mine={mine.data} tasks={problem.data?.mode === 'TASKS' ? problem.data.tasks || [] : undefined} />}
          {role === 'TEAM' && session.student_id && <AiBadges sid={session.student_id} />}
        </div>
      )}

      {event && section === 'task' && <TaskTab eventId={aiEventId} problem={problem} />}
      {event && section === 'submit' && role === 'TEAM' && problem.data && (
        <SubmitTab eventId={aiEventId} event={event} problem={problem.data} detail={detail} mine={mine.data} blocked={blocked} onMineChange={() => void mine.reload()} />
      )}
      {event && section === 'board' && <BoardTab eventId={aiEventId} event={event} mine={mine.data} mineId={session.student_id} tasks={problem.data?.mode === 'TASKS' ? problem.data.tasks || [] : undefined} />}
      {event && section === 'main' && <MainTab />}
      {event && section === 'report' && <ReportTab />}
    </div>
  )
}
