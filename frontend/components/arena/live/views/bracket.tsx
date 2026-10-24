'use client'

import { useMemo } from 'react'
import { Eye, EyeOff, Settings2, Trophy } from 'lucide-react'
import { decodeRule, shortTime } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, SectionTitle, Skeleton, SkeletonRows, StatusBadge } from '../ui'
import { useLive } from '../context'
import { useNow } from '../shared'
import { BracketTree } from '../bracket-tree'

function WindowBadge({ window, now }: { window?: any; now: number }) {
  if (!window?.starts_at || !window?.ends_at) return <Badge>Chưa đặt lịch</Badge>
  const start = Number(window.starts_at) * 1000
  const end = Number(window.ends_at) * 1000
  if (now < start) return <Badge tone="info" dot>Mở lúc {shortTime(start / 1000)}</Badge>
  if (now < end) return <Badge tone="success" dot>Đang mở · đóng {shortTime(end / 1000)}</Badge>
  return <Badge tone="neutral">Đã đóng</Badge>
}

function RuleChips({ rule, fallback }: { rule?: any; fallback?: string }) {
  if (rule?.hidden) return <Badge tone="warning"><EyeOff className="size-3" />Chưa công bố{rule.publish_at ? ` · ${shortTime(rule.publish_at)}` : ''}</Badge>
  const decoded = decodeRule(rule?.rule_id || fallback)
  const chips = [...decoded.active, ...decoded.extra]
  if (!chips.length) return <Badge tone="neutral">Luật chuẩn</Badge>
  return <div className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="accent"><Eye className="size-3" />{c}</Badge>)}</div>
}

export function BracketView() {
  const { tournament, tournaments, tournamentId, enterMatch, matchId, role, navigate } = useLive()
  const now = useNow(5000)
  const t = tournament.data
  const rounds = useMemo(() => {
    const groups = new Map<number, [string, any][]>()
    Object.entries(t?.matches || {}).forEach(([id, m]: [string, any]) => {
      const level = Number(m.round_level) || 1
      groups.set(level, [...(groups.get(level) || []), [id, m]])
    })
    return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([level, list]) => ({ level, name: list[0][1].round_name || `Vòng ${level}`, list: list.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })) }))
  }, [t])

  const champion = typeof t?.champion === 'string' ? t.champion : t?.champion?.team_name
  const eliminated = new Set<string>((t?.teams || []).filter((x: any) => x.disqualified || x.status === 'DISQUALIFIED').map((x: any) => x.student_id))

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Giải chính" title="Bảng đấu">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { window.location.hash = 'trinh-chieu' }}>📺 Trình chiếu</Button>
          {role === 'ADMIN' && <Button variant="secondary" onClick={() => navigate('admin')}><Settings2 className="size-4" />Quản lý nhánh đấu</Button>}
        </div>
      </SectionTitle>

      {champion && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
          <Trophy className="size-6 text-amber-500" aria-hidden />
          <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Quán quân</p><p className="text-lg font-bold">{champion}</p></div>
        </div>
      )}

      {tournaments.loading || (tournamentId && tournament.loading) ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
      ) : !t ? (
        <Card><EmptyState title="Chưa chọn giải đấu" hint="Chọn giải ở thanh trên cùng." /></Card>
      ) : !rounds.length ? (
        <Card><EmptyState title="Giải chưa có sơ đồ nhánh" /></Card>
      ) : (
        <Card title={t.name} subtitle={`${t.teams?.length ?? 0}/${t.num_teams} đội · Bo5, mỗi hiệp nộp bot mới`} action={<StatusBadge status={t.status} />} padded={false}>
          <div className="p-5">
            <BracketTree matches={t.matches} selected={matchId} onOpen={(mid) => void enterMatch(mid)} />
          </div>
        </Card>
      )}

      {t && (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card title="Luật và lịch từng vòng" subtitle="Luật chỉ hiện sau giờ công bố; mỗi hiệp vẫn phải nộp bot mới">
            {tournament.loading ? <SkeletonRows rows={3} /> : rounds.length ? (
              <DataTable head={['Vòng', 'Cửa sổ nộp / thi đấu', 'Luật áp dụng']}>
                {rounds.map((round) => (
                  <tr key={round.level} className="align-top">
                    <td className="px-3 py-3 font-semibold">{round.name}</td>
                    <td className="px-3 py-3"><WindowBadge window={t.stage_schedule?.[round.level]} now={now} /></td>
                    <td className="px-3 py-3"><RuleChips rule={t.stage_rules?.[round.level]} fallback={t.stage_rule} /></td>
                  </tr>
                ))}
              </DataTable>
            ) : <EmptyState title="Chưa có vòng nào" />}
          </Card>

          <Card title={`Đội tham gia (${t.teams?.length ?? 0})`}>
            {t.teams?.length ? (
              <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {t.teams.map((team: any) => (
                  <li key={team.student_id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="min-w-0 truncate font-medium">{team.team_name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{team.university}{eliminated.has(team.student_id) && <Badge tone="danger">Bị loại</Badge>}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Chưa có đội nào" hint="Đội được ghi danh bởi ban tổ chức hoặc chuyển từ vòng loại." />}
          </Card>
        </div>
      )}
    </div>
  )
}
