'use client'

import { useState } from 'react'
import { Check, CloudOff, Download, Flag, LogIn, Trash2 } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { enqueue, isRetryable, newSubmissionId, remove, type OutboxItem } from '@/lib/outbox'
import { cn } from '@/lib/utils'
import { countdown, qualifierSteps, relative, sameStudent, stamp, shortTime } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, ProgressBar, SectionTitle, Select, Skeleton, SkeletonRows, Stat, StatusBadge } from '../ui'
import { useLive } from '../context'
import { useNow } from '../shared'
import { Workbench } from '../workbench'
import { ChallengesPanel } from '../challenges'
import { Tabs } from '../ui'

function Stepper({ status }: { status: string }) {
  const current = status === 'CLOSING' ? 0 : status === 'PAUSED' ? 2 : Math.max(0, qualifierSteps.indexOf(status as (typeof qualifierSteps)[number]))
  const labels: Record<string, string> = { OPEN: 'Nhận bài', LOCKED: 'Khóa bài', RUNNING: 'Ghép cặp & chấm', FINISHED: 'Hoàn tất', PROMOTED: 'Chốt đội' }
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Tiến trình vòng loại">
      {qualifierSteps.map((step, i) => (
        <li key={step} className="min-w-0">
          <div className={cn('h-1.5 rounded-full', i <= current ? 'bg-primary' : 'bg-muted')} />
          <p className={cn('mt-1.5 truncate text-[11px]', i === current ? 'font-bold text-foreground' : 'text-muted-foreground')}>
            {i < current && <Check className="mr-0.5 inline size-3" aria-hidden />}{labels[step]}
          </p>
        </li>
      ))}
    </ol>
  )
}

function OutboxPanel({ items }: { items: OutboxItem[] }) {
  const { flushOutbox, toast } = useLive()
  if (!items.length) return null
  const download = (item: OutboxItem) => {
    const blob = new Blob([item.payload.code], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bot-du-phong-${item.id.slice(0, 8)}.${item.payload.language === 'CPP' ? 'cpp' : 'py'}`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300"><CloudOff className="size-4" />{items.length} bài đang lưu trên thiết bị, chưa được server xác nhận</p>
      <p className="mt-1 text-xs text-muted-foreground">Bài sẽ tự gửi lại khi có mạng. “Đã lưu trên máy” chưa phải “server đã nhận”: hãy giữ trang này và nối mạng trước hạn nộp.</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-xs">
            <span>{stamp(item.savedAt)} · {item.payload.language} · {item.attempts} lần thử{item.lastError ? ` · ${item.lastError}` : ''}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => download(item)}><Download className="size-3.5" />Tải bản dự phòng</Button>
              <Button size="sm" variant="ghost" aria-label="Bỏ bài này" onClick={() => { remove(item.id); toast('info', 'Đã bỏ bài khỏi hàng chờ') }}><Trash2 className="size-3.5" /></Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3"><Button size="sm" onClick={() => void flushOutbox()}>Gửi lại ngay</Button></div>
    </div>
  )
}

export function QualifierView() {
  const { qualifiers, qualifierId, setQualifierId, role, session, scope, run, toast, openAuth, outbox, navigate } = useLive()
  const now = useNow()
  const [submitting, setSubmitting] = useState(false)
  const [section, setSection] = useState<'main' | 'challenge'>('main')
  const event0 = qualifiers.data?.find((q) => q.id === qualifierId)
  const detail = useResource<any>(
    qualifierId ? `q:detail:${scope}:${qualifierId}` : null,
    () => arenaApi.getQualifier(qualifierId),
    { ttl: 5_000, refreshMs: event0?.status === 'RUNNING' ? 8_000 : 20_000 },
  )
  const top = useResource<any>(qualifierId ? `q:rank:${qualifierId}:1` : null, () => arenaApi.getQualifierRanking(qualifierId, 1), { ttl: 10_000, refreshMs: 20_000 })
  const event = detail.data?.event ?? event0
  const participant = detail.data?.participant
  const registered = !!participant?.student_id
  const history: any[] = detail.data?.history || []
  const results: any[] = detail.data?.results || []
  const deadline = Number(event?.deadline || 0) * 1000
  const open = event?.status === 'OPEN' && (!deadline || now < deadline)
  const mine = outbox.filter((o) => o.kind !== 'match' && o.qualifierId === qualifierId)

  let blocked = ''
  if (!event) blocked = ''
  else if (!registered) blocked = 'Hãy đăng ký tham gia vòng loại trước khi nộp bài.'
  else if (event.status !== 'OPEN') blocked = 'Vòng loại không còn nhận bài.'
  else if (deadline && now >= deadline) blocked = 'Đã quá hạn nộp bài.'

  async function submit(value: { code: string; language: string; commit?: { url: string; sha: string } }) {
    if (event?.git_mode && !value.commit) {
      toast('error', 'Vòng này yêu cầu lấy mã từ GitHub (có commit). Hãy dùng nút “Lấy từ GitHub”.')
      return
    }
    const id = newSubmissionId()
    const payload = { code: value.code, language: value.language, git_repo_url: value.commit?.url, git_commit_hash: value.commit?.sha }
    setSubmitting(true)
    try {
      await arenaApi.submitQualifier(qualifierId, payload, id)
      toast('success', 'Server đã nhận bài và đưa vào hàng đợi chấm.')
      invalidate('q:')
    } catch (e) {
      if (isRetryable(e) && session.student_id) {
        enqueue({ id, studentId: session.student_id, qualifierId, payload })
        toast('info', 'Chưa gửi được tới server. Bài đã lưu trên thiết bị và sẽ tự gửi lại khi có mạng.')
      } else {
        toast('error', e instanceof Error ? e.message : 'Bài bị từ chối')
      }
    } finally { setSubmitting(false) }
  }

  const sectionTabs = (
    <Tabs value={section} onChange={setSection} tabs={[{ id: 'main', label: 'Vòng loại' }, { id: 'challenge', label: '🏅 Thử thách' }]} />
  )
  if (section === 'challenge') {
    return (
      <div className="space-y-6">
        <SectionTitle eyebrow="Luyện tập" title="Thử thách & huy hiệu">{sectionTabs}</SectionTitle>
        <ChallengesPanel />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Vòng tuyển chọn" title="Vòng loại">
        {sectionTabs}
        {qualifiers.data?.length ? (
          <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="w-64">
            {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </Select>
        ) : null}
      </SectionTitle>

      {qualifiers.loading ? <Skeleton className="h-40 w-full rounded-2xl" /> : !qualifiers.data?.length ? (
        <Card><EmptyState icon={<Flag className="size-7" />} title="Chưa có vòng loại" hint="Ban tổ chức sẽ mở vòng loại trong khu Quản trị." /></Card>
      ) : detail.loading ? <Skeleton className="h-64 w-full rounded-2xl" /> : detail.error && !detail.data ? <ErrorNote message={detail.error.message} onRetry={() => void detail.reload()} /> : event && (
        <>
          <Card
            title={event.name}
            action={<StatusBadge status={event.status} />}
          >
            <div className="space-y-5">
              <Stepper status={event.status} />
              {event.status === 'PAUSED' && <Badge tone="warning">Đang tạm dừng sau lượt hiện tại</Badge>}
              {event.error && <ErrorNote message={event.error} />}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label={open ? 'Còn lại để nộp bài' : 'Hạn nộp bài'} value={open ? countdown(Math.floor((deadline - now) / 1000)) : shortTime(event.deadline)} hint={deadline ? relative(event.deadline, now) : undefined} />
                <Stat label="Lượt ghép cặp" value={`${event.applied_round ?? event.current_round ?? 0}/${event.rounds}`} />
                <Stat label="Đội đủ điều kiện" value={event.eligible ?? '—'} hint={`Chọn top ${event.top_k} vào giải chính`} />
                <Stat label="Trận đã chấm" value={`${event.completed ?? 0}/${event.total ?? 0}`} />
              </div>
              {event.total > 0 && <ProgressBar value={event.completed || 0} max={event.total} label="Tiến độ chấm lượt hiện tại" />}
            </div>
          </Card>

          {role === 'GUEST' && (
            <Card><EmptyState icon={<LogIn className="size-7" />} title="Đăng nhập để tham gia vòng loại" hint="Bạn vẫn xem được xếp hạng và tiến độ mà không cần đăng nhập." action={<Button onClick={() => openAuth('login')}>Đăng nhập</Button>} /></Card>
          )}

          {role === 'ADMIN' && <Card><p className="text-sm text-muted-foreground">Bạn đang xem với quyền quản trị. Thao tác điều hành vòng loại nằm ở <button className="font-semibold text-primary hover:underline" onClick={() => navigate('admin')}>Quản trị Admin → Vòng loại</button>.</p></Card>}

          {role === 'TEAM' && (
            <>
              <Card title="Đội của bạn" action={registered ? <Badge tone="success">Đã đăng ký</Badge> : <Badge>Chưa đăng ký</Badge>}>
                {registered ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="ELO" value={Number(participant.elo).toFixed(1)} />
                    <Stat label="Thắng / Trận" value={`${participant.wins}/${participant.played}`} />
                    <Stat label="Lượt nghỉ" value={participant.byes} />
                    <Stat label="Trạng thái bài" value={participant.locked_id ? 'Đã khóa' : participant.pending_submissions ? 'Đang kiểm tra' : participant.valid_id ? 'Có bản hợp lệ' : history.length ? 'Chưa hợp lệ' : 'Chưa nộp'} />
                  </div>
                ) : (
                  <EmptyState title="Bạn chưa đăng ký vòng loại này" action={<Button disabled={event.status !== 'OPEN'} onClick={() => void run(() => arenaApi.registerQualifier(qualifierId), 'Đã đăng ký vòng loại', () => invalidate('q:'))}>Đăng ký tham gia</Button>} />
                )}
              </Card>

              <Card title="Nộp bài vòng loại" subtitle={`Bản hợp lệ cuối cùng sẽ được khóa khi hết hạn. Hỗ trợ Python và C++. ${event.git_mode ? 'Vòng này bắt buộc lấy mã từ GitHub.' : ''}`}>
                <div className="space-y-4">
                  <OutboxPanel items={mine} />
                  <Workbench
                    draftKey={`qualifier:${qualifierId}:${session.student_id}`}
                    submitLabel="Gửi tới hàng đợi chấm"
                    submitting={submitting}
                    submitDisabledReason={blocked}
                    onSubmit={submit}
                  />
                </div>
              </Card>

              <Card title="Lịch sử bài nộp">
                {history.length ? (
                  <DataTable head={['Thời gian', 'Mã bài', 'Ngôn ngữ', 'Kết quả', 'Chi tiết']}>
                    {history.map((h) => (
                      <tr key={h.id} className="align-top">
                        <td className="px-3 py-2.5 whitespace-nowrap">{stamp(h.at)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{String(h.id).slice(0, 10)}</td>
                        <td className="px-3 py-2.5">{h.language}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={h.status || (h.valid ? 'VALID' : 'INVALID')} />{participant?.locked_id === h.id && <Badge tone="info" className="ml-2">Đã khóa</Badge>}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{h.error || (h.git_commit_hash ? `GitHub ${h.git_commit_hash}` : '')}</td>
                      </tr>
                    ))}
                  </DataTable>
                ) : <EmptyState title="Chưa có bài nộp" />}
              </Card>

              <Card title="Kết quả các lượt ghép cặp">
                {results.length ? (
                  <DataTable head={['Lượt', 'Đối thủ', 'Trạng thái', 'ELO trước → sau']}>
                    {results.map((job) => {
                      const isA = sameStudent(job.a, session.student_id)
                      const before = isA ? job.before_a : job.before_b
                      const after = isA ? job.after_a : job.after_b
                      return (
                        <tr key={job.id}>
                          <td className="px-3 py-2.5 tabular-nums">{job.round}</td>
                          <td className="px-3 py-2.5">{isA ? job.b : job.a}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={job.status} /></td>
                          <td className="px-3 py-2.5 tabular-nums">{job.status === 'DONE' ? `${Number(before).toFixed(1)} → ${Number(after).toFixed(1)}` : '—'}</td>
                        </tr>
                      )
                    })}
                  </DataTable>
                ) : <EmptyState title="Chưa có lượt chấm nào" hint="Kết quả xuất hiện sau khi ban tổ chức bắt đầu ghép cặp." />}
              </Card>
            </>
          )}

          <Card title="Top 10 vòng loại" action={<button className="text-xs font-semibold text-primary hover:underline" onClick={() => navigate('ranking')}>Xem đầy đủ →</button>}>
            {top.loading ? <SkeletonRows rows={5} /> : top.data?.items.length ? (
              <ol className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {top.data.items.slice(0, 10).map((r: any) => (
                  <li key={r.student_id} className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm', sameStudent(r.student_id, session.student_id) && 'bg-primary/10')}>
                    <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.team_name}</span>
                    <span className="font-semibold tabular-nums">{Number(r.elo).toFixed(1)}</span>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="Chưa có kết quả" />}
          </Card>
        </>
      )}
    </div>
  )
}
