'use client'

import { useEffect, useMemo, useState } from 'react'
import { Award, BarChart3, GitCompare } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { decodeRule, sameStudent, stamp } from '@/lib/format'
import { Card, EmptyState, Select, Tabs } from './ui'
import { useLive } from './context'
import { DiffViewer, LineChart, RatioBars } from './bot-insights'
import { BadgeStrip } from './challenges'
import { AcceptScrimmageToggle } from './scrimmage'

const MOVE_LABEL: Record<string, string> = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo' }

/** Phân tích bot của chính đội: ELO theo lượt, tỉ lệ thắng theo luật/đối thủ, nước mở đầu, so sánh phiên bản. */
export function BotAnalytics({ teamName }: { teamName?: string }) {
  const { session, scope, qualifierId, tournament, ownMatches } = useLive()
  const [tab, setTab] = useState<'stats' | 'diff'>('stats')
  const detail = useResource<any>(qualifierId ? `q:detail:${scope}:${qualifierId}` : null, () => arenaApi.getQualifier(qualifierId), { ttl: 10_000 })
  const scrims = useResource('scrim:list', () => arenaApi.getScrimmages(), { ttl: 15_000 })
  const sid = session.student_id

  const eloPoints = useMemo(() => {
    const jobs = (detail.data?.results || []).filter((j: any) => j.status === 'DONE').sort((a: any, b: any) => a.round - b.round)
    const points: { x: string; y: number }[] = []
    jobs.forEach((j: any) => {
      const isA = sameStudent(j.a, sid)
      const before = Number(isA ? j.before_a : j.before_b)
      const after = Number(isA ? j.after_a : j.after_b)
      if (!points.length && Number.isFinite(before)) points.push({ x: 'Đầu', y: before })
      if (Number.isFinite(after)) points.push({ x: `L${j.round}`, y: after })
    })
    return points
  }, [detail.data, sid])

  const { byRule, byOpponent, openings } = useMemo(() => {
    const rule = new Map<string, { wins: number; total: number }>()
    const opp = new Map<string, { wins: number; total: number }>()
    const moves = new Map<string, { wins: number; total: number }>()
    const add = (map: Map<string, { wins: number; total: number }>, key: string, won: boolean) => {
      const cur = map.get(key) || { wins: 0, total: 0 }
      map.set(key, { wins: cur.wins + (won ? 1 : 0), total: cur.total + 1 })
    }
    const label = (id: string) => decodeRule(id).active.join(' + ') || 'Luật chuẩn'
    for (const [, m] of ownMatches) {
      const side = sameStudent(m.team_a?.student_id, sid) ? 'team_a' : 'team_b'
      const other = side === 'team_a' ? m.team_b?.team_name : m.team_a?.team_name
      for (const r of m.rounds_history || []) {
        const won = r.winner === side
        add(rule, label(r.stage_rule), won)
        if (other) add(opp, other, won)
        const move = side === 'team_a' ? r.team_a_move : r.team_b_move
        if (move) add(moves, MOVE_LABEL[move] ?? move, won)
      }
    }
    for (const s of scrims.data?.items || []) {
      const side = sameStudent(s.red.student_id, sid) ? 'team_a' : 'team_b'
      const won = s.winner_side === side
      add(rule, label(s.rule_id), won)
      add(opp, `${side === 'team_a' ? s.blue.team_name : s.red.team_name} (giao hữu)`, won)
    }
    const rows = (map: Map<string, { wins: number; total: number }>) => [...map.entries()].map(([k, v]) => ({ label: k, ...v })).sort((a, b) => b.total - a.total).slice(0, 8)
    return { byRule: rows(rule), byOpponent: rows(opp), openings: rows(moves) }
  }, [ownMatches, scrims.data, sid])

  // So sánh phiên bản: lịch sử bài vòng loại (có mã) + bài nộp các trận của đội.
  const versions = useMemo(() => {
    const out: { id: string; label: string; code: string }[] = []
    for (const h of detail.data?.history || []) if (h.code) out.push({ id: `q:${h.id}`, label: `Vòng loại · ${stamp(h.at)}${h.valid || h.status === 'VALID' ? '' : ''}`, code: h.code })
    for (const [, m] of ownMatches) {
      for (const s of m.submissions_history || []) if (s.code) out.push({ id: `m:${s.submission_id}`, label: `${m.title || m.round_name} · hiệp ${s.round_number} · ${stamp(s.submitted_at)}`, code: s.code })
    }
    return out
  }, [detail.data, ownMatches])
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  useEffect(() => {
    if (versions.length >= 2) { setLeft((l) => l || versions[1].id); setRight((r) => r || versions[0].id) }
  }, [versions])
  const L = versions.find((v) => v.id === left)
  const R = versions.find((v) => v.id === right)

  const history = useResource('mh', () => arenaApi.getMatchHistory(), { ttl: 30_000 })
  const milestones = useMemo(() => {
    const out: { icon: string; label: string }[] = []
    if ((detail.data?.history || []).some((h: any) => h.valid || h.status === 'VALID')) out.push({ icon: 'valid', label: 'Bài hợp lệ đầu tiên' })
    if (teamName && (history.data || []).some((h: any) => h.winner_name === teamName)) out.push({ icon: 'win', label: 'Thắng trận Bo5' })
    const champ = tournament.data?.champion
    if (teamName && (champ === teamName || champ?.team_name === teamName)) out.push({ icon: 'champion', label: 'Quán quân' })
    if ((scrims.data?.items || []).length >= 5) out.push({ icon: 'scrim', label: '5 trận giao hữu' })
    return out
  }, [detail.data, history.data, teamName, tournament.data, scrims.data])

  return (
    <div className="space-y-6">
      <Card icon={<Award />} title="Huy hiệu" action={<AcceptScrimmageToggle />}>
        {sid && <BadgeStrip studentId={sid} milestones={milestones} />}
      </Card>
      <Card icon={<BarChart3 />} title="Phân tích bot" action={<Tabs value={tab} onChange={setTab} tabs={[{ id: 'stats', label: 'Thống kê', icon: <BarChart3 className="size-4" /> }, { id: 'diff', label: 'So sánh phiên bản', icon: <GitCompare className="size-4" /> }]} />}>
        {tab === 'stats' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">ELO vòng loại theo từng lượt</p>
              <LineChart points={eloPoints} label="Biểu đồ ELO theo lượt vòng loại" />
            </div>
            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Tỉ lệ thắng theo luật (trận + giao hữu)</p><RatioBars rows={byRule} /></div>
            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Theo đối thủ</p><RatioBars rows={byOpponent} /></div>
            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Nước mở đầu ở các hiệp giải chính</p><RatioBars rows={openings} /></div>
          </div>
        ) : versions.length < 2 ? (
          <EmptyState title="Cần ít nhất hai bài nộp để so sánh" hint="Lịch sử bài nộp vòng loại và các trận của đội sẽ hiện ở đây." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Phiên bản cũ" value={left} onChange={(e) => setLeft(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
              <Select label="Phiên bản mới" value={right} onChange={(e) => setRight(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
            </div>
            {L && R && <DiffViewer left={{ label: 'Cũ', code: L.code }} right={{ label: 'Mới', code: R.code }} />}
          </div>
        )}
      </Card>
    </div>
  )
}
