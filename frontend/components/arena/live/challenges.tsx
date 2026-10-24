'use client'

import { useMemo, useState } from 'react'
import { Award, Lock, Medal, Swords, Trophy } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { decodeRule, stamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, EmptyState, ProgressBar, SkeletonCards } from './ui'
import { useLive } from './context'
import { BoardPlayer } from './board'
import { DebugPanel } from './bot-insights'
import { Workbench } from './workbench'

const BOSS: Record<string, string> = { RANDOM: 'Boss ngẫu nhiên', AGGRESSIVE: 'Boss tấn công', ADAPTIVE: 'Boss thích ứng' }
const TIER_STYLE: Record<string, string> = {
  'Đồng': 'from-orange-400/25 to-orange-700/10 border-orange-400/40',
  'Bạc': 'from-slate-300/30 to-slate-500/10 border-slate-300/50',
  'Vàng': 'from-amber-300/30 to-amber-600/10 border-amber-400/50',
  'Bạch kim': 'from-cyan-300/25 to-cyan-600/10 border-cyan-300/50',
  'Kim cương': 'from-fuchsia-400/30 to-violet-600/15 border-fuchsia-400/50',
}

export function ChallengesPanel() {
  const { role, session, toast, openAuth } = useLive()
  const list = useResource(`chal:${session.student_id || 'guest'}`, () => arenaApi.getChallenges(), { ttl: 10_000 })
  const [selected, setSelected] = useState('')
  const [result, setResult] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const items = list.data?.items || []
  const current = items.find((x: any) => x.challenge.id === selected) ?? items.find((x: any) => x.unlocked && !x.passed) ?? items[0]
  const ch = current?.challenge

  async function attempt(code: string, language: string) {
    if (!ch) return
    setRunning(true)
    setResult(null)
    try {
      const res = await arenaApi.attemptChallenge(ch.id, { code, language })
      setResult(res)
      invalidate('chal:')
      if (res.new_badge) toast('success', `Nhận huy hiệu “${ch.title}”!`)
      else if (res.passed) toast('success', 'Bạn đã vượt thử thách này (đã có huy hiệu).')
      else toast('info', `Chưa đạt: thắng ${res.wins}/${ch.runs} ván, cần ${ch.need_wins}.`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Không thử thách được')
    } finally { setRunning(false) }
  }

  const tiers = useMemo(() => {
    const map = new Map<string, any[]>()
    items.forEach((x: any) => map.set(x.challenge.tier, [...(map.get(x.challenge.tier) || []), x]))
    return [...map.entries()]
  }, [items])

  return (
    <div className="space-y-6">
      <Card title="Thang thử thách" subtitle="Vượt từng cấp để mở khóa cấp tiếp theo và nhận huy hiệu trên hồ sơ đội. Server chạy trận và quyết định đạt/không đạt; không tính vào giải.">
        {list.loading ? <SkeletonCards count={4} /> : (
          <div className="space-y-5">
            <ProgressBar value={list.data?.passed || 0} max={list.data?.total || 12} label={`${list.data?.passed || 0}/${list.data?.total || 12} huy hiệu`} />
            {tiers.map(([tier, group]) => (
              <div key={tier}>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><Medal className="size-3.5" />Hạng {tier}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map((x: any) => {
                    const c = x.challenge
                    const rules = decodeRule(c.rule_id).active
                    return (
                      <button
                        key={c.id}
                        disabled={!x.unlocked && role === 'TEAM'}
                        onClick={() => { setSelected(c.id); setResult(null) }}
                        className={cn('card-lift relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left disabled:cursor-not-allowed disabled:opacity-50', TIER_STYLE[c.tier], current?.challenge.id === c.id && 'ring-2 ring-primary')}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('text-3xl', !x.passed && 'grayscale opacity-60')} aria-hidden>{c.badge}</span>
                          {x.passed ? <Badge tone="success">Đã đạt</Badge> : !x.unlocked ? <Badge><Lock className="size-3" />Khóa</Badge> : <Badge tone="accent">Sẵn sàng</Badge>}
                        </div>
                        <p className="font-display mt-2 text-sm font-extrabold">{c.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{BOSS[c.boss]} · {rules.length ? rules.join(' + ') : 'luật chuẩn'}{c.runs > 1 ? ` · thắng ${c.need_wins}/${c.runs} ván` : ''}</p>
                        {x.attempts > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{x.attempts} lần thử{c.runs > 1 ? ` · tốt nhất ${x.best_wins}/${c.runs}` : ''}{x.passed_at ? ` · đạt ${stamp(x.passed_at)}` : ''}</p>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {ch && (
        <Card title={`${ch.badge} ${ch.title}`} subtitle={`${BOSS[ch.boss]} · ${decodeRule(ch.rule_id).active.join(' + ') || 'luật chuẩn'} · cần thắng ${ch.need_wins}/${ch.runs} ván`}>
          {role !== 'TEAM' ? (
            <EmptyState icon={<Trophy className="size-7" />} title="Đăng nhập đội để làm thử thách" action={role === 'GUEST' ? <Button onClick={() => openAuth('login')}>Đăng nhập</Button> : undefined} />
          ) : !current.unlocked ? (
            <EmptyState icon={<Lock className="size-7" />} title="Thử thách đang khóa" hint="Vượt thử thách trước đó để mở khóa." />
          ) : (
            <div className="space-y-5">
              <Workbench
                draftKey={`challenge:${session.student_id}`}
                ruleId={ch.rule_id}
                practice={false}
                renderActions={(value) => (
                  <Button loading={running} disabled={!value.code.trim()} onClick={() => void attempt(value.code, value.language)}><Swords className="size-4" />Bắt đầu thử thách</Button>
                )}
              />
              {result && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Kết quả: thắng {result.wins}/{result.runs.length} ván{result.runs.length < ch.runs ? ' (dừng sớm)' : ''}</h3>
                    <Badge tone={result.passed ? 'success' : 'warning'}>{result.passed ? (result.new_badge ? 'Nhận huy hiệu mới' : 'Đạt') : 'Chưa đạt'}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{result.runs.map((r: any, i: number) => <Badge key={i} tone={r.won ? 'success' : 'danger'}>Ván {i + 1}: {r.won ? 'Thắng' : 'Thua'}</Badge>)}</div>
                  {result.board_steps?.length ? <BoardPlayer steps={result.board_steps} autoPlay redName="Bot của bạn" blueName={BOSS[ch.boss]} /> : null}
                  <DebugPanel steps={result.board_steps || []} ruleId={ch.rule_id} botError={result.my_bot_error} />
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/** Dải huy hiệu thử thách + huy hiệu mốc (tự tính) để hiển thị trên hồ sơ đội. */
export function BadgeStrip({ studentId, milestones = [] }: { studentId: string; milestones?: { icon: string; label: string }[] }) {
  const badges = useResource(studentId ? `badges:${studentId}` : null, () => arenaApi.getBadges(studentId), { ttl: 30_000 })
  const all = [...milestones.map((m) => ({ id: m.label, badge: m.icon, title: m.label, tier: 'Mốc' })), ...(badges.data?.items || [])]
  if (!all.length) return <p className="text-xs text-muted-foreground">Chưa có huy hiệu — hãy thử tab Vòng loại → Thử thách.</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {all.map((b: any) => (
        <li key={b.id} title={`${b.title} (${b.tier})`} className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold">
          <Award className="size-3.5 text-amber-500" aria-hidden /><span className="max-w-40 truncate">{b.title}</span>
        </li>
      ))}
    </ul>
  )
}
