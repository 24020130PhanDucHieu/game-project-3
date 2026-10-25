'use client'

import { useState } from 'react'
import { Dices, Lock, LockOpen, RefreshCw } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, Field, SkeletonRows } from '../../ui'
import { useLive } from '../../context'

const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

/** BTC bốc ngẫu nhiên bộ đề từ kho cho vòng loại, xem trước, bốc lại từng đề hoặc cả bộ rồi khóa. */
export function AdminAiTasks({ event }: { event: any }) {
  const { run, confirm, busy } = useLive()
  const tasks = useResource<any>(`ai:tasks:${event.id}`, () => arenaApi.getAiCupTasks(event.id), { ttl: 3_000, refreshMs: 15_000 })
  const [tags, setTags] = useState('')
  const [levels, setLevels] = useState<number[]>([])
  const list: any[] = tasks.data?.tasks || []
  const locked = !!(tasks.data?.locked || event.tasks_locked)
  const open = event.status === 'OPEN'
  const reload = () => { invalidate('ai:tasks'); invalidate('q'); void tasks.reload() }
  const filters = () => ({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean), difficulties: levels })
  return (
    <Card icon={<Dices />} title="Bộ đề của vòng loại" subtitle={`Bốc ngẫu nhiên ${event.task_count} đề từ kho, xem trước, bốc lại, rồi khóa. Chưa khóa đề thì các đội chưa nộp bài được.`}
      action={locked ? <Badge tone="success"><Lock className="size-3" />Đã khóa đề</Badge> : <Badge tone="warning">Chưa khóa đề</Badge>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Chỉ bốc đề có thẻ (cách nhau dấu phẩy, để trống = tất cả)" value={tags} disabled={locked} onChange={(e) => setTags(e.target.value)} placeholder="thế cờ, sương mù" />
          <fieldset><legend className="mb-1 text-xs font-semibold text-muted-foreground">Độ khó</legend>
            <div className="flex gap-3">{[1, 2, 3].map((n) => <label key={n} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-primary" disabled={locked} checked={levels.includes(n)} onChange={() => setLevels(levels.includes(n) ? levels.filter((x) => x !== n) : [...levels, n])} />{DIFFICULTY[n]}</label>)}</div>
          </fieldset>
          <Button disabled={busy || locked || !open} onClick={() => void run(() => arenaApi.rollAiCupTasks(event.id, filters()), 'Đã bốc bộ đề mới', reload)} data-testid="tasks-roll"><Dices className="size-4" />{list.length ? 'Bốc lại cả bộ' : 'Ra đề ngẫu nhiên'}</Button>
        </div>
        {!locked && list.length > 0 && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100" data-testid="tasks-unlocked-note">
            Đề mới được bốc, <strong>các đội chưa thấy</strong> (chỉ ban tổ chức xem được). Bấm <strong>Khóa & công bố đề</strong> bên dưới để các đội thấy đề và nộp bài.
          </p>
        )}
        {tasks.loading && !tasks.data ? <SkeletonRows rows={4} /> : tasks.error && !tasks.data ? <ErrorNote message={tasks.error.message} onRetry={() => void tasks.reload()} /> : !list.length ? (
          <EmptyState icon={<Dices className="size-6" />} title="Chưa có đề" hint="Bấm “Ra đề ngẫu nhiên” để bốc từ kho đề." />
        ) : (
          <DataTable head={['#', 'Đề', 'Luật', 'Độ khó', 'Thước đo', 'Mẫu huấn luyện', 'Thời gian', '']}>
            {list.map((t, i) => (
              <tr key={i} data-testid="tasks-row">
                <td className="px-3 py-2.5 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium">{t.name}<span className="block text-[11px] font-normal text-muted-foreground">{t.title}</span></td>
                <td className="px-3 py-2.5 font-mono text-xs">{t.rule_id}</td>
                <td className="px-3 py-2.5"><Badge tone={t.difficulty === 1 ? 'success' : t.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[t.difficulty]}</Badge></td>
                <td className="px-3 py-2.5 text-xs">{t.metric}</td>
                <td className="px-3 py-2.5 tabular-nums">{t.n_train}</td>
                <td className="px-3 py-2.5 tabular-nums">{t.time_s} s</td>
                <td className="px-3 py-2.5 text-right"><Button size="sm" variant="secondary" disabled={busy || locked || !open} onClick={() => void run(() => arenaApi.rollAiCupTasks(event.id, { ...filters(), index: i }), `Đã bốc lại đề ${i + 1}`, reload)} data-testid="tasks-reroll"><RefreshCw className="size-3.5" />Bốc lại</Button></td>
              </tr>
            ))}
          </DataTable>
        )}
        <div className="flex flex-wrap gap-2">
          {locked
            ? <Button variant="secondary" disabled={busy || !open} onClick={() => void run(() => arenaApi.lockAiCupTasks(event.id, false), 'Đã mở khóa bộ đề', reload)} data-testid="tasks-unlock"><LockOpen className="size-4" />Mở khóa đề</Button>
            : <Button disabled={busy || !open || list.length !== event.task_count} onClick={async () => { if (await confirm({ title: 'Khóa bộ đề?', message: 'Các đội sẽ thấy đề, tải dữ liệu và nộp bài. Chỉ mở khóa lại được khi chưa có đội nào nộp.', confirmLabel: 'Khóa đề' })) void run(() => arenaApi.lockAiCupTasks(event.id, true), 'Đã khóa bộ đề', reload) }} data-testid="tasks-lock"><Lock className="size-4" />Khóa & công bố đề</Button>}
        </div>
      </div>
    </Card>
  )
}
