'use client'

import { Crown, ListOrdered, Network, Swords, Trophy } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { levelName, sameStudent } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Select, Skeleton, SkeletonRows, StatusBadge } from '../../ui'
import { useLive } from '../../context'
import { BracketTree } from '../../bracket-tree'
import { RankBadge } from '../ranking'
import { useAiTournaments } from './common'

function AiRanking({ mine }: { mine?: string }) {
  const ranking = useResource<any[]>('rk:ai', () => arenaApi.getRanking('ai').then((r) => (Array.isArray(r) ? r : [])), { ttl: 15_000, refreshMs: 30_000 })
  const rows = ranking.data || []
  return (
    <Card icon={<ListOrdered />} title="Xếp hạng ELO giải chính AI" subtitle="Tính riêng từ các trận Bo5 của Giải AI (K=32), mọi đội bắt đầu từ 1200, độc lập với giải thường và vòng loại">
      {ranking.loading && !ranking.data ? <SkeletonRows rows={4} /> : ranking.error && !ranking.data ? <ErrorNote message={ranking.error.message} onRetry={() => void ranking.reload()} /> : rows.length ? (
        <DataTable head={['Hạng', 'Đội', 'ELO', 'Thắng / Trận']}>
          {rows.map((r, i) => (
            <tr key={r.student_id} data-testid="ai-elo-row" className={sameStudent(r.student_id, mine) ? '!bg-primary/10' : undefined}>
              <td className="w-14 px-3 py-2"><RankBadge rank={i + 1} /></td>
              <td className="px-3 py-2.5 font-medium">{r.bot_name}{sameStudent(r.student_id, mine) && <Badge tone="accent" className="ml-2">Bạn</Badge>}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.student_id}</span></td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{r.elo_score}</td>
              <td className="px-3 py-2.5 tabular-nums">{r.wins}/{r.matches_played}</td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState icon={<Trophy className="size-6" />} title="Chưa có trận nào kết thúc" hint="ELO giải chính AI xuất hiện sau trận đầu tiên." />}
    </Card>
  )
}

export function MainTab() {
  const { session, role, setTournamentId, setMatchId, navigate, enterMatch } = useLive()
  const { list, id, setId, current } = useAiTournaments()
  const detail = useResource<any>(id ? `t:ai:${role}:${id}` : null, () => arenaApi.getTournament(id), { ttl: 8_000, refreshMs: 20_000 })
  if (!list.length) {
    return (
      <div className="space-y-6">
        <Card><EmptyState icon={<Network className="size-7" />} title="Chưa có giải chính AI" hint="Sau vòng loại AI, ban tổ chức chốt các đội đứng đầu vào giải chính loại trực tiếp Bo5. Bảng đấu và trận đấu sẽ hiện ở đây." /></Card>
        <AiRanking mine={session.student_id} />
      </div>
    )
  }
  const t = detail.data
  const matches: [string, any][] = t?.matches ? Object.entries(t.matches) : []
  const levels = [...new Set(matches.map(([, m]) => Number(m.round_level)))].sort((a, b) => a - b)
  const champion = t?.champion
  const open = (mid?: string) => {
    setTournamentId(id)
    if (mid) { void enterMatch(mid) } else { setMatchId(''); navigate('bracket') }
  }
  return (
    <div className="space-y-6">
      <Card icon={<Trophy />} title="Giải chính AI" subtitle="Loại trực tiếp Bo5: các đội đứng đầu vòng loại AI đấu bot của mình trên bàn cờ 9×9"
        action={list.length > 1 ? <Select aria-label="Chọn giải chính AI" value={id} onChange={(e) => setId(e.target.value)} className="w-full sm:w-56">{list.map((x) => <option key={x.tournament_id} value={x.tournament_id}>{x.name}</option>)}</Select> : undefined}>
        {detail.loading && !t ? <Skeleton className="h-24 w-full rounded-xl" /> : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold" data-testid="ai-main-name">{current?.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><StatusBadge status={t?.status || current?.status} /><span>{t?.teams?.length ?? 0}/{t?.num_teams ?? current?.num_teams} đội</span></div>
            </div>
            {champion && <div className="flex items-center gap-2 rounded-xl bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-700 dark:text-amber-300" data-testid="ai-champion"><Crown className="size-5" />Vô địch: {typeof champion === 'string' ? champion : champion.team_name}</div>}
            <div className="flex gap-2"><Button variant="secondary" onClick={() => open()}><Network className="size-4" />Xem sơ đồ đấu</Button></div>
          </div>
        )}
      </Card>

      {t && !matches.some(([, m]) => m.team_a || m.team_b) && (
        <Card><EmptyState icon={<Swords className="size-6" />} title="Chưa xếp lịch" hint="Các đội đã được chốt từ vòng loại AI; ban tổ chức sẽ xếp lịch thi đấu." /></Card>
      )}

      {levels.length > 0 && (
        <Card icon={<Network />} title="Sơ đồ nhánh đấu" subtitle={`${levels.map((l) => levelName(t, l)).join(' → ')} · bấm vào một trận để vào phòng`}>
          <BracketTree matches={t.matches} onOpen={(mid) => open(mid)} />
        </Card>
      )}
      <AiRanking mine={session.student_id} />
    </div>
  )
}

