'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ClipboardList, DoorOpen, Handshake, History, Radio, Search, ShieldAlert, Swords } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { countdown, decodeRule, sameStudent, shortTime, stamp } from '@/lib/format'
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SectionTitle, Select, SkeletonRows, StatusBadge, Tabs } from '../ui'
import { useLive } from '../context'
import { BoardPlayer } from '../board'
import { MatchCard, TeamLine, historyWinner, useHistory, useNow, winnerSide } from '../shared'
import { Workbench } from '../workbench'
import { enqueue, isRetryable, newSubmissionId } from '@/lib/outbox'
import { WebcamPanel } from '../webcam-panel'
import { ScrimmagePanel } from '../scrimmage'

type MatchTab = 'live' | 'submit' | 'history' | 'practice' | 'control' | 'scrim'

function RuleLine({ tournament, match, now }: { tournament: any; match: any; now: number }) {
  const level = match.round_level
  const rule = tournament.stage_rules?.[level]
  const window = tournament.stage_schedule?.[level]
  const decoded = decodeRule(rule?.rule_id || tournament.stage_rule)
  const chips = [...decoded.active, ...decoded.extra]
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
      <p className="font-display mt-1 text-2xl font-black md:text-4xl">🏆 {name} giành chiến thắng!</p>
    </div>
  )
}

function Scoreboard({ match }: { match: any }) {
  const won = winnerSide(match)
  const now = useNow()
  const ends = match.intermission_ends_at ? Number(match.intermission_ends_at) * 1000 : 0
  const live = match.status === 'IN_PROGRESS'
  const Side = ({ side, tone }: { side: 'team_a' | 'team_b'; tone: 'red' | 'blue' }) => {
    const team = match[side]
    const isWin = won === side
    return (
      <div className={cn('relative flex flex-1 flex-col items-center gap-3 rounded-2xl border p-5 text-center', tone === 'red' ? 'border-red-500/30 bg-gradient-to-b from-red-500/15 to-transparent' : 'border-blue-500/30 bg-gradient-to-b from-blue-500/15 to-transparent', isWin && 'glow-gold')}>
        <span className={cn('text-[11px] font-extrabold uppercase tracking-[0.2em]', tone === 'red' ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400')}>{tone === 'red' ? 'Đội Đỏ' : 'Đội Xanh'}</span>
        {team ? <Avatar name={team.team_name} size="xl" ring={isWin ? 'gold' : tone} /> : <span className="size-16 rounded-2xl border border-dashed border-border" aria-hidden />}
        <p className="font-display max-w-full truncate text-lg font-extrabold">{team?.team_name || 'Chờ đội'}</p>
        <p className="font-display text-6xl font-black tabular-nums leading-none">{team ? team.rounds_won ?? 0 : '–'}</p>
        {isWin && <Badge tone="warning">🏆 Chiến thắng</Badge>}
        {team && !isWin && (team.code_valid ? <Badge tone="success">Đã nộp bot</Badge> : team.code_submitted ? <Badge tone="danger">Bot lỗi</Badge> : <Badge tone="warning">Chưa nộp bot</Badge>)}
      </div>
    )
  }
  return (
    <div className="relative space-y-5">
      <RoundBanner round={match.current_round_idx || 1} matchId={match.match_id} />
      {match.status === 'COMPLETED' && match.winner_name && <VictoryBanner name={match.winner_name} />}
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <Side side="team_a" tone="red" />
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <span className="font-display gradient-text text-4xl font-black">VS</span>
          <span className="text-xs font-semibold text-muted-foreground">Bo{match.max_rounds || 5} · thắng 3 hiệp</span>
          {live && <Badge tone="success"><span className="animate-live size-1.5 rounded-full bg-emerald-400" aria-hidden />ĐANG ĐẤU</Badge>}
        </div>
        <Side side="team_b" tone="blue" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <StatusBadge status={match.status} />
        {match.status !== 'COMPLETED' && <StatusBadge status={match.round_status} />}
        <Badge>Hiệp {match.current_round_idx || 1}/{match.max_rounds || 5}</Badge>
        {ends > now && <Badge tone="info">Hiệp kế tiếp sau {countdown(Math.ceil((ends - now) / 1000))}</Badge>}
        {match.winner_name && <Badge tone="accent">Thắng: {match.winner_name}</Badge>}
      </div>
    </div>
  )
}

function RoundsPanel({ tournamentId, matchId, match }: { tournamentId: string; matchId: string; match: any }) {
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
  if (!rounds.length) return <EmptyState title="Chưa có hiệp nào hoàn tất" hint="Bàn cờ và nhật ký xuất hiện sau khi ban tổ chức khai hỏa hiệp đầu tiên." />
  const data = replay.data
  const logs: any[] = [...(data?.system_logs || []), ...(data?.move_logs || []).map((l: any) => l.log || l)]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn hiệp">
        {rounds.map((r, i) => {
          const n = Number(r.round_number || i + 1)
          return <Button key={n} size="sm" variant={n === number ? 'primary' : 'secondary'} onClick={() => setSelected(n)}>Hiệp {n}{r.winner_name ? ` · ${r.winner_name}` : ''}</Button>
        })}
      </div>
      {replay.loading ? <SkeletonRows rows={4} /> : replay.error && !data ? <ErrorNote message={replay.error.message} onRetry={() => void replay.reload()} /> : data && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <BoardPlayer steps={data.board_steps || []} autoPlay={selected !== null} redName={data.team_a_name || match.team_a?.team_name} blueName={data.team_b_name || match.team_b?.team_name} />
          <div className="space-y-3">
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Kết quả hiệp {data.round_number}</p><p className="mt-1 font-semibold">{data.winner_name}</p><p className="text-sm text-muted-foreground">{data.win_reason}</p></div>
            {data.rules && <div className="flex flex-wrap gap-1.5">{[...decodeRule(data.stage_rule).active].map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>}
            <div className="max-h-64 overflow-y-auto rounded-xl bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {logs.length ? logs.map((l, i) => <p key={i}>{typeof l === 'string' ? l : JSON.stringify(l)}</p>) : <p>Không có nhật ký.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionHistory({ tournamentId, matchId, enabled }: { tournamentId: string; matchId: string; enabled: boolean }) {
  const { scope, role } = useLive()
  const subs = useResource<any[]>(enabled ? `subs:${scope}:${tournamentId}:${matchId}` : null, () => arenaApi.getSubmissions(tournamentId, matchId).then((r: any) => (Array.isArray(r) ? r : [])), { ttl: 5_000, refreshMs: 15_000 })
  if (!enabled) return null
  const list = [...(subs.data || [])].sort((a, b) => Number(b.submitted_at) - Number(a.submitted_at))
  return (
    <Card title="Lịch sử bài nộp" subtitle="Chỉ đội của bạn và ban tổ chức xem được mã nguồn">
      {subs.loading ? <SkeletonRows rows={3} /> : list.length ? (
        <DataTable head={['Thời gian', 'Hiệp', ...(role === 'ADMIN' ? ['Đội'] : []), 'Ngôn ngữ', 'Kết quả', 'Chi tiết']}>
          {list.map((s) => (
            <tr key={s.submission_id} className="align-top">
              <td className="px-3 py-2.5 whitespace-nowrap">{stamp(s.submitted_at)}</td>
              <td className="px-3 py-2.5 tabular-nums">{s.round_number}</td>
              {role === 'ADMIN' && <td className="px-3 py-2.5">{s.team_name}</td>}
              <td className="px-3 py-2.5">{s.language}</td>
              <td className="px-3 py-2.5"><StatusBadge status={s.validation_status} />{s.execution_time_ms ? <span className="ml-2 text-xs text-muted-foreground">{s.execution_time_ms} ms</span> : null}</td>
              <td className="px-3 py-2.5 text-xs">
                {s.error_message && <p className="mb-1 text-red-600 dark:text-red-400">{s.error_message}</p>}
                {s.explanation && <p className="mb-1 text-muted-foreground">Ghi chú: {s.explanation}</p>}
                {s.code && <details><summary className="cursor-pointer font-semibold text-primary">Xem mã</summary><pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-2 font-mono text-[11px]">{s.code}</pre></details>}
              </td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="Chưa có bài nộp" />}
    </Card>
  )
}

function SubmitPanel({ tournamentId, matchId, match, tournament }: { tournamentId: string; matchId: string; match: any; tournament: any }) {
  const { session, enterMatch, toast, outbox, flushOutbox } = useLive()
  const now = useNow(5000)
  const inRoom = session.match_id === matchId
  const side = sameStudent(match.team_a?.student_id, session.student_id) ? 'team_a' : 'team_b'
  const rule = tournament.stage_rules?.[match.round_level]
  const window = tournament.stage_schedule?.[match.round_level]
  let blocked = ''
  if (match.status === 'COMPLETED') blocked = 'Trận đã kết thúc.'
  else if (!match.team_a || !match.team_b) blocked = 'Chờ đối thủ — chưa thể nộp bot.'
  else if (rule?.hidden) blocked = `Luật vòng này chưa công bố (${shortTime(rule.publish_at)}).`
  else if (window?.starts_at && now < window.starts_at * 1000) blocked = `Vòng mở lúc ${shortTime(window.starts_at)}.`
  else if (window?.ends_at && now > window.ends_at * 1000) blocked = 'Cửa sổ nộp bài của vòng đã đóng.'
  else if (['BATTLE_RUNNING', 'ROUND_FINISHED'].includes(match.round_status)) blocked = 'Hiệp đang chạy / nghỉ giữa hiệp — chờ hiệp kế tiếp để nộp bot mới.'
  const [submitting, setSubmitting] = useState(false)
  const pending = outbox.filter((o) => o.kind === 'match' && o.matchId === matchId)

  if (!inRoom) {
    return (
      <Card title="Phòng nộp bot">
        <EmptyState icon={<DoorOpen className="size-7" />} title="Vào phòng thi đấu của đội để nộp bot" hint="Phiên nộp bài gắn với từng trận để đảm bảo không nộp nhầm đội." action={<Button onClick={() => void enterMatch(matchId)}>Vào phòng trận này</Button>} />
      </Card>
    )
  }
  const ruleId = rule?.hidden ? undefined : rule?.rule_id || tournament.stage_rule
  return (
    <div className="space-y-5">
      <Card title={`Nộp bot — Hiệp ${match.current_round_idx || 1}`} subtitle="Mỗi hiệp cần một bài nộp mới; bài hợp lệ cuối cùng được khóa khi ban tổ chức khai hỏa.">
        <Workbench
          draftKey={`match:${tournamentId}:${matchId}:${session.student_id}:${match.current_round_idx || 1}`}
          ruleId={ruleId}
          withExplanation
          submitLabel="Nộp bài chính thức"
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
          extra={pending.length > 0 ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <span>{pending.length} bài của trận này đang lưu trên thiết bị, chưa được server xác nhận. “Đã lưu trên máy” chưa phải “server đã nhận”.</span>
              <Button size="sm" variant="secondary" onClick={() => void flushOutbox()}>Gửi lại ngay</Button>
            </div>
          ) : undefined}
        />
      </Card>
      <SubmissionHistory tournamentId={tournamentId} matchId={matchId} enabled />
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

  return (
    <div className="space-y-5">
      <Card title="Điều hành trận" subtitle={ready ? 'Cả hai đội đã nộp bot hợp lệ — sẵn sàng khai hỏa.' : 'Chỉ khai hỏa được khi cả hai đội đã nộp bot hợp lệ.'}>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={match.status === 'COMPLETED'} onClick={() => void run(() => arenaApi.playRound(tournamentId, matchId), 'Đã chạy hiệp trên server', reload)}><Swords className="size-4" />Khai hỏa hiệp</Button>
          <Button variant="secondary" disabled={busy || match.status === 'COMPLETED'} onClick={() => void run(() => arenaApi.nextRound(tournamentId, matchId), 'Đã chuyển sang hiệp tiếp theo', reload)}>Hiệp tiếp theo</Button>
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

  const tabs: { id: MatchTab; label: string; icon: React.ReactNode }[] = [
    { id: 'live', label: 'Diễn biến', icon: <Radio className="size-4" /> },
    ...(own ? [{ id: 'submit' as const, label: 'Nộp bot', icon: <ClipboardList className="size-4" /> }] : []),
    ...(role === 'ADMIN' && match ? [{ id: 'control' as const, label: 'Điều hành', icon: <ShieldAlert className="size-4" /> }] : []),
    { id: 'practice', label: 'Đấu thử boss', icon: <Bot className="size-4" /> },
    { id: 'scrim', label: 'Giao hữu', icon: <Handshake className="size-4" /> },
    { id: 'history', label: 'Lịch sử', icon: <History className="size-4" /> },
  ]
  useEffect(() => { if (!tabs.some((x) => x.id === tab)) setTab('live') }, [tabs, tab])

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Phòng thi đấu" title="Trận đấu">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </SectionTitle>

      {tab === 'history' ? <HistoryPanel /> : tab === 'scrim' ? <ScrimmagePanel /> : tab === 'practice' ? (
        <Card title="Đấu thử với boss" subtitle="Không ghi vào giải, bài nộp, lịch sử hay ELO. Bot của bạn luôn là phía Đỏ.">
          <Workbench draftKey={`practice:${session.student_id || 'guest'}`} />
        </Card>
      ) : (
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

          {tournament.loading ? <SkeletonRows rows={5} /> : !t ? <EmptyState title="Chưa chọn giải đấu" hint="Chọn giải ở thanh trên cùng." /> : !match ? (
            matches.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{matches.map(([id, m]) => <MatchCard key={id} id={id} match={m} onOpen={(mid) => void enterMatch(mid)} />)}</div>
            ) : <EmptyState title="Giải chưa có trận" hint="Ban tổ chức cần xếp lịch để tạo cặp đấu." />
          ) : tab === 'submit' ? (
            <SubmitPanel tournamentId={tournamentId} matchId={matchId} match={match} tournament={t} />
          ) : tab === 'control' ? (
            <ControlPanel tournamentId={tournamentId} matchId={matchId} match={match} tournament={t} />
          ) : (
            <>
              <Card title={match.title || matchId} subtitle={match.round_name} action={<RuleLine tournament={t} match={match} now={now} />}>
                <Scoreboard match={match} />
              </Card>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <Card title="Sân đấu" subtitle="Bàn cờ do server thực thi — chọn hiệp, tua từng bước, đổi giao diện hoặc xem 3D điện ảnh">
                  <RoundsPanel tournamentId={tournamentId} matchId={matchId} match={match} />
                </Card>
                <div className="space-y-6">
                  <WebcamPanel tournamentId={tournamentId} matchId={matchId} />
                </div>
              </div>
              {(own || role === 'ADMIN') && <SubmissionHistory tournamentId={tournamentId} matchId={matchId} enabled={role === 'ADMIN' || session.match_id === matchId} />}
            </>
          )}
        </>
      )}
    </div>
  )
}
