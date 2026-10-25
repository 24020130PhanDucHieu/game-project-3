'use client'

import { useState } from 'react'
import { Dices, Lock, LockOpen, RefreshCw } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SkeletonRows } from '../../ui'
import { useLive } from '../../context'

const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

/** BTC bốc đề ML cho từng hiệp của từng vòng giải chính AI, xem trước, bốc lại từng đề hoặc cả bộ rồi khóa. */
export function AdminMainTasks({ tid }: { tid: string }) {
  const { run, confirm, busy } = useLive()
  const plan = useResource<any>(`ai:main-plan:${tid}`, () => arenaApi.getAiMainTasks(tid), { ttl: 3_000, refreshMs: 15_000 })
  const [tags, setTags] = useState('')
  const [levels, setLevels] = useState<number[]>([])
  const data = plan.data
  const locked = !!data?.locked
  const keys = Object.keys(data?.levels || {}).sort((a, b) => Number(a) - Number(b))
  const reload = () => { invalidate('ai:main-plan'); invalidate('t:'); void plan.reload() }
  const filters = () => ({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean), difficulties: levels })
  return (
    <Card icon={<Dices />} title="Bộ đề của giải chính" subtitle="Mỗi vòng có 5 đề, hiệp 1–5 lần lượt dùng từng đề (vòng sau khó hơn). Chưa khóa đề thì chưa nộp bài hay khai hỏa được."
      action={locked ? <Badge tone="success"><Lock className="size-3" />Đã khóa đề</Badge> : <Badge tone="warning">Chưa khóa đề</Badge>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Chỉ bốc đề có thẻ (cách nhau dấu phẩy, để trống = tất cả)" value={tags} disabled={locked} onChange={(e) => setTags(e.target.value)} />
          <fieldset><legend className="mb-1 text-xs font-semibold text-muted-foreground">Độ khó</legend>
            <div className="flex gap-3">{[1, 2, 3].map((n) => <label key={n} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-primary" disabled={locked} checked={levels.includes(n)} onChange={() => setLevels(levels.includes(n) ? levels.filter((x) => x !== n) : [...levels, n])} />{DIFFICULTY[n]}</label>)}</div>
          </fieldset>
          <Button disabled={busy || locked} onClick={() => void run(() => arenaApi.rollAiMainTasks(tid, filters()), 'Đã bốc bộ đề giải chính', reload)} data-testid="main-tasks-roll"><Dices className="size-4" />{keys.length ? 'Bốc lại cả bộ' : 'Ra đề ngẫu nhiên'}</Button>
        </div>
        {plan.loading && !data ? <SkeletonRows rows={4} /> : plan.error && !data ? <ErrorNote message={plan.error.message} onRetry={() => void plan.reload()} /> : !keys.length ? (
          <EmptyState icon={<Dices className="size-6" />} title="Chưa có đề" hint="Bấm “Ra đề ngẫu nhiên” để bốc đề cho mọi vòng từ kho." />
        ) : keys.map((level) => (
          <div key={level} className="space-y-2">
            <p className="text-sm font-semibold">Vòng {level}{Number(level) === data.level_count ? ' (chung kết)' : ''}</p>
            <DataTable head={['Hiệp', 'Đề', 'Luật', 'Độ khó', 'Thước đo', '']}>
              {data.levels[level].map((t: any, i: number) => (
                <tr key={i} data-testid="main-tasks-row">
                  <td className="px-3 py-2.5 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{t.name}<span className="block text-[11px] font-normal text-muted-foreground">{t.title}</span></td>
                  <td className="px-3 py-2.5 font-mono text-xs">{t.rule_id}</td>
                  <td className="px-3 py-2.5"><Badge tone={t.difficulty === 1 ? 'success' : t.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[t.difficulty]}</Badge></td>
                  <td className="px-3 py-2.5 text-xs">{t.metric}</td>
                  <td className="px-3 py-2.5 text-right"><Button size="sm" variant="secondary" disabled={busy || locked} onClick={() => void run(() => arenaApi.rollAiMainTasks(tid, { ...filters(), level: Number(level), index: i }), `Đã bốc lại đề hiệp ${i + 1} vòng ${level}`, reload)} data-testid="main-tasks-reroll"><RefreshCw className="size-3.5" />Bốc lại</Button></td>
                </tr>
              ))}
            </DataTable>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {locked
            ? <Button variant="secondary" disabled={busy} onClick={() => void run(() => arenaApi.lockAiMainTasks(tid, false), 'Đã mở khóa bộ đề', reload)} data-testid="main-tasks-unlock"><LockOpen className="size-4" />Mở khóa đề</Button>
            : <Button disabled={busy || !keys.length} onClick={async () => { if (await confirm({ title: 'Khóa bộ đề giải chính?', message: 'Các đội sẽ thấy đề của hiệp hiện tại và nộp bài được. Chỉ mở khóa lại được khi chưa có hiệp nào được chấm.', confirmLabel: 'Khóa đề' })) void run(() => arenaApi.lockAiMainTasks(tid, true), 'Đã khóa bộ đề', reload) }} data-testid="main-tasks-lock"><Lock className="size-4" />Khóa đề</Button>}
        </div>
      </div>
    </Card>
  )
}
