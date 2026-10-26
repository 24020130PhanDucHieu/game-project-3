'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Clock, Code2, Crown, DoorOpen, Handshake, Hourglass, History, MessagesSquare, PlayCircle, Radio, Search, ShieldAlert, Swords, Trophy } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { countdown, decodeRule, sameStudent, shortTime, stamp } from '@/lib/format'
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SectionTitle, Select, SkeletonRows, StatusBadge, Tabs } from '../ui'
import { useLive } from '../context'
import { BoardPlayer } from '../board'
import { MatchCard, TeamLine, historyWinner, useHistory, useNow, winnerSide } from '../shared'
import { CurrentTournamentChip } from '../tournament-picker'
import { Workbench } from '../workbench'
import { SyncStatusCard } from '../sync-status'
import { enqueue, isRetryable, newSubmissionId } from '@/lib/outbox'
import { WebcamPanel } from '../webcam-panel'
import { ChatPanel, useChat } from '../chat-panel'
import { chatStore } from '@/lib/chat-store'
import { ScrimmagePanel } from '../scrimmage'
import { CodeViewer, ReplayViewer } from '../replay-viewer'
import { RoundLog } from '../round-log'
import { RoundTaskCard, RoundTaskCheckResult, TaskRoundResult, useRoundTaskCheck } from './ai-cup/task-round'
import { TASK_TEMPLATES } from './ai-cup/task-templates'

type MatchTab = 'live' | 'chat' | 'records' | 'submit' | 'history' | 'control' | 'scrim'

function RuleLine({ tournament, match, now }: { tournament: any; match: any; now: number }) {
  const level = match.round_level
  const rule = tournament.stage_rules?.[level]
  const window = tournament.stage_schedule?.[level]
  const decoded = decodeRule(rule?.rule_id || tournament.stage_rule)
  const chips = [...decoded.active, ...decoded.extra]
  if (tournament.round_mode === 'TASK') {
    return <div className="flex flex-wrap items-center gap-2 text-xs"><Badge tone="accent">Hiệp đề ML từ kho</Badge>{match.current_task && <Badge tone="info">{match.current_task.name}</Badge>}</div>
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {rule?.hidden ? <Badge tone="warning">Luật chưa công bố · {shortTime(rule.publish_at)}</Badge> : chips.length ? chips.map((c) => <Badge key={c} tone="accent">{c}</Badge>) : <Badge>Luật chuẩn</Badge>}
      {window?.starts_at && window?.ends_at && (
        now < window.starts_at * 1000 ? <Badge tone="info">Mở lúc {shortTime(window.starts_at)}</Badge> : now < window.ends_at * 1000 ? <Badge tone="success">Đóng lúc {shortTime(window.ends_at)}</Badge> : <Badge>Cửa sổ đã đóng</Badge>
      )}
    </div>
  )
}

const CONFETTI = ['#ff4d6d', '#35c9ff', '#ffe066', '#7dffb2', '#b388ff']

/** Biểu ngữ "HIỆP n" hiện thoáng qua mỗi khi sang hiệp mới. */
function RoundBanner({ round, matchId }: { round: number; matchId: string }) {
  const last = useRef({ round, matchId })
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (last.current.matchId === matchId && last.current.round !== round) {
      setShow(true)
      const timer = window.setTimeout(() => setShow(false), 2200)
      last.current = { round, matchId }
      return () => window.clearTimeout(timer)
    }
    last.current = { round, matchId }
  }, [round, matchId])
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-sm animate-fade-up" aria-live="polite">
      <p className="font-display gradient-text text-6xl font-black tracking-widest md:text-8xl">HIỆP {round}</p>
    </div>
  )
}

function VictoryBanner({ name }: { name: string }) {
  return (
    <div className="glow-gold relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-400/25 via-primary/20 to-amber-400/25 px-6 py-5 text-center">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} aria-hidden className="confetti absolute top-0 h-3 w-1.5 rounded-sm" style={{ left: `${(i * 4.3) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 8) * 0.18}s`, animationDuration: `${2.2 + (i % 5) * 0.4}s` }} />
      ))}
      <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">Kết thúc trận đấu</p>
      <p className="font-display mt-1 text-2xl font-black md:text-4xl">{name} giành chiến thắng!</p>
    </div>
  )
}

/** Một đội trên sân đấu: avatar, tên, điểm lớn, chấm hiệp thắng và trạng thái nộp bot. */
function TeamPanel({ match, side, won, task }: { match: any; side: 'team_a' | 'team_b'; won: 'team_a' | 'team_b' | null; task?: boolean }) {
  const team = match[side]
  const red = side === 'team_a'
  const isWin = won === side
  const need = Math.ceil((match.max_rounds || 5) / 2)
  const score = team ? team.rounds_won ?? 0 : 0
  const state = !team ? null : team.code_valid ? { icon: <CheckCircle2 className="size-3.5" />, text: task ? 'Đã nộp mô hình' : 'Đã nộp bot', cls: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300' }
    : team.code_submitted ? { icon: <AlertTriangle className="size-3.5" />, text: task ? 'Mô hình lỗi' : 'Bot lỗi', cls: 'bg-red-500/12 text-red-700 ring-red-500/30 dark:text-red-300' }
    : { icon: <Hourglass className="size-3.5" />, text: task ? 'Chưa nộp mô hình' : 'Chưa nộp bot', cls: 'bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300' }
  return (
    <div className={cn('relative flex flex-1 flex-col gap-4 rounded-2xl p-4 md:p-5', red ? 'items-start text-left' : 'items-end text-right',
      'bg-card/75 ring-1 ring-border shadow-sm', red ? 'border-l-4 border-l-rose-400' : 'border-r-4 border-r-sky-400', isWin && 'ring-2 ring-amber-400 shadow-[0_0_36px_rgba(251,191,36,.35)]')}>
      <div className={cn('flex w-full items-center gap-3', !red && 'flex-row-reverse')}>
        <div className="relative">
          {team ? <Avatar name={team.team_name} size="xl" ring={isWin ? 'gold' : red ? 'red' : 'blue'} /> : <span className="grid size-16 place-items-center rounded-2xl border border-dashed border-border text-muted-foreground" aria-hidden>?</span>}
          {isWin && <Crown className="absolute -right-2 -top-3 size-6 rotate-12 text-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,.9)]" aria-label="Chiến thắng" />}
        </div>
        <div className="min-w-0">
          <p className={cn('text-[11px] font-extrabold uppercase tracking-[0.25em]', red ? 'text-rose-500' : 'text-sky-600 dark:text-sky-400')}>{task ? (red ? 'Đội A' : 'Đội B') : red ? 'Đội Đỏ' : 'Đội Xanh'}</p>
          <p className="font-display truncate text-xl font-extrabold md:text-2xl">{team?.team_name || 'Chờ đội'}</p>
          {team?.university && <p className="truncate text-xs text-muted-foreground">{team.university}</p>}
        </div>
      </div>
      <div className={cn('flex w-full items-end gap-4', !red && 'flex-row-reverse')}>
        <p className={cn('font-display text-7xl font-black leading-none tabular-nums md:text-8xl', red ? 'text-rose-500' : 'text-sky-600 dark:text-sky-400')} aria-label={`${score} hiệp thắng`}>{team ? score : '–'}</p>
        <div className="pb-2">
          <div className={cn('flex gap-1.5', !red && 'justify-end')} aria-hidden>
            {Array.from({ length: need }, (_, i) => (
              <span key={i} className={cn('h-2.5 w-7 rounded-full transition-all', i < score ? (red ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,.6)]' : 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,.6)]') : 'bg-muted')} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{need - score > 0 ? `Cần thêm ${need - score} hiệp thắng` : 'Đủ hiệp thắng'}</p>
        </div>
      </div>
      {isWin ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 ring-1 ring-amber-200"><Trophy className="size-3.5" />Chiến thắng</span>
        : state && <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1', state.cls)}>{state.icon}{state.text}</span>}
    </div>
  )
}

/** Thanh các hiệp: ô nào đã đấu tô theo đội thắng, ô hiện tại nhấp nháy. */
function RoundTrack({ match }: { match: any }) {
  const rounds: any[] = match.rounds_history || []
  const total = match.max_rounds || 5
  const current = match.current_round_idx || 1
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Các hiệp của trận">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const r = rounds.find((x, j) => Number(x.round_number || j + 1) === n)
        const live = !r && n === current && match.status !== 'COMPLETED'
        return (
          <li key={n} title={r ? `Hiệp ${n}: ${r.winner_name}` : `Hiệp ${n}`} className={cn('flex h-9 min-w-9 items-center justify-center rounded-xl px-3 text-xs font-extrabold tabular-nums ring-1 transition-all',
            r ? (r.winner === 'team_a' ? 'bg-rose-500 text-white ring-rose-300 shadow-[0_6px_16px_-6px_rgba(244,63,94,.7)]' : 'bg-sky-500 text-white ring-sky-300 shadow-[0_6px_16px_-6px_rgba(14,165,233,.7)]')
              : live ? 'animate-live bg-primary/15 text-primary ring-primary/50' : 'bg-muted/70 text-muted-foreground ring-border')}>
            {r ? <span className="flex items-center gap-1"><Check className="size-3.5" />H{n}</span> : `H${n}`}
          </li>
        )
      })}
    </ol>
  )
}

function Scoreboard({ match, task }: { match: any; task?: boolean }) {
  const won = winnerSide(match)
  const now = useNow()
  const ends = match.intermission_ends_at ? Number(match.intermission_ends_at) * 1000 : 0
  const live = match.status === 'IN_PROGRESS' || match.round_status === 'BATTLE_RUNNING'
  return (
    <div className="relative space-y-4">
      <RoundBanner round={match.current_round_idx || 1} matchId={match.match_id} />
      {match.status === 'COMPLETED' && match.winner_name && <VictoryBanner name={match.winner_name} />}
      <section className="banner-soft relative overflow-hidden rounded-3xl p-4 md:p-6" style={{ ['--tint-a' as string]: '#fb7185', ['--tint-b' as string]: '#38bdf8' }} aria-label="Bảng tỉ số">
        <div className="aurora-blob pointer-events-none absolute -left-16 top-1/2 -z-10 size-64 -translate-y-1/2 rounded-full bg-rose-400/20 blur-3xl" aria-hidden />
        <div className="aurora-blob-slow pointer-events-none absolute -right-16 top-1/2 -z-10 size-64 -translate-y-1/2 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="soft-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground"><Swords className="size-4 text-primary" />{match.round_name || 'Trận đấu'}{match.title ? ` · ${match.title}` : ''}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {live ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 font-bold text-emerald-700 ring-1 ring-emerald-500/35 dark:text-emerald-300"><span className="animate-live size-2 rounded-full bg-emerald-500" aria-hidden />ĐANG ĐẤU</span>
                : <StatusBadge status={match.status} />}
              {match.status !== 'COMPLETED' && match.round_status && <StatusBadge status={match.round_status} />}
              {ends > now && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/12 px-3 py-1 font-semibold text-sky-700 ring-1 ring-sky-500/30 dark:text-sky-300"><Clock className="size-3.5" />Hiệp kế sau {countdown(Math.ceil((ends - now) / 1000))}</span>}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-5">
            <TeamPanel match={match} side="team_a" won={won} task={task} />
            <div className="flex flex-col items-center gap-2 px-1 text-center">
              <div className="relative grid size-20 place-items-center">
                <span className={cn('absolute inset-0 rounded-full bg-primary/15', live && 'animate-ping')} aria-hidden />
                <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-rose-500 via-fuchsia-500 to-sky-500 text-white shadow-lg ring-4 ring-card"><span className="font-display text-2xl font-black">VS</span></span>
              </div>
              <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-bold tracking-wider text-muted-foreground ring-1 ring-border">BO{match.max_rounds || 5}</span>
              <span className="text-[11px] text-muted-foreground">Hiệp {match.current_round_idx || 1}/{match.max_rounds || 5}</span>
            </div>
            <TeamPanel match={match} side="team_b" won={won} task={task} />
          </div>
          <RoundTrack match={match} />
        </div>
      </section>
    </div>
  )
}

/** Hiệp đề ML: bảng điểm từng hiệp và cách tính người thắng, thay cho sân cờ. */
function TaskMatchInfo({ match }: { match: any }) {
  const rounds: any[] = match.rounds_history || []
  const nameA = match.team_a?.team_name || 'Đội A'
  const nameB = match.team_b?.team_name || 'Đội B'
  return (
    <Card title="Điểm từng hiệp" subtitle="Thắng 3 trong 5 hiệp thì đi tiếp. Mỗi hiệp là một đề học máy; điểm tính trên thế cờ ẩn, đội điểm cao hơn thắng hiệp." data-testid="task-rounds-table">
      {rounds.length ? (
        <DataTable head={['Hiệp', 'Đề', nameA, nameB, 'Thắng hiệp', 'Ghi chú']}>
          {rounds.map((r, i) => {
            const n = Number(r.round_number || i + 1)
            const a = Number(r.scores?.team_a)
            const b = Number(r.scores?.team_b)
            return (
              <tr key={n}>
                <td className="px-3 py-2.5 tabular-nums">{n}</td>
                <td className="px-3 py-2.5">{r.task?.name || '—'}</td>
                <td className={cn('px-3 py-2.5 font-semibold tabular-nums', r.winner === 'team_a' && 'text-emerald-600 dark:text-emerald-400')}>{Number.isFinite(a) ? a.toFixed(1) : '—'}</td>
                <td className={cn('px-3 py-2.5 font-semibold tabular-nums', r.winner === 'team_b' && 'text-emerald-600 dark:text-emerald-400')}>{Number.isFinite(b) ? b.toFixed(1) : '—'}</td>
                <td className="px-3 py-2.5">{r.winner_name || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.tie ? 'Hòa điểm: bốc thăm đã lưu từ trước' : Number.isFinite(a) && Number.isFinite(b) ? `Chênh ${Math.abs(a - b).toFixed(1)} điểm` : ''}</td>
              </tr>
            )
          })}
        </DataTable>
      ) : <p className="text-sm text-muted-foreground">Chưa có hiệp nào hoàn tất. Khi ban tổ chức khai hỏa, điểm hai đội ở mỗi hiệp hiện ở đây.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Cách chọn người thắng: máy chấm chạy mô hình của hai đội trên cùng một đề và cùng thế cờ ẩn. Điểm cao hơn thắng hiệp. Nếu bằng điểm (kể cả cùng 0 vì lỗi) thì dùng lá thăm được bốc sẵn từ đầu trận nên kết quả không đổi nếu chấm lại.</p>
    </Card>
  )
}

function RoundStrip({ match, value, onPick }: { match: any; value: number | null; onPick: (n: number) => void }) {
  const rounds: any[] = match.rounds_history || []
  const total = match.max_rounds || 5
  return (
    <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Chọn hiệp">
      {Array.from({ length: total }, (_, i) => {
        const r = rounds.find((x, j) => Number(x.round_number || j + 1) === i + 1)
        const n = i + 1
        const red = r?.winner === 'team_a'
        return (
          <button key={n} role="tab" aria-selected={value === n} disabled={!r} onClick={() => onPick(n)}
            className={cn('rounded-xl border px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              value === n ? 'border-primary bg-primary/15 ring-1 ring-primary/40' : 'border-border bg-card/60 hover:border-primary/50')}>
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Hiệp {n}</span>
            <span className={cn('block truncate text-xs font-semibold', r ? (red ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400') : 'text-muted-foreground')}>{r ? r.winner_name : n === (match.current_round_idx || 1) && match.status !== 'COMPLETED' ? 'Đang chờ' : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}

function RoundsPanel({ tournamentId, matchId, match, task }: { tournamentId: string; matchId: string; match: any; task?: boolean }) {
  const { scope } = useLive()
  const rounds: any[] = match.rounds_history || []
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => setSelected(null), [matchId])
  const number = selected ?? (rounds.length ? Number(rounds[rounds.length - 1].round_number || rounds.length) : null)
  const replay = useResource<any>(
    number ? `replay:${scope}:${tournamentId}:${matchId}:${number}:${rounds.length}` : null,
    () => arenaApi.getRoundReplay(tournamentId, matchId, number as number),
    { ttl: 60_000 },
  )
  if (!rounds.length) return <EmptyState title="Chưa có hiệp nào hoàn tất" hint={task ? 'Điểm của hai đội ở từng hiệp xuất hiện sau khi ban tổ chức khai hỏa hiệp đầu tiên.' : 'Bàn cờ và nhật ký xuất hiện sau khi ban tổ chức khai hỏa hiệp đầu tiên.'} />
  const data = replay.data
  const logs: any[] = [...(data?.system_logs || []), ...(data?.move_logs || []).map((l: any) => l.log || l)]
  return (
    <div className="space-y-5">
      <RoundStrip match={match} value={number} onPick={setSelected} />
      {replay.loading ? <SkeletonRows rows={6} /> : replay.error && !data ? <ErrorNote message={replay.error.message} onRetry={() => void replay.reload()} /> : data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
            <p className="text-sm"><span className="text-muted-foreground">Hiệp {data.round_number}:</span> <strong>{data.winner_name}</strong> <span className="text-muted-foreground">— {data.win_reason}</span></p>
            <div className="flex flex-wrap gap-1.5">{data.round_kind === 'TASK' ? <Badge tone="accent">Đề ML</Badge> : decodeRule(data.stage_rule).active.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
          </div>
          {data.round_kind === 'TASK' ? <TaskRoundResult data={data} redName={data.team_a_name || match.team_a?.team_name || 'Đội Đỏ'} blueName={data.team_b_name || match.team_b?.team_name || 'Đội Xanh'} /> : <BoardPlayer steps={data.board_steps || []} autoPlay={selected !== null} size="lg" redName={data.team_a_name || match.team_a?.team_name} blueName={data.team_b_name || match.team_b?.team_name} />}
          {data.round_kind !== 'TASK' && <RoundLog logs={logs} redName={data.team_a_name || match.team_a?.team_name || 'Đội Đỏ'} blueName={data.team_b_name || match.team_b?.team_name || 'Đội Xanh'} defaultOpen={false} />}
        </>
      )}
    </div>
  )
}

function SubmissionHistory({ tournamentId, matchId, enabled, match }: { tournamentId: string; matchId: string; enabled: boolean; match?: any }) {
  const { scope, role } = useLive()
  const subs = useResource<any[]>(enabled ? `subs:${scope}:${tournamentId}:${matchId}` : null, () => arenaApi.getSubmissions(tournamentId, matchId).then((r: any) => (Array.isArray(r) ? r : [])), { ttl: 5_000, refreshMs: 15_000 })
  const [code, setCode] = useState<any>(null)
  const [round, setRound] = useState<number | null>(null)
  if (!enabled) return null
  const list = [...(subs.data || [])].sort((a, b) => Number(b.submitted_at) - Number(a.submitted_at))
  const played = new Set((match?.rounds_history || []).map((r: any, i: number) => Number(r.round_number || i + 1)))
  return (
    <Card title="Lịch sử bài nộp" subtitle="Chỉ đội của bạn và ban tổ chức xem được mã nguồn">
      {subs.loading ? <SkeletonRows rows={3} /> : list.length ? (
        <DataTable head={['Thời gian', 'Hiệp', ...(role === 'ADMIN' ? ['Đội'] : []), 'Ngôn ngữ', 'Kết quả', '']}>
          {list.map((s) => (
            <tr key={s.submission_id} className="align-middle">
              <td className="px-3 py-2.5 whitespace-nowrap">{stamp(s.submitted_at)}</td>
              <td className="px-3 py-2.5 tabular-nums">{s.round_number}</td>
              {role === 'ADMIN' && <td className="px-3 py-2.5">{s.team_name}</td>}
              <td className="px-3 py-2.5">{s.language}</td>
              <td className="px-3 py-2.5"><StatusBadge status={s.validation_status} />{s.execution_time_ms ? <span className="ml-2 text-xs text-muted-foreground">{s.execution_time_ms} ms</span> : null}{s.error_message && <span className="ml-2 text-xs text-red-600 dark:text-red-400">lỗi</span>}</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1.5">
                  {s.code && <Button size="sm" variant="secondary" onClick={() => setCode(s)}><Code2 className="size-3.5" />Xem mã</Button>}
                  <Button size="sm" variant="secondary" disabled={!played.has(Number(s.round_number))} title={played.has(Number(s.round_number)) ? undefined : 'Hiệp này chưa đấu'} onClick={() => setRound(Number(s.round_number))}><PlayCircle className="size-3.5" />Xem replay</Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="Chưa có bài nộp" />}
      {code && <CodeViewer submission={code} onClose={() => setCode(null)} />}
      {round !== null && match && <ReplayViewer tournamentId={tournamentId} matchId={matchId} match={match} round={round} onRound={setRound} onClose={() => setRound(null)} />}
    </Card>
  )
}

function RecordsPanel({ tournamentId, matchId, match, canSeeCode, task }: { tournamentId: string; matchId: string; match: any; canSeeCode: boolean; task?: boolean }) {
  const [round, setRound] = useState<number | null>(null)
  const rounds: any[] = match.rounds_history || []
  return (
    <div className="space-y-6">
      <Card title="Các hiệp đã đấu" subtitle={task ? 'Xem lại đề, điểm của hai đội và cách chọn người thắng ở từng hiệp' : 'Mở replay toàn màn hình: bàn cờ lớn 2D/3D, camera hai đội và nhật ký'}>
        {rounds.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rounds.map((r, i) => {
              const n = Number(r.round_number || i + 1)
              return (
                <li key={n} className="card-lift flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3">
                  <span className={cn('font-display flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white', r.winner === 'team_a' ? 'bg-red-500' : 'bg-blue-500')}>{n}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.winner_name}</span><span className="block truncate text-xs text-muted-foreground">{r.win_reason}</span></span>
                  <Button size="sm" onClick={() => setRound(n)}><PlayCircle className="size-4" />{task ? 'Xem lại' : 'Replay'}</Button>
                </li>
              )
            })}
          </ul>
        ) : <EmptyState title="Chưa có hiệp nào hoàn tất" />}
      </Card>
      <SubmissionHistory tournamentId={tournamentId} matchId={matchId} enabled={canSeeCode} match={match} />
      {round !== null && <ReplayViewer tournamentId={tournamentId} matchId={matchId} match={match} round={round} onRound={setRound} onClose={() => setRound(null)} />}
    </div>
  )
}

function SubmitPanel({ tournamentId, matchId, match, tournament }: { tournamentId: string; matchId: string; match: any; tournament: any }) {
  const { session, enterMatch, toast, outbox, scope } = useLive()
  const now = useNow(5000)
  const inRoom = session.match_id === matchId
  const side = sameStudent(match.team_a?.student_id, session.student_id) ? 'team_a' : 'team_b'
  const rule = tournament.stage_rules?.[match.round_level]
  const window = tournament.stage_schedule?.[match.round_level]
  let blocked = ''
  if (match.status === 'COMPLETED') blocked = 'Trận đã kết thúc.'
  else if (!match.team_a || !match.team_b) blocked = 'Chờ đối thủ — chưa thể nộp bài.'
  else if (tournament.round_mode === 'TASK' && !match.current_task) blocked = 'Ban tổ chức chưa khóa bộ đề của giải nên chưa có đề cho hiệp này. Trang tự cập nhật khi có đề.'
  else if (rule?.hidden) blocked = `Luật vòng này chưa công bố (${shortTime(rule.publish_at)}).`
  else if (window?.starts_at && now < window.starts_at * 1000) blocked = `Vòng mở lúc ${shortTime(window.starts_at)}.`
  else if (window?.ends_at && now > window.ends_at * 1000) blocked = 'Cửa sổ nộp bài của vòng đã đóng.'
  else if (['BATTLE_RUNNING', 'ROUND_FINISHED'].includes(match.round_status)) blocked = 'Hiệp đang chạy / nghỉ giữa hiệp — chờ hiệp kế tiếp để nộp bot mới.'
  const [submitting, setSubmitting] = useState(false)
  const taskCheck = useRoundTaskCheck(tournamentId, matchId)
  const pending = outbox.filter((o) => o.kind === 'match' && o.matchId === matchId)
  const round = match.current_round_idx || 1
  const subs = useResource<any[]>(inRoom ? `subs:${scope}:${tournamentId}:${matchId}` : null, () => arenaApi.getSubmissions(tournamentId, matchId).then((r: any) => (Array.isArray(r) ? r : [])), { ttl: 5_000, refreshMs: 15_000 })
  const latest = (subs.data || []).filter((s) => Number(s.round_number) === round).sort((a, b) => Number(b.submitted_at) - Number(a.submitted_at))[0]

  if (!inRoom) {
    return (
      <Card title="Phòng nộp bot">
        <EmptyState icon={<DoorOpen className="size-7" />} title="Vào phòng thi đấu của đội để nộp bot" hint="Phiên nộp bài gắn với từng trận để đảm bảo không nộp nhầm đội." action={<Button onClick={() => void enterMatch(matchId)}>Vào phòng trận này</Button>} />
      </Card>
    )
  }
  const ruleId = rule?.hidden ? undefined : rule?.rule_id || tournament.stage_rule
  const taskMode = tournament.round_mode === 'TASK'
  return (
    <div className="space-y-5">
      {taskMode && <RoundTaskCard tournamentId={tournamentId} matchId={matchId} task={match.current_task} round={match.current_round_idx || 1} canDownload />}
      <Card title={`${taskMode ? 'Nộp mô hình' : 'Nộp bot'} — Hiệp ${match.current_round_idx || 1}`} subtitle={taskMode ? 'Mỗi hiệp một bài nộp mới. Lưu ý: nộp thêm một bản LỖI sau bản hợp lệ sẽ thay bản hợp lệ trước đó; bản hợp lệ cuối cùng được khóa khi ban tổ chức khai hỏa.' : 'Mỗi hiệp cần một bài nộp mới; bài hợp lệ cuối cùng được khóa khi ban tổ chức khai hỏa.'}>
        <Workbench
          draftKey={`match:${tournamentId}:${matchId}:${session.student_id}:${match.current_round_idx || 1}`}
          ruleId={taskMode ? undefined : ruleId}
          withExplanation
          templates={taskMode ? TASK_TEMPLATES : undefined}
          pythonOnly={taskMode}
          practice={!taskMode}
          hideValidate={taskMode}
          renderActions={taskMode ? (value) => <Button variant="secondary" loading={taskCheck.busy} disabled={!value.code.trim() || !match.current_task} onClick={() => void taskCheck.run(value.code)} data-testid="round-task-check">Chấm thử đề của hiệp (trên máy)</Button> : undefined}
          submitLabel={taskMode ? 'Nộp mô hình chính thức' : 'Nộp bài chính thức'}
          submitting={submitting}
          submitDisabledReason={blocked}
          onSubmit={async (value) => {
            const id = newSubmissionId()
            const round = match.current_round_idx || 1
            setSubmitting(true)
            try {
              const result: any = await arenaApi.submitCode(tournamentId, matchId, { code_content: value.code, language: value.language, explanation: value.explanation, round_number: round, side }, id)
              invalidate('t:')
              invalidate('subs:')
              // Server vẫn nhận và lưu bài khi mã lỗi; báo riêng để đội sửa.
              if (result?.status === 'INVALID_CODE') toast('error', `Bài đã được ghi nhận nhưng mã KHÔNG hợp lệ: ${result.validation_error || 'lỗi sandbox'}`)
              else toast('success', 'Server đã nhận bài nộp')
            } catch (e) {
              if (isRetryable(e) && session.student_id) {
                enqueue({ id, kind: 'match', studentId: session.student_id, qualifierId: '', tournamentId, matchId, payload: { code: value.code, language: value.language, explanation: value.explanation, round_number: round, side } })
                toast('info', 'Chưa gửi được tới server. Bài đã lưu trên thiết bị và sẽ tự gửi lại khi có mạng — hãy giữ trang này mở.')
              } else {
                toast('error', e instanceof Error ? e.message : 'Bài bị từ chối')
              }
            } finally {
              setSubmitting(false)
            }
          }}
          extra={<><RoundTaskCheckResult state={taskCheck} /><SyncStatusCard draftKey={`match:${tournamentId}:${matchId}:${session.student_id}:${round}`} pending={pending} serverLoading={subs.loading}
            server={latest ? { id: latest.submission_id, code: latest.code, language: latest.language, at: Number(latest.submitted_at), valid: latest.validation_status ? !/INVALID|ERROR/.test(latest.validation_status) : undefined } : null} /></>}
        />
      </Card>
      <SubmissionHistory tournamentId={tournamentId} matchId={matchId} enabled match={match} />
    </div>
  )
}

function ControlPanel({ tournamentId, matchId, match, tournament }: { tournamentId: string; matchId: string; match: any; tournament: any }) {
  const { run, confirm, busy } = useLive()
  const [reason, setReason] = useState('')
  const [scoreA, setScoreA] = useState(String(match.team_a?.rounds_won ?? 0))
  const [scoreB, setScoreB] = useState(String(match.team_b?.rounds_won ?? 0))
  useEffect(() => { setScoreA(String(match.team_a?.rounds_won ?? 0)); setScoreB(String(match.team_b?.rounds_won ?? 0)) }, [matchId, match.team_a?.rounds_won, match.team_b?.rounds_won])
  const reload = () => { invalidate('t:'); invalidate('rk'); invalidate('mh') }
  const token = tournament.correction_token
  const incidents: any[] = Array.isArray(tournament.incident_log) ? tournament.incident_log : []
  const ready = match.round_status === 'READY_FOR_BATTLE'
  const taskMode = tournament.round_mode === 'TASK'
  const planLocked = !taskMode || tournament.ai_task_plan?.locked === true
  const nameA = match.team_a?.team_name || 'Đội A'
  const nameB = match.team_b?.team_name || 'Đội B'
  const problems: string[] = []
  if (!match.team_a || !match.team_b) problems.push('Trận chưa có đủ hai đội.')
  else {
    if (!match.team_a.code_valid) problems.push(`${nameA} chưa nộp ${taskMode ? 'mô hình' : 'bot'} hợp lệ.`)
    if (!match.team_b.code_valid) problems.push(`${nameB} chưa nộp ${taskMode ? 'mô hình' : 'bot'} hợp lệ.`)
  }
  if (!planLocked) problems.push('Bộ đề của giải chính chưa được khóa (Quản trị → Giải AI → Bộ đề của giải chính).')
  if (match.status === 'COMPLETED') problems.push('Trận đã kết thúc.')
  else if (match.round_status === 'BATTLE_RUNNING') problems.push('Hiệp đang chạy.')
  else if (match.round_status === 'ROUND_FINISHED') problems.push('Hiệp vừa xong, hệ thống đang nghỉ giữa hiệp rồi tự sang hiệp sau.')
  const canFire = problems.length === 0

  return (
    <div className="space-y-5">
      <Card title="Điều hành trận" subtitle={canFire ? `Cả hai đội đã nộp ${taskMode ? 'mô hình' : 'bot'} hợp lệ — sẵn sàng khai hỏa.` : `Chỉ khai hỏa được khi cả hai đội đã nộp ${taskMode ? 'mô hình' : 'bot'} hợp lệ.`}>
        {taskMode && (
          <ul className="mb-4 space-y-1 text-sm" data-testid="fire-checklist">
            {[
              [planLocked, 'Bộ đề của giải chính đã khóa'],
              [!!match.team_a?.code_valid, `${nameA} đã nộp mô hình hợp lệ`],
              [!!match.team_b?.code_valid, `${nameB} đã nộp mô hình hợp lệ`],
            ].map(([ok, text]) => <li key={String(text)} className={ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{ok ? '✔' : '✖'} {text}</li>)}
          </ul>
        )}
        {!canFire && problems.length > 0 && <p className="mb-3 text-xs text-muted-foreground" data-testid="fire-problems">Chưa khai hỏa được: {problems.join(' ')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={match.status === 'COMPLETED' || (taskMode && !canFire)} data-testid="fire-round" onClick={async () => {
            if (taskMode && !(await confirm({ title: `Khai hỏa hiệp ${match.current_round_idx || 1}?`, message: `Máy chấm sẽ chạy mô hình của ${nameA} và ${nameB} trên đề của hiệp này; đội điểm cao hơn thắng hiệp. Có thể mất vài chục giây.`, confirmLabel: 'Khai hỏa' }))) return
            void run(() => arenaApi.playRound(tournamentId, matchId), taskMode ? 'Đã chấm xong hiệp — xem điểm hai đội ở tab Diễn biến' : 'Đã chạy hiệp trên server', reload)
          }}><Swords className="size-4" />Khai hỏa hiệp</Button>
          <Button variant="secondary" disabled={busy || match.status === 'COMPLETED' || (taskMode && match.round_status !== 'ROUND_FINISHED')} title={taskMode && match.round_status !== 'ROUND_FINISHED' ? 'Chỉ dùng được ngay sau khi một hiệp vừa chấm xong; hệ thống cũng tự sang hiệp sau.' : undefined} onClick={() => void run(() => arenaApi.nextRound(tournamentId, matchId), 'Đã chuyển sang hiệp tiếp theo', reload)}>Hiệp tiếp theo</Button>
          <Button variant="secondary" disabled={busy || match.status === 'COMPLETED'} onClick={() => void run(() => arenaApi.demoFill(tournamentId, matchId), 'Đã điền bot mẫu cho cả hai đội', reload)}>Điền bot mẫu</Button>
          <Button variant="danger" disabled={busy} onClick={async () => { if (await confirm({ title: 'Đặt lại trận đấu?', message: 'Toàn bộ hiệp đã đấu và bài nộp của trận này sẽ bị xóa.', confirmLabel: 'Đặt lại', danger: true })) void run(() => arenaApi.resetMatch(tournamentId, matchId), 'Đã đặt lại trận', reload) }}>Đặt lại trận</Button>
        </div>
      </Card>

      <Card title="Sửa kết quả có ghi nhật ký" subtitle="Dùng khi có sự cố. Mã xác nhận gắn với đúng trạng thái giải bạn đang xem; nếu giải thay đổi, hãy tải lại trước khi sửa.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Số hiệp thắng — ${match.team_a?.team_name || 'Đội A'}`} type="number" min={0} max={3} value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
          <Field label={`Số hiệp thắng — ${match.team_b?.team_name || 'Đội B'}`} type="number" min={0} max={3} value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
          <Field label="Lý do (≥ 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy || !token || reason.trim().length < 5} onClick={async () => { if (await confirm({ title: 'Xác nhận sửa kết quả?', message: `${scoreA} – ${scoreB}. Thao tác được ghi vào nhật ký sự cố.`, danger: true })) void run(() => arenaApi.correctMatch(tournamentId, matchId, { token, action: 'result', score_a: Number(scoreA), score_b: Number(scoreB), reason }), 'Đã sửa kết quả và cập nhật nhánh đi tiếp', reload) }}><ShieldAlert className="size-4" />Xác nhận kết quả</Button>
          <Button variant="secondary" disabled={busy || !token || reason.trim().length < 5} onClick={async () => { if (await confirm({ title: 'Hoàn tác lần sửa cuối?', message: 'Chỉ hoàn tác được khi chưa có thay đổi nào sau đó.' })) void run(() => arenaApi.correctMatch(tournamentId, matchId, { token, action: 'rollback', reason }), 'Đã hoàn tác', reload) }}>Hoàn tác</Button>
        </div>
      </Card>

      {incidents.length > 0 && (
        <Card title="Nhật ký sự cố của giải">
          <ul className="space-y-2 text-sm">{incidents.slice(-8).reverse().map((it, i) => <li key={i} className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-xs text-muted-foreground">{stamp(it.at ?? it.created_at)}</span> · {it.action || it.type} · {it.reason}</li>)}</ul>
        </Card>
      )}
    </div>
  )
}

function HistoryPanel() {
  const { tournaments, setTournamentId, setMatchId } = useLive()
  const history = useHistory()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...(history.data || [])].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).filter((r) => !needle || `${(r.bot_names || []).join(' ')} ${historyWinner(r).done ? r.winner_name : ''} ${r.stage}`.toLowerCase().includes(needle))
  }, [history.data, q])
  const [limit, setLimit] = useState(15)
  return (
    <Card title="Lịch sử trận đấu toàn hệ thống" subtitle="Các trận có ít nhất một hiệp hoàn tất" action={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(15) }} placeholder="Tìm đội, vòng…" aria-label="Tìm trận" className="w-52 rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>}>
      {history.loading ? <SkeletonRows rows={6} /> : rows.length ? (
        <>
          <DataTable head={['Thời gian', 'Vòng', 'Cặp đấu', 'Số hiệp', 'Thắng', '']}>
            {rows.slice(0, limit).map((r) => {
              const tournament = tournaments.data?.find((t) => String(r.match_id).startsWith(`${t.tournament_id}_`))
              const matchKey = tournament ? String(r.match_id).slice(tournament.tournament_id.length + 1) : ''
              return (
                <tr key={r.match_id}>
                  <td className="px-3 py-2.5 whitespace-nowrap">{stamp(r.timestamp)}</td>
                  <td className="px-3 py-2.5">{r.stage}</td>
                  <td className="px-3 py-2.5 font-medium">{(r.bot_names || []).join(' vs ')}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.total_rounds}</td>
                  <td className="px-3 py-2.5">{historyWinner(r).done ? <Badge tone="accent">{r.winner_name}</Badge> : <Badge tone="info" dot>Đang đấu</Badge>}</td>
                  <td className="px-3 py-2.5 text-right">{tournament && <Button size="sm" variant="ghost" onClick={() => { setTournamentId(tournament.tournament_id); setMatchId(matchKey) }}>Mở</Button>}</td>
                </tr>
              )
            })}
          </DataTable>
          {rows.length > limit && <div className="mt-3 text-center"><Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + 15)}>Xem thêm ({rows.length - limit})</Button></div>}
        </>
      ) : <EmptyState title="Chưa có trận nào" />}
    </Card>
  )
}

export function MatchView() {
  const { tournament, tournamentId, matchId, setMatchId, enterMatch, role, session, ownMatches } = useLive()
  const now = useNow()
  const [tab, setTab] = useState<MatchTab>('live')
  const t = tournament.data
  const match = t?.matches?.[matchId]
  const matches: [string, any][] = useMemo(() => Object.entries(t?.matches || {}).sort((a: any, b: any) => (a[1].round_level - b[1].round_level) || a[0].localeCompare(b[0], undefined, { numeric: true })) as [string, any][], [t])
  const own = !!match && ownMatches.some(([id]) => id === matchId)
  const levels = [...new Set(matches.map(([, m]) => m.round_name))]

  const chat = useChat()
  const canChat = !!match && (role === 'ADMIN' || session.match_id === matchId)
  useEffect(() => {
    if (canChat) chatStore.open(tournamentId, matchId)
    else chatStore.close()
  }, [canChat, tournamentId, matchId])
  useEffect(() => () => chatStore.close(), [])
  const unread = chat.key === `${tournamentId}:${matchId}` && tab !== 'chat' ? chat.unread : 0

  const tabs: { id: MatchTab; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    { id: 'live', label: 'Diễn biến', icon: <Radio className="size-4" /> },
    ...(match ? [{ id: 'chat' as const, label: 'Trò chuyện', icon: <MessagesSquare className="size-4" />, badge: unread > 0 ? <span data-testid="chat-unread" className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-5 text-white">{unread > 99 ? '99+' : unread}</span> : undefined }] : []),
    ...(match ? [{ id: 'records' as const, label: 'Lịch sử & Replay', icon: <PlayCircle className="size-4" /> }] : []),
    ...(own ? [{ id: 'submit' as const, label: t?.round_mode === 'TASK' ? 'Nộp mô hình' : 'Nộp bot', icon: <ClipboardList className="size-4" /> }] : []),
    ...(role === 'ADMIN' && match ? [{ id: 'control' as const, label: 'Điều hành', icon: <ShieldAlert className="size-4" /> }] : []),
    ...(t?.round_mode === 'TASK' ? [] : [{ id: 'scrim' as const, label: 'Giao hữu', icon: <Handshake className="size-4" /> }]),
    { id: 'history', label: 'Lịch sử', icon: <History className="size-4" /> },
  ]
  useEffect(() => { if (!tabs.some((x) => x.id === tab)) setTab('live') }, [tabs, tab])

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Phòng thi đấu" title="Trận đấu">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </SectionTitle>
      <CurrentTournamentChip />

      {tab === 'history' ? <HistoryPanel /> : tab === 'scrim' ? <ScrimmagePanel /> : (
        <>
          <Card padded={false}>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <Select label="Chọn trận" value={matchId} onChange={(e) => (e.target.value ? void enterMatch(e.target.value) : setMatchId(''))} className="min-w-64 flex-1">
                <option value="">— Chọn trận —</option>
                {levels.map((level) => (
                  <optgroup key={level} label={level}>
                    {matches.filter(([, m]) => m.round_name === level).map(([id, m]) => <option key={id} value={id}>{m.title || id} · {m.team_a?.team_name || '?'} vs {m.team_b?.team_name || '?'}</option>)}
                  </optgroup>
                ))}
              </Select>
              {ownMatches.length > 0 && <Button variant="secondary" onClick={() => void enterMatch(ownMatches.find(([, m]) => m.status !== 'COMPLETED')?.[0] || ownMatches[0][0])}><DoorOpen className="size-4" />Trận của đội tôi</Button>}
            </div>
          </Card>

          {tournament.loading ? <SkeletonRows rows={5} /> : !t ? <EmptyState title="Chưa chọn giải đấu" hint="Chọn giải ở tab Bảng đấu." /> : !match ? (
            matches.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{matches.map(([id, m]) => <MatchCard key={id} id={id} match={m} onOpen={(mid) => void enterMatch(mid)} />)}</div>
            ) : <EmptyState title="Giải chưa có trận" hint="Ban tổ chức cần xếp lịch để tạo cặp đấu." />
          ) : tab === 'chat' ? (
            <ChatPanel tournamentId={tournamentId} matchId={matchId} match={match} />
          ) : tab === 'records' ? (
            <RecordsPanel tournamentId={tournamentId} matchId={matchId} match={match} canSeeCode={own || role === 'ADMIN'} task={t.round_mode === 'TASK'} />
          ) : tab === 'submit' ? (
            <SubmitPanel tournamentId={tournamentId} matchId={matchId} match={match} tournament={t} />
          ) : tab === 'control' ? (
            <ControlPanel tournamentId={tournamentId} matchId={matchId} match={match} tournament={t} />
          ) : (
            <>
              <Card title={match.title || matchId} subtitle={match.round_name} action={<RuleLine tournament={t} match={match} now={now} />}>
                <Scoreboard match={match} task={t.round_mode === 'TASK'} />
              </Card>
              {t.round_mode === 'TASK' && <TaskMatchInfo match={match} />}
              {t.round_mode === 'TASK' && match.team_a && match.team_b && !match.current_task && match.status !== 'COMPLETED' && (
                <Card><EmptyState icon={<Hourglass className="size-6" />} title="Chưa công bố đề của hiệp này" hint="Ban tổ chức cần khóa bộ đề của giải chính. Trang sẽ tự hiện đề khi có." /></Card>
              )}
              {t.round_mode === 'TASK' && match.current_task && match.status !== 'COMPLETED' && <RoundTaskCard tournamentId={tournamentId} matchId={matchId} task={match.current_task} round={match.current_round_idx || 1} canDownload={own || role === 'ADMIN'} />}
              <Card title={t.round_mode === 'TASK' ? 'Kết quả các hiệp' : 'Sân đấu'} subtitle={t.round_mode === 'TASK' ? 'Mỗi hiệp một đề học máy: hai đội cùng giải, điểm cao hơn thắng hiệp' : 'Bàn cờ do server thực thi — chọn hiệp, tua từng bước, đổi giao diện hoặc xem 3D điện ảnh'}>
                <RoundsPanel tournamentId={tournamentId} matchId={matchId} match={match} task={t.round_mode === 'TASK'} />
              </Card>
              <WebcamPanel tournamentId={tournamentId} matchId={matchId} round={match.current_round_idx || 1} running={match.round_status === 'BATTLE_RUNNING'} />
            </>
          )}
        </>
      )}
    </div>
  )
}
