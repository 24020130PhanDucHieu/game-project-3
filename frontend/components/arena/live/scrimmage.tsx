'use client'

import { useEffect, useMemo, useState } from 'react'
import { Handshake, Search, Swords, Trophy } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { decodeRule, relative, sameStudent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Field, Select, SkeletonRows } from './ui'
import { useLive } from './context'
import { BoardPlayer } from './board'

const RULES: [string, string][] = [['STAGE_1_STANDARD', 'Luật chuẩn'], ['COMBO_1', 'Trộn quân'], ['COMBO_2', 'Đảo tương khắc'], ['COMBO_4', 'Sương mù'], ['COMBO_7', 'Cả ba luật']]

function readDraft(qid: string, sid?: string): { code: string; language: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(`arena.draft.qualifier:${qid}:${sid}`) || 'null')
    return saved?.code ? { code: saved.code, language: saved.language === 'CPP' ? 'CPP' : 'PYTHON' } : null
  } catch {
    return null
  }
}

export function AcceptScrimmageToggle() {
  const { role, run } = useLive()
  const list = useResource(role === 'TEAM' ? 'scrim:list' : null, () => arenaApi.getScrimmages(), { ttl: 15_000, refreshMs: 30_000 })
  if (role !== 'TEAM' || !list.data) return null
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={list.data.accept} onChange={(e) => void run(() => arenaApi.setScrimmageAccept(e.target.checked), e.target.checked ? 'Đã bật nhận lời thách đấu giao hữu' : 'Đã tắt nhận lời thách đấu giao hữu', () => invalidate('scrim:'))} />
      Cho phép đội khác thách đấu giao hữu với bot của tôi
    </label>
  )
}

export function ScrimmagePanel() {
  const { role, session, qualifiers, qualifierId, setQualifierId, toast, openAuth } = useLive()
  const [opponent, setOpponent] = useState('')
  const [manual, setManual] = useState('')
  const [rule, setRule] = useState('STAGE_1_STANDARD')
  const [source, setSource] = useState<'latest' | 'draft'>('latest')
  const [q, setQ] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [replayId, setReplayId] = useState('')

  const ranking = useResource(qualifierId ? `q:rank:${qualifierId}:1` : null, () => arenaApi.getQualifierRanking(qualifierId, 1), { ttl: 20_000 })
  const history = useResource(role === 'TEAM' ? 'scrim:list' : null, () => arenaApi.getScrimmages(), { ttl: 10_000, refreshMs: 30_000 })
  const replay = useResource<any>(replayId ? `scrim:replay:${replayId}` : null, () => arenaApi.getScrimmage(replayId), { ttl: 300_000 })
  useEffect(() => { setResult(null); setReplayId('') }, [qualifierId])

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (ranking.data?.items || []).filter((r: any) => !sameStudent(r.student_id, session.student_id) && (!needle || `${r.team_name} ${r.student_id}`.toLowerCase().includes(needle)))
  }, [ranking.data, q, session.student_id])

  if (role !== 'TEAM') {
    return <Card title="Đấu giao hữu"><EmptyState icon={<Handshake className="size-7" />} title={role === 'ADMIN' ? 'Giao hữu dành cho đội thi' : 'Đăng nhập đội để thách đấu giao hữu'} hint="Đội dùng bot đã nộp ở vòng loại để đấu với bot của đội khác. Không tính điểm, không lộ mã nguồn." action={role === 'GUEST' ? <Button onClick={() => openAuth('login')}>Đăng nhập</Button> : undefined} /></Card>
  }

  const target = manual.trim().toUpperCase() || opponent
  async function challenge() {
    let draft: { code: string; language: string } | null = null
    if (source === 'draft') {
      draft = readDraft(qualifierId, session.student_id)
      if (!draft) { toast('error', 'Chưa có mã đang soạn ở tab Vòng loại.'); return }
    }
    setRunning(true)
    setReplayId('')
    try {
      const res = await arenaApi.createScrimmage({ qualifier_id: qualifierId, opponent_student_id: target, rule_id: rule, ...(draft ? { code: draft.code, language: draft.language } : {}) })
      setResult(res)
      invalidate('scrim:list')
      const won = res.scrimmage.winner_side === 'team_a'
      toast(won ? 'success' : 'info', won ? `Bot của bạn thắng ${res.scrimmage.blue.team_name}!` : `${res.scrimmage.blue.team_name} thắng trận giao hữu này.`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Không thách đấu được')
    } finally { setRunning(false) }
  }

  const shown = replayId ? replay.data : result
  const shownScrim = shown?.scrimmage
  const mine = (s: any) => (sameStudent(s.red.student_id, session.student_id) ? 'team_a' : 'team_b')

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-6">
        <Card title="Thách đấu giao hữu" subtitle="Bot của bạn (Đỏ) đấu bot hợp lệ mới nhất của đội khác (Xanh). Không tính ELO, không ảnh hưởng giải, không lộ mã nguồn.">
          <div className="space-y-4">
            <Select label="Vòng loại" value={qualifierId} onChange={(e) => setQualifierId(e.target.value)}>
              {qualifiers.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Chọn đối thủ</p>
              <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong top 50" aria-label="Tìm đối thủ" className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div>
              {ranking.loading ? <SkeletonRows rows={3} /> : candidates.length ? (
                <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {candidates.map((r: any) => (
                    <li key={r.student_id}>
                      <button onClick={() => { setOpponent(r.student_id); setManual('') }} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted', opponent === r.student_id && !manual && 'bg-primary/15 ring-1 ring-primary/40')}>
                        <span className="w-6 text-center text-xs font-bold text-muted-foreground">#{r.rank}</span>
                        <Avatar name={r.team_name} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{r.team_name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{Number(r.elo).toFixed(0)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">Chưa có đội nào trong bảng xếp hạng vòng loại.</p>}
              <Field label="Hoặc nhập MSSV đối thủ" className="mt-2" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="VD: 24020002" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Luật" value={rule} onChange={(e) => setRule(e.target.value)}>{RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              <Select label="Bot của tôi" value={source} onChange={(e) => setSource(e.target.value as 'latest' | 'draft')}>
                <option value="latest">Bài hợp lệ đã nộp gần nhất</option>
                <option value="draft">Mã đang soạn ở tab Vòng loại</option>
              </Select>
            </div>
            <Button className="w-full" loading={running} disabled={!target || !qualifierId} onClick={() => void challenge()}><Swords className="size-4" />Thách đấu{target ? ` ${target}` : ''}</Button>
            <AcceptScrimmageToggle />
          </div>
        </Card>

        <Card title="Lịch sử giao hữu">
          {history.loading ? <SkeletonRows rows={3} /> : history.error && !history.data ? <ErrorNote message={history.error.message} /> : history.data?.items.length ? (
            <ul className="space-y-2">
              {history.data.items.map((s: any) => {
                const side = mine(s)
                const won = s.winner_side === side
                const other = side === 'team_a' ? s.blue : s.red
                return (
                  <li key={s.id}>
                    <button onClick={() => { setReplayId(s.id); setResult(null) }} className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm hover:border-primary/50', replayId === s.id ? 'border-primary bg-primary/5' : 'border-border')}>
                      <Badge tone={won ? 'success' : 'danger'}>{won ? 'Thắng' : 'Thua'}</Badge>
                      <span className="min-w-0 flex-1 truncate">{side === 'team_a' ? 'Thách' : 'Bị thách bởi'} <strong>{other.team_name}</strong></span>
                      <span className="text-[11px] text-muted-foreground">{decodeRule(s.rule_id).active.join('+') || 'Chuẩn'} · {relative(s.created_at)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState title="Chưa có trận giao hữu" hint="Thách đấu một đội để bắt đầu." />}
        </Card>
      </div>

      <Card title="Diễn biến trận giao hữu">
        {replayId && replay.loading ? <SkeletonRows rows={5} /> : shownScrim ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><Avatar name={shownScrim.red.team_name} size="sm" ring="red" />{shownScrim.red.team_name}</span>
              <span className="flex items-center gap-1 text-xs font-bold"><Trophy className="size-4 text-amber-500" />{shownScrim.winner_side === 'team_a' ? shownScrim.red.team_name : shownScrim.blue.team_name}</span>
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">{shownScrim.blue.team_name}<Avatar name={shownScrim.blue.team_name} size="sm" ring="blue" /></span>
            </div>
            {shownScrim.win_reason && <p className="text-sm text-muted-foreground">{shownScrim.win_reason}</p>}
            {result?.my_bot_error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300"> Bot của bạn lỗi: {result.my_bot_error}</p>}
            <BoardPlayer steps={shown.board_steps || []} autoPlay={!replayId} redName={shownScrim.red.team_name} blueName={shownScrim.blue.team_name} />
          </div>
        ) : <EmptyState icon={<Handshake className="size-7" />} title="Chọn đối thủ và bấm Thách đấu" hint="Kết quả và replay sẽ hiện ở đây. Bạn cũng có thể mở lại trận cũ trong lịch sử." />}
      </Card>
    </div>
  )
}
