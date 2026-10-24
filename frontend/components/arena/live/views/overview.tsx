'use client'

import { Bell, Bot, CalendarClock, CheckCircle2, Flag, History, Radio, Swords, Trophy, Upload, Users } from 'lucide-react'
import { countdown, relative, shortTime, toDate } from '@/lib/format'
import { Badge, Button, Card, EmptyState, ProgressBar, Skeleton, SkeletonCards, SkeletonRows, Stat, StatusBadge } from '../ui'
import { useLive } from '../context'
import { Billboard } from '../billboard'
import { MatchCard, historyWinner, useHistory, useNow, useRanking } from '../shared'

function StageClock({ tournament }: { tournament: any }) {
  const now = useNow()
  const windows = Object.entries(tournament?.stage_schedule || {})
    .map(([level, w]: [string, any]) => ({ level: Number(level), starts: Number(w.starts_at) * 1000, ends: Number(w.ends_at) * 1000 }))
    .filter((w) => w.starts && w.ends)
    .sort((a, b) => a.starts - b.starts)
  if (!windows.length) return <p className="text-sm text-muted-foreground">Ban tổ chức chưa đặt lịch mở/đóng các vòng.</p>
  const open = windows.find((w) => now >= w.starts && now < w.ends)
  const next = windows.find((w) => w.starts > now)
  const name = (level: number) => (Object.values(tournament.matches || {}).find((m: any) => m.round_level === level) as any)?.round_name || `Vòng ${level}`
  if (open) return (
    <div>
      <Badge tone="success" dot>{name(open.level)} đang mở</Badge>
      <p className="mt-2 text-3xl font-bold tabular-nums">{countdown(Math.floor((open.ends - now) / 1000))}</p>
      <p className="text-xs text-muted-foreground">đến khi đóng vòng · {shortTime(open.ends / 1000)}</p>
    </div>
  )
  if (next) return (
    <div>
      <Badge tone="info" dot>Sắp mở: {name(next.level)}</Badge>
      <p className="mt-2 text-3xl font-bold tabular-nums">{countdown(Math.floor((next.starts - now) / 1000))}</p>
      <p className="text-xs text-muted-foreground">đến giờ mở · {shortTime(next.starts / 1000)}</p>
    </div>
  )
  return <p className="text-sm text-muted-foreground">Tất cả các vòng đã đóng.</p>
}

function Hero() {
  const { role, session, navigate, openAuth, tournament, ownMatches, enterMatch, qualifiers } = useLive()
  const live = Object.values(tournament.data?.matches || {}).some((m: any) => m.status === 'IN_PROGRESS')
  const openQualifier = qualifiers.data?.find((q) => q.status === 'OPEN')
  const nextOwn = ownMatches.find(([, m]) => m.status !== 'COMPLETED' && m.team_a && m.team_b)
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/25 via-card to-cyan/10 p-6 shadow-lg md:p-10">
      <div className="hero-grid absolute inset-0 -z-10" aria-hidden />
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="max-w-2xl">
        <Badge tone={live ? 'success' : 'accent'}>{live ? <><span className="animate-live size-1.5 rounded-full bg-emerald-400" aria-hidden />ĐANG CÓ TRẬN TRỰC TIẾP</> : 'FRESHMAN BOT ARENA · K69'}</Badge>
        <h1 className="font-display mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">Lập trình bot.<br /><span className="gradient-text">Chinh phục đấu trường.</span></h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">Viết thuật toán Oẳn Tù Tì trên bàn cờ 9×9, nộp bot và xem nó thi đấu tự động. Leo bảng xếp hạng, vượt vòng loại và giành ngôi quán quân.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {role === 'GUEST' && <>
            <Button size="md" className="px-6 py-3 text-base" onClick={() => openAuth('register')}>Đăng ký đội thi</Button>
            <Button size="md" variant="secondary" className="px-6 py-3 text-base" onClick={() => navigate('bracket')}>Xem bảng đấu</Button>
          </>}
          {role === 'TEAM' && <>
            {nextOwn ? <Button className="px-6 py-3 text-base" onClick={() => void enterMatch(nextOwn[0])}><Swords className="size-5" />Vào trận của {session.team_name || 'đội'}</Button>
              : openQualifier ? <Button className="px-6 py-3 text-base" onClick={() => navigate('qualifier')}><Upload className="size-5" />Nộp bài vòng loại</Button>
              : <Button className="px-6 py-3 text-base" onClick={() => navigate('match')}><Bot className="size-5" />Luyện tập với boss</Button>}
            <Button variant="secondary" className="px-6 py-3 text-base" onClick={() => navigate('guide')}>Xem hướng dẫn</Button>
          </>}
          {role === 'ADMIN' && <>
            <Button className="px-6 py-3 text-base" onClick={() => navigate('admin')}>Mở bảng điều hành</Button>
            <Button variant="secondary" className="px-6 py-3 text-base" onClick={() => navigate('bracket')}>Xem bảng đấu</Button>
          </>}
        </div>
      </div>
      <Billboard />
      </div>
    </section>
  )
}

export function OverviewView() {
  const { tournament, tournaments, qualifiers, notifications, tournamentId, enterMatch, navigate, setQualifierId, role } = useLive()
  const ranking = useRanking()
  const history = useHistory()
  const t = tournament.data
  const matches: [string, any][] = Object.entries(t?.matches || {})
  const live = matches.filter(([, m]) => ['IN_PROGRESS', 'READY'].includes(m.status) && m.team_a && m.team_b)
  const done = matches.filter(([, m]) => m.status === 'COMPLETED').length
  const submitted = new Set<string>()
  matches.forEach(([, m]) => ['team_a', 'team_b'].forEach((s) => { if (m[s]?.code_submitted && m[s]?.student_id) submitted.add(m[s].student_id) }))

  return (
    <div className="space-y-6">
      <Hero />

      <Card>
        {tournaments.loading ? <Skeleton className="h-16 w-full" /> : !tournamentId ? (
          <EmptyState title="Chưa có giải đấu nào" hint="Ban tổ chức sẽ tạo giải trong khu Quản trị." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t?.status} />
                {t?.champion && <Badge tone="warning"><Trophy className="size-3" />Quán quân: {typeof t.champion === 'string' ? t.champion : t.champion.team_name}</Badge>}
              </div>
              <h2 className="mt-2 truncate text-xl font-bold tracking-tight">{t?.name || tournaments.data?.find((x) => x.tournament_id === tournamentId)?.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t?.teams?.length ?? 0}/{t?.num_teams ?? '—'} đội ghi danh · {matches.length} trận</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4 lg:min-w-72">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><CalendarClock className="size-4" />Lịch vòng đấu (giờ server)</p>
              {tournament.loading ? <Skeleton className="h-14 w-full" /> : <StageClock tournament={t} />}
            </div>
          </div>
        )}
      </Card>

      {tournament.loading && tournamentId ? <SkeletonCards /> : t && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<Users className="size-4" />} label="Đội tham gia" value={t.teams?.length ?? 0} hint={`Tối đa ${t.num_teams ?? '—'} đội`} />
          <Stat icon={<CheckCircle2 className="size-4" />} label="Trận hoàn tất" value={`${done}/${matches.length}`} />
          <Stat icon={<Radio className="size-4" />} label="Đang diễn ra" value={live.length} tone={live.length ? 'success' : undefined} />
          <Stat icon={<Upload className="size-4" />} label="Đội đã nộp bot" value={submitted.size} hint={`${Math.max(0, (t.teams?.length ?? 0) - submitted.size)} đội chưa nộp`} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card icon={<Swords />} title="Trận đang chờ / đang đấu" subtitle="Bấm để vào xem diễn biến">
            {tournament.loading ? <SkeletonRows rows={3} /> : live.length ? (
              <div className="grid gap-3 md:grid-cols-2">{live.map(([id, m]) => <MatchCard key={id} id={id} match={m} onOpen={(mid) => void enterMatch(mid)} />)}</div>
            ) : <EmptyState title="Hiện chưa có trận nào đang diễn ra" hint="Trận sẽ xuất hiện ở đây khi hai đội đã được xếp cặp." />}
          </Card>

          <Card icon={<History />} title="Kết quả gần đây" subtitle="Các trận Bo5 đã có hiệp hoàn tất trên toàn hệ thống">
            {history.loading ? <SkeletonRows rows={4} /> : history.data?.length ? (
              <ul className="divide-y divide-border">
                {[...history.data].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 8).map((item) => (
                  <li key={item.match_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0 basis-full font-medium sm:basis-0 sm:flex-1 sm:truncate">{(item.bot_names || []).join("  vs  ")}</span>
                    <span className="text-xs text-muted-foreground">{item.stage}</span>
                    {historyWinner(item).done ? <Badge tone="accent"><Trophy className="size-3" />{item.winner_name}</Badge> : <Badge tone="info" dot>Đang đấu · {item.total_rounds} hiệp</Badge>}
                    <span className="w-24 text-right text-xs text-muted-foreground">{toDate(item.timestamp) ? relative(item.timestamp) : '—'}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Chưa có trận nào kết thúc" />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card icon={<Flag />} title="Vòng loại" action={<button className="text-xs font-semibold text-primary hover:underline" onClick={() => navigate('qualifier')}>Mở tab Vòng loại →</button>}>
            {qualifiers.loading ? <SkeletonRows rows={2} /> : qualifiers.data?.length ? (
              <div className="space-y-4">
                {qualifiers.data.slice(0, 3).map((q) => (
                  <button key={q.id} className="block w-full rounded-xl border border-border p-3 text-left hover:border-primary/50" onClick={() => { setQualifierId(q.id); navigate('qualifier') }}>
                    <div className="mb-2 flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold"><Flag className="size-4 shrink-0 text-primary" />{q.name}</span><StatusBadge status={q.status} /></div>
                    <ProgressBar value={q.completed || 0} max={q.total || 0} label={q.total ? `${q.completed || 0}/${q.total} trận chấm` : `Hạn nộp: ${shortTime(q.deadline)}`} />
                  </button>
                ))}
              </div>
            ) : <EmptyState title="Chưa có vòng loại" />}
          </Card>

          <Card icon={<Trophy />} title="Top 5 xếp hạng" action={<button className="text-xs font-semibold text-primary hover:underline" onClick={() => navigate('ranking')}>Xem tất cả →</button>}>
            {ranking.loading ? <SkeletonRows rows={5} /> : ranking.data?.length ? (
              <ol className="space-y-2">
                {ranking.data.slice(0, 5).map((r, i) => (
                  <li key={r.student_id} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.bot_name}</span>
                    <span className="font-semibold tabular-nums">{r.elo_score}</span>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="Chưa có dữ liệu xếp hạng" />}
          </Card>

          <Card icon={<Bell />} title="Thông báo mới" action={role !== 'GUEST' ? <Badge tone="accent">{notifications.data?.unread_count ?? 0} chưa đọc</Badge> : undefined}>
            {notifications.loading ? <SkeletonRows rows={3} /> : notifications.data?.notifications.length ? (
              <ul className="space-y-3">
                {notifications.data.notifications.slice(0, 3).map((n) => (
                  <li key={n.id} className="flex gap-3 text-sm">
                    <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0"><p className="truncate font-semibold">{n.title}</p><p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p></div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Chưa có thông báo" />}
          </Card>
        </div>
      </div>
    </div>
  )
}
