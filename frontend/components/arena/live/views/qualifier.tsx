'use client'

import { useEffect, useState } from 'react'
import { Award, Ban, CalendarClock, Check, ClipboardList, Code2, Flag, Flame, LineChart, ListOrdered, LogIn, Medal, Swords, Timer, Trophy, Users } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { enqueue, isRetryable, newSubmissionId } from '@/lib/outbox'
import { cn } from '@/lib/utils'
import { qualifierSteps, relative, sameStudent, stamp, shortTime } from '@/lib/format'
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorNote, Pagination, ProgressBar, Select, Skeleton, SkeletonRows, StatusBadge, Tabs } from '../ui'
import { useLive } from '../context'
import { useNow } from '../shared'
import { Workbench } from '../workbench'
import { SyncStatusCard } from '../sync-status'
import { ChallengesPanel } from '../challenges'
import { ScoreHistoryTable, scoreRows } from '../qualifier-extras'
import { CodeViewer } from '../replay-viewer'
import { Podium, RankBadge, SummaryStat, WinRate } from './ranking'

/** Hai màu pha cho banner theo trạng thái vòng loại (loang từ hai góc trên). */
const TINT: Record<string, [string, string]> = {
  OPEN: ['#8b5cf6', '#38bdf8'], CLOSING: ['#8b5cf6', '#38bdf8'], LOCKED: ['#3b82f6', '#06b6d4'],
  RUNNING: ['#f97316', '#ec4899'], PAUSED: ['#64748b', '#8b5cf6'], FINISHED: ['#10b981', '#06b6d4'], PROMOTED: ['#10b981', '#f59e0b'],
}

const STEP_LABEL: Record<string, string> = { OPEN: 'Nhận bài', LOCKED: 'Khóa bài', RUNNING: 'Ghép cặp & chấm', FINISHED: 'Hoàn tất', PROMOTED: 'Chốt đội' }

function Stepper({ status }: { status: string }) {
  const current = status === 'CLOSING' ? 0 : status === 'PAUSED' ? 2 : Math.max(0, qualifierSteps.indexOf(status as (typeof qualifierSteps)[number]))
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Tiến trình vòng loại">
      {qualifierSteps.map((step, i) => (
        <li key={step} className="min-w-0">
          <div className={cn('h-1.5 rounded-full transition-colors', i < current ? 'bg-primary' : i === current ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,.8)]' : 'bg-muted')} />
          <p className={cn('mt-1.5 truncate text-[11px]', i === current ? 'font-bold text-foreground' : 'text-muted-foreground')}>
            {i < current && <Check className="mr-0.5 inline size-3" aria-hidden />}{STEP_LABEL[step]}
          </p>
        </li>
      ))}
    </ol>
  )
}

/** Đồng hồ đếm ngược dạng ô số lớn. */
function Countdown({ seconds }: { seconds: number }) {
  const s = Math.max(0, seconds)
  const parts: [number, string][] = [[Math.floor(s / 86400), 'ngày'], [Math.floor((s % 86400) / 3600), 'giờ'], [Math.floor((s % 3600) / 60), 'phút'], [s % 60, 'giây']]
  return (
    <div className="flex gap-2" role="timer" aria-label="Thời gian còn lại để nộp bài">
      {parts.map(([v, label]) => (
        <div key={label} className="min-w-14 rounded-xl bg-card/90 px-2 py-1.5 text-center shadow-sm ring-1 ring-border backdrop-blur-md">
          <div className="font-display text-2xl font-black tabular-nums leading-none text-foreground">{String(v).padStart(2, '0')}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  )
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card/80 px-3 py-2.5 shadow-sm ring-1 ring-border backdrop-blur-md transition hover:bg-card">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><span className="text-primary">{icon}</span>{label}</p>
      <p className="font-display mt-0.5 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  )
}

function RankingPanel({ qid, mine }: { qid: string; mine?: string }) {
  const { qualifiers } = useLive()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [qid])
  const ranking = useResource<any>(`q:rank:${qid}:${page}`, () => arenaApi.getQualifierRanking(qid, page), { ttl: 10_000, refreshMs: 20_000 })
  const items: any[] = ranking.data?.items || []
  const topK = Number(qualifiers.data?.find((q) => q.id === qid)?.top_k) || 0
  if (ranking.loading) return <Card><SkeletonRows rows={6} /></Card>
  if (!items.length) return <Card><EmptyState icon={<ListOrdered className="size-6" />} title="Chưa có bảng xếp hạng" hint="Bảng xếp hạng hiện khi bài được khóa và bắt đầu ghép cặp." /></Card>
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat icon={<Users className="size-5" />} label="Đội trên bảng" value={ranking.data?.total ?? items.length} />
        <SummaryStat icon={<Trophy className="size-5" />} label="ELO cao nhất" value={`${Number(items[0]?.elo).toFixed(1)} · ${items[0]?.team_name ?? ''}`} />
        <SummaryStat icon={<Flame className="size-5" />} label="Vào giải chính" value={topK ? `Top ${topK}` : '—'} />
      </div>
      {page === 1 && items.length >= 3 && <Podium rows={items.slice(0, 3)} />}
      <Card icon={<ListOrdered />} title="Bảng xếp hạng" subtitle="Xếp theo ELO; bằng nhau thì xét độ khó đối thủ">
        <DataTable head={['Hạng', 'Đội', 'ELO', 'Thắng / Trận', 'Tỉ lệ thắng', 'Nghỉ']}>
          {items.map((r) => (
            <tr key={r.student_id} className={cn(r.rank === 1 && 'bg-gradient-to-r from-amber-400/15 to-transparent', r.rank === 2 && 'bg-gradient-to-r from-slate-300/15 to-transparent', r.rank === 3 && 'bg-gradient-to-r from-orange-400/15 to-transparent', sameStudent(r.student_id, mine) && '!bg-primary/10')}>
              <td className="w-14 px-3 py-2"><RankBadge rank={r.rank} /></td>
              <td className="px-3 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><Avatar name={r.team_name} size="sm" />{r.team_name}</span>{sameStudent(r.student_id, mine) && <Badge tone="accent" className="ml-2">Bạn</Badge>}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.student_id}</span></td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{Number(r.elo).toFixed(1)}</td>
              <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.played}</td>
              <td className="px-3 py-2.5"><WinRate value={r.played ? Math.round((r.wins / r.played) * 100) : 0} /></td>
              <td className="px-3 py-2.5 tabular-nums">{r.byes}</td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={ranking.data?.page_size || 50} total={ranking.data?.total || items.length} onChange={setPage} />
      </Card>
    </div>
  )
}

type Section = 'submit' | 'ranking' | 'score' | 'challenge'

export function QualifierView() {
  const { qualifiers, qualifierId, setQualifierId, role, session, scope, run, toast, openAuth, outbox, navigate } = useLive()
  const now = useNow()
  const [submitting, setSubmitting] = useState(false)
  const [section, setSection] = useState<Section>(role === 'TEAM' ? 'submit' : 'ranking')
  const [viewing, setViewing] = useState<any>(null)
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
  const myRank = (top.data?.items || []).find((r: any) => sameStudent(r.student_id, session.student_id))?.rank
  const rows = scoreRows(results, session.student_id || '')
  const streak = (() => { let n = 0; for (const r of [...rows].reverse()) { if (r.outcome === 'WIN') n++; else if (r.outcome === 'LOSS') break } return n })()

  let blocked = ''
  if (!event) blocked = ''
  else if (participant?.banned) blocked = `Đội đã bị loại khỏi vòng loại: ${participant.ban_reason || ''}`
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

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    ...(role === 'TEAM' ? [{ id: 'submit' as const, label: 'Nộp bài', icon: <ClipboardList className="size-4" /> }] : []),
    { id: 'ranking', label: 'Xếp hạng', icon: <ListOrdered className="size-4" /> },
    ...(role === 'TEAM' ? [{ id: 'score' as const, label: 'Lịch sử điểm', icon: <LineChart className="size-4" /> }] : []),
    { id: 'challenge', label: 'Thử thách', icon: <Award className="size-4" /> },
  ]
  useEffect(() => { if (!tabs.some((t) => t.id === section)) setSection(tabs[0].id) }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  if (qualifiers.loading) return <Skeleton className="h-72 w-full rounded-3xl" />
  if (!qualifiers.data?.length) {
    return <Card><EmptyState icon={<Flag className="size-7" />} title="Chưa có vòng loại" hint="Ban tổ chức sẽ mở vòng loại trong khu Quản trị." /></Card>
  }

  return (
    <div className="space-y-6">
      {detail.loading && !event ? <Skeleton className="h-72 w-full rounded-3xl" /> : detail.error && !detail.data ? <ErrorNote message={detail.error.message} onRetry={() => void detail.reload()} /> : event && (
        <section className="banner-soft relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ ['--tint-a' as string]: (TINT[event.status] || TINT.OPEN)[0], ['--tint-b' as string]: (TINT[event.status] || TINT.OPEN)[1] }}>
          <div className="aurora-blob pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full blur-3xl opacity-25" style={{ background: 'var(--tint-b)' }} aria-hidden />
          <div className="aurora-blob-slow pointer-events-none absolute -bottom-28 left-6 -z-10 size-72 rounded-full blur-3xl opacity-20" style={{ background: 'var(--tint-a)' }} aria-hidden />
          <div className="soft-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.25em] text-primary">Vòng tuyển chọn</p>
                <h1 className="font-display mt-1 text-3xl font-black sm:text-4xl">{event.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <StatusBadge status={event.status} />
                  {event.status === 'PAUSED' && <Badge tone="warning">Tạm dừng sau lượt hiện tại</Badge>}
                  <span className="flex items-center gap-1"><CalendarClock className="size-4 text-primary" />Hạn nộp {shortTime(event.deadline)}{deadline ? ` · ${relative(event.deadline, now)}` : ''}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {qualifiers.data.length > 1 && (
                  <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="w-60">
                    {qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </Select>
                )}
                {open && <Countdown seconds={Math.floor((deadline - now) / 1000)} />}
              </div>
            </div>
            <Stepper status={event.status} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat icon={<Swords className="size-3.5" />} label="Lượt ghép cặp" value={`${event.applied_round ?? event.current_round ?? 0}/${event.rounds}`} />
              <HeroStat icon={<Users className="size-3.5" />} label="Đội đủ điều kiện" value={event.eligible ?? '—'} />
              <HeroStat icon={<Medal className="size-3.5" />} label="Vào giải chính" value={`Top ${event.top_k}`} />
              <HeroStat icon={<Timer className="size-3.5" />} label="Trận đã chấm" value={`${event.completed ?? 0}/${event.total ?? 0}`} />
            </div>
            {event.total > 0 && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Tiến độ chấm lượt hiện tại</span><span className="tabular-nums">{Math.round(((event.completed || 0) / event.total) * 100)}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={event.total} aria-valuenow={event.completed || 0} aria-label="Tiến độ chấm lượt hiện tại">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-[width] duration-700" style={{ width: `${Math.min(100, ((event.completed || 0) / event.total) * 100)}%` }} />
                </div>
              </div>
            )}
            {event.error && <ErrorNote message={event.error} />}
          </div>
        </section>
      )}

      {event && role === 'GUEST' && (
        <Card><EmptyState icon={<LogIn className="size-7" />} title="Đăng nhập để tham gia vòng loại" hint="Bạn vẫn xem được xếp hạng và tiến độ mà không cần đăng nhập." action={<Button onClick={() => openAuth('login')}>Đăng nhập</Button>} /></Card>
      )}
      {event && role === 'ADMIN' && <Card><p className="text-sm text-muted-foreground">Bạn đang xem với quyền quản trị. Thao tác điều hành vòng loại nằm ở <button className="font-semibold text-primary hover:underline" onClick={() => navigate('admin')}>Quản trị Admin → Vòng loại</button>.</p></Card>}

      {event && role === 'TEAM' && (
        participant?.banned ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            <Ban className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Đội đã bị ban tổ chức loại khỏi vòng loại này.</p>{participant.ban_reason && <p className="mt-1">Lý do: {participant.ban_reason}</p>}<p className="mt-1 text-xs opacity-80">Nếu có thắc mắc, gửi câu hỏi ở tab Hướng dẫn → Hỏi BTC.</p></div>
          </div>
        ) : registered ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Hạng hiện tại', myRank ? `#${myRank}` : '—'],
              ['ELO', Number(participant.elo).toFixed(1)],
              ['Thắng / Trận', `${participant.wins}/${participant.played}`],
              ['Chuỗi thắng', streak ? `${streak} trận` : '—'],
              ['Bài của bạn', participant.locked_id ? 'Đã khóa' : participant.pending_submissions ? 'Đang kiểm tra' : participant.valid_id ? 'Có bản hợp lệ' : history.length ? 'Chưa hợp lệ' : 'Chưa nộp'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display mt-1 text-xl font-extrabold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <Card><EmptyState icon={<Flag className="size-7" />} title="Bạn chưa đăng ký vòng loại này" hint="Đăng ký để nộp bot và được ghép cặp tính ELO." action={<Button disabled={event.status !== 'OPEN'} onClick={() => void run(() => arenaApi.registerQualifier(qualifierId), 'Đã đăng ký vòng loại', () => invalidate('q:'))}>Đăng ký tham gia</Button>} /></Card>
        )
      )}

      {event && <Tabs value={section} onChange={setSection} tabs={tabs} />}

      {event && section === 'submit' && role === 'TEAM' && (
        <div className="space-y-6">
          <Card title="Nộp bài vòng loại" subtitle={`Bản hợp lệ cuối cùng sẽ được khóa khi hết hạn. Hỗ trợ Python và C++.${event.git_mode ? ' Vòng này bắt buộc lấy mã từ GitHub.' : ''}`}>
            <Workbench
              draftKey={`qualifier:${qualifierId}:${session.student_id}`}
              submitLabel="Gửi tới hàng đợi chấm"
              submitting={submitting}
              submitDisabledReason={blocked}
              onSubmit={submit}
              extra={<SyncStatusCard draftKey={`qualifier:${qualifierId}:${session.student_id}`} pending={mine} serverLoading={detail.loading}
                server={history[0] ? { id: history[0].id, code: history[0].code, language: history[0].language, at: Number(history[0].at), valid: history[0].valid } : null} />}
            />
          </Card>
          <Card title="Lịch sử bài nộp" subtitle="Mỗi lần nộp là một bản; bản hợp lệ cuối cùng sẽ được khóa">
            {history.length ? (
              <DataTable head={['Thời gian', 'Mã bài', 'Ngôn ngữ', 'Kết quả', 'Chi tiết', '']}>
                {history.map((h) => (
                  <tr key={h.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2.5">{stamp(h.at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{String(h.id).slice(0, 10)}</td>
                    <td className="px-3 py-2.5">{h.language}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={h.status || (h.valid ? 'VALID' : 'INVALID')} />{participant?.locked_id === h.id && <Badge tone="info" className="ml-2">Đã khóa</Badge>}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{h.error || (h.git_commit_hash ? `GitHub ${h.git_commit_hash}` : '')}</td>
                    <td className="px-3 py-2.5 text-right">{h.code && <Button size="sm" variant="secondary" onClick={() => setViewing({ ...h, team_name: session.team_name || 'Đội của bạn', submitted_at: h.at })}><Code2 className="size-3.5" />Xem mã</Button>}</td>
                  </tr>
                ))}
              </DataTable>
            ) : <EmptyState title="Chưa có bài nộp" />}
          </Card>
        </div>
      )}

      {event && section === 'ranking' && <RankingPanel qid={qualifierId} mine={session.student_id} />}
      {event && section === 'score' && role === 'TEAM' && <Card title="Lịch sử tính điểm" subtitle="ELO trước và sau mỗi trận ghép cặp"><ScoreHistoryTable rows={rows} /></Card>}
      {section === 'challenge' && <ChallengesPanel />}
      {viewing && <CodeViewer submission={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
