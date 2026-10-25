'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Award, Bell, CheckCheck, DoorOpen, History, LineChart, LogIn, Search, Swords, UserRound } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { relative, sameStudent, stamp } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SectionTitle, Select, Skeleton, SkeletonRows, Stat, StatusBadge, Tabs, TextArea } from '../ui'
import { useLive, type ViewId } from '../context'
import { MatchCard, historyWinner, useHistory, useRanking } from '../shared'
import { BotAnalytics } from '../profile-insights'
import { PasswordCard, TeamEmailCard } from '../email-card'
import { BadgeStrip } from '../challenges'
import { ScoreHistoryTable, scoreRows } from '../qualifier-extras'
import { CertificateVault } from '../certificate-vault'

const VIEWS: ViewId[] = ['profile', 'overview', 'bracket', 'ranking', 'match', 'qualifier', 'guide', 'admin']

/** Lịch sử tính điểm vòng loại của đội (vòng loại đang chọn), xem ngay trong hồ sơ. */
function ProfileScoreHistory() {
  const { qualifiers, qualifierId, setQualifierId, session, scope } = useLive()
  const detail = useResource<any>(qualifierId ? `q:detail:${scope}:${qualifierId}` : null, () => arenaApi.getQualifier(qualifierId), { ttl: 15_000, refreshMs: 20_000 })
  if (!qualifiers.data?.length) return null
  return (
    <Card icon={<LineChart />} title="Lịch sử tính điểm" subtitle="ELO trước và sau từng trận vòng loại" action={qualifiers.data.length > 1 ? (
      <Select aria-label="Chọn vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)} className="w-56">{qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Select>
    ) : undefined}>
      {detail.loading ? <SkeletonRows rows={4} /> : <ScoreHistoryTable rows={scoreRows(detail.data?.results || [], session.student_id || '')} />}
    </Card>
  )
}

export function NotificationList({ limit, onOpenItem }: { limit?: number; onOpenItem?: () => void }) {
  const { notifications, role, run, navigate } = useLive()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const all = notifications.data?.notifications || []
  const list = (filter === 'unread' ? all.filter((n) => !n.is_read) : all).slice(0, limit)
  const markAll = () => run(() => arenaApi.markNotificationRead(), 'Đã đánh dấu tất cả là đã đọc', () => invalidate('nt:'))
  const open = (n: any) => {
    if (role !== 'GUEST' && !n.is_read) void arenaApi.markNotificationRead(n.id).then(() => invalidate('nt:')).catch(() => undefined)
    onOpenItem?.()
    const tab = String(n.link_tab || '').replace(/^tab-/, '') as ViewId
    if (VIEWS.includes(tab)) navigate(tab)
    // Thông báo trỏ tới một mục trong trang (vd. kho giấy chứng nhận): cuộn tới mục đó sau khi trang hiện ra.
    const section = n.link_data?.section
    if (section) window.setTimeout(() => document.getElementById(String(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500)
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'Tất cả' }, { id: 'unread', label: 'Chưa đọc', badge: notifications.data?.unread_count ? <Badge tone="accent">{notifications.data.unread_count}</Badge> : undefined }]} />
        {role !== 'GUEST' && <Button size="sm" variant="secondary" onClick={() => void markAll()} disabled={!notifications.data?.unread_count}><CheckCheck className="size-4" />Đánh dấu đã đọc hết</Button>}
      </div>
      {notifications.loading ? <SkeletonRows rows={3} /> : list.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {list.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60', !n.is_read && role !== 'GUEST' && 'bg-primary/5')}>
                <Bell className={cn('mt-0.5 size-4 shrink-0', n.is_read ? 'text-muted-foreground' : 'text-primary')} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{n.title}</span><span className="block text-sm text-muted-foreground">{n.message}</span><span className="mt-1 block text-[11px] text-muted-foreground">{stamp(n.created_at)} · {relative(n.created_at)}</span></span>
                {!n.is_read && role !== 'GUEST' && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Chưa đọc" />}
              </button>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Chưa có thông báo" />}
    </div>
  )
}

export function ProfileView() {
  const { session, role, openAuth, qualifierId, scope, run, ownMatches, enterMatch, tournament, navigate } = useLive()
  const [lookup, setLookup] = useState('')
  const [target, setTarget] = useState('')
  const sid = role === 'TEAM' ? session.student_id || '' : target
  const own = role === 'TEAM' && sameStudent(sid, session.student_id)
  const canEdit = own || role === 'ADMIN'

  const profile = useResource<any>(sid ? `profile:${sid}` : null, () => arenaApi.getProfile(sid).then((r: any) => r.profile), { ttl: 30_000, refreshMs: 60_000 })
  const ranking = useRanking()
  const history = useHistory()
  const qualifier = useResource<any>(own && qualifierId ? `q:detail:${scope}:${qualifierId}` : null, () => arenaApi.getQualifier(qualifierId), { ttl: 10_000, refreshMs: 20_000 })
  const [form, setForm] = useState<any>(null)
  useEffect(() => setForm(profile.data ? { ...profile.data } : null), [profile.data])

  const rankIndex = (ranking.data || []).findIndex((r) => sameStudent(r.student_id, sid))
  const rankRow = rankIndex >= 0 ? ranking.data![rankIndex] : undefined
  const teamName = profile.data?.team_name || rankRow?.bot_name
  const myHistory = useMemo(() => (history.data || []).filter((h) => (h.bot_names || []).includes(teamName)).sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 10), [history.data, teamName])
  const participant = qualifier.data?.participant

  async function save(event: FormEvent) {
    event.preventDefault()
    await run(() => arenaApi.updateProfile(form), 'Đã lưu hồ sơ đội', () => invalidate('profile:'))
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Tài khoản" title="Hồ sơ đội" />

      {role !== 'TEAM' && (
        <Card title={role === 'ADMIN' ? 'Tra cứu hồ sơ đội' : 'Xem hồ sơ công khai'} subtitle="Nhập mã sinh viên của đội để xem thông tin và thành tích.">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setTarget(lookup.trim().toUpperCase()) }}>
            <Field label="Mã sinh viên" className="min-w-56 flex-1" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="VD: 24020130" />
            <Button type="submit" disabled={!lookup.trim()}><Search className="size-4" />Tra cứu</Button>
            {role === 'GUEST' && <Button variant="secondary" onClick={() => openAuth('login')}><LogIn className="size-4" />Đăng nhập</Button>}
          </form>
        </Card>
      )}

      {!sid ? (
        role === 'GUEST' ? <Card><EmptyState icon={<UserRound className="size-7" />} title="Đăng nhập để xem hồ sơ đội của bạn" action={<Button onClick={() => openAuth('login')}>Đăng nhập</Button>} /></Card> : null
      ) : profile.loading ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      ) : profile.error && !profile.data ? <ErrorNote message={profile.error.message} onRetry={() => void profile.reload()} /> : profile.data && form && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-extrabold text-primary" aria-hidden>{String(profile.data.team_name || '?').slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold">{profile.data.team_name}</h2><p className="text-sm text-muted-foreground">MSSV {profile.data.student_id}{profile.data.university ? ` · ${profile.data.university}` : ''}</p></div>
              {rankRow && <Badge tone="accent">Hạng #{rankIndex + 1} toàn hệ thống</Badge>}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="ELO toàn hệ thống" value={rankRow?.elo_score ?? '—'} />
              <Stat label="Thắng / Trận" value={rankRow ? `${rankRow.wins}/${rankRow.matches_played}` : '—'} hint={rankRow ? `${rankRow.win_rate}% tỉ lệ thắng` : 'Chưa thi đấu'} />
              <Stat label="ELO vòng loại" value={participant?.student_id ? Number(participant.elo).toFixed(1) : '—'} hint={own ? undefined : 'Chỉ hiện với tài khoản của bạn'} />
              <Stat label="Ngôn ngữ ưa dùng" value={profile.data.preferred_language || '—'} />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card title={canEdit ? 'Thông tin đội' : 'Giới thiệu'}>
              <form onSubmit={(e) => void save(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tên đội" value={form.team_name || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, team_name: e.target.value })} />
                  <Field label="Đội trưởng" value={form.captain_name || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, captain_name: e.target.value })} />
                  <Field label="Trường / Khoa" value={form.university || ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, university: e.target.value })} />
                  <Select label="Ngôn ngữ ưa dùng" disabled={!canEdit} value={form.preferred_language || 'PYTHON'} onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}>
                    <option value="PYTHON">Python</option><option value="CPP">C++</option>
                  </Select>
                </div>
                <TextArea label="Giới thiệu đội" rows={4} disabled={!canEdit} value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                {Array.isArray(profile.data.achievements) && profile.data.achievements.length > 0 && (
                  <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Thành tích</p><ul className="flex flex-wrap gap-2">{profile.data.achievements.map((a: any, i: number) => <li key={i}><Badge tone="warning">{typeof a === 'string' ? a : a.title || JSON.stringify(a)}</Badge></li>)}</ul></div>
                )}
                {canEdit && <Button type="submit">Lưu hồ sơ</Button>}
              </form>
            </Card>

            <div className="space-y-6">
              {own && (
                <Card icon={<Swords />} title="Trận của đội tôi" subtitle={tournament.data?.name}>
                  {ownMatches.length ? (
                    <div className="space-y-3">
                      {ownMatches.map(([id, m]) => (
                        <div key={id}><MatchCard id={id} match={m} compact />
                          <div className="mt-2 flex items-center justify-between"><StatusBadge status={m.status} /><Button size="sm" variant="secondary" onClick={() => void enterMatch(id)}><DoorOpen className="size-4" />Vào phòng</Button></div>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState title="Đội chưa có trận trong giải đang chọn" hint="Ban tổ chức sẽ ghi danh và xếp cặp. Bạn vẫn có thể tham gia vòng loại." action={<Button variant="secondary" size="sm" onClick={() => navigate('qualifier')}>Đến Vòng loại</Button>} />}
                </Card>
              )}
              <Card icon={<History />} title="Trận gần đây">
                {history.loading ? <SkeletonRows rows={3} /> : myHistory.length ? (
                  <DataTable head={['Vòng', 'Đối thủ', 'Kết quả']}>
                    {myHistory.map((h) => {
                      const opponent = (h.bot_names || []).find((n: string) => n !== teamName) || '—'
                      return <tr key={h.match_id}><td className="px-3 py-2">{h.stage}</td><td className="px-3 py-2">{opponent}</td><td className="px-3 py-2">{historyWinner(h).done ? <Badge tone={h.winner_name === teamName ? 'success' : 'danger'}>{h.winner_name === teamName ? 'Thắng' : 'Thua'}</Badge> : <Badge tone="info" dot>Đang đấu</Badge>}</td></tr>
                    })}
                  </DataTable>
                ) : <EmptyState title="Chưa có trận nào" />}
              </Card>
            </div>
          </div>
        </>
      )}

      {own && <CertificateVault />}
      {own && <div className="grid gap-6 xl:grid-cols-2"><TeamEmailCard /><PasswordCard /></div>}
      {own && <BotAnalytics teamName={profile.data?.team_name} />}
      {own && <ProfileScoreHistory />}
      {!own && sid && profile.data && <Card icon={<Award />} title="Huy hiệu thử thách"><BadgeStrip studentId={sid} /></Card>}

      {role !== 'GUEST' && <Card icon={<Bell />} title="Thông báo của bạn"><NotificationList /></Card>}
    </div>
  )
}
