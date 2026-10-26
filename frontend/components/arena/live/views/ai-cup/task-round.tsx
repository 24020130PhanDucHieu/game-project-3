'use client'

import { useState } from 'react'
import { Brain, Crown, Download } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { offlineEngine } from '@/lib/offline-engine'
import { cn } from '@/lib/utils'
import { Badge, Button, Card } from '../../ui'
import { ScoreBar, fmt } from './common'
import { JsonNote } from './task-card'
import { CheckVisual, LossChart, visualFrom, type CheckVisualData } from './check-visual'

const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

/** Chấm thử trên máy cho hiệp đề ML: tải dữ liệu huấn luyện của hiệp rồi chạy solve (chia 80/20) bằng Pyodide. */
export function useRoundTaskCheck(tournamentId: string, matchId: string) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CheckVisualData | null>(null)
  const [live, setLive] = useState<number[]>([])
  const run = async (code: string) => {
    setBusy(true); setError(''); setResult(null); setLive([])
    try {
      const data = await arenaApi.getAiMainMatchTask(tournamentId, matchId)
      const res = await offlineEngine.taskCheck(code, data, (p) => setLive((old) => (old.length < 400 ? [...old, p.loss] : old)))
      setResult(visualFrom(data, res))
    } catch (e) { setError(e instanceof Error ? e.message : 'Không chấm thử được') } finally { setBusy(false) }
  }
  return { busy, error, result, live, run }
}

export function RoundTaskCheckResult({ state }: { state: ReturnType<typeof useRoundTaskCheck> }) {
  return (
    <>
      {state.busy && <p className="text-xs text-muted-foreground" role="status">Đang chấm trên máy bạn. Lần đầu khởi động máy chấm có thể mất khoảng một phút…</p>}
      {state.error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" data-testid="round-task-error">{state.error}</p>}
      {state.busy && state.live.length > 1 && <LossChart points={state.live} live />}
      {state.result && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3" data-testid="round-task-check-result">
          <p className="text-xs text-muted-foreground">Ước lượng trên {state.result.result.n_val} mẫu để riêng ra từ dữ liệu huấn luyện ({state.result.result.n_train} mẫu còn lại dùng để học)</p>
          <span className="sr-only" data-testid="round-task-check-score">{fmt(state.result.result.score)}</span>
          <CheckVisual data={state.result} />
          <p className="text-xs text-muted-foreground">{(state.result.result.elapsed_ms / 1000).toFixed(1)} giây trên máy bạn; điểm thật tính trên thế cờ ẩn của máy chấm.</p>
          {state.result.result.error && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{state.result.result.error}</p>}
        </div>
      )}
    </>
  )
}

/** Đề của hiệp đang diễn ra: đề bài công khai và tải dữ liệu huấn luyện (chỉ hai đội trong trận và BTC). */
export function RoundTaskCard({ tournamentId, matchId, task, round, canDownload }: { tournamentId: string; matchId: string; task: any; round: number; canDownload: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!task) return null
  const download = async () => {
    setBusy(true); setError('')
    try {
      const data = await arenaApi.getAiMainMatchTask(tournamentId, matchId)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `de-hiep-${round}.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được dữ liệu') } finally { setBusy(false) }
  }
  return (
    <Card icon={<Brain />} title={`Đề của hiệp ${round}: ${task.name}`} subtitle={`${task.title} · luật ${task.rule_id} · ${task.n_train} mẫu huấn luyện · ${task.time_s} giây`}
      action={<Badge tone={task.difficulty === 1 ? 'success' : task.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[task.difficulty]}</Badge>}>
      <div className="space-y-3" data-testid="round-task">
        {task.plain && <p className="text-sm leading-relaxed" data-testid="round-task-plain">{task.plain}</p>}
        {Array.isArray(task.label_help) && task.label_help.length > 0 && <ul className="flex flex-wrap gap-1.5">{task.label_help.map((l: string) => <li key={l}><Badge tone="neutral">{l}</Badge></li>)}</ul>}
        {task.metric_plain && <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><strong className="text-foreground">Chấm điểm: </strong>{task.metric_plain}</p>}
        <details className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Đề bài kỹ thuật đầy đủ</summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground" data-testid="round-task-statement">{task.statement}</p>
        </details>
        <JsonNote />
        {canDownload && <Button variant="secondary" size="sm" loading={busy} onClick={() => void download()} data-testid="round-task-download"><Download className="size-4" />Tải tệp JSON (không bắt buộc)</Button>}
        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </Card>
  )
}

/** Kết quả một hiệp đề ML: điểm hai đội trên cùng một đề, bên cao hơn thắng. */
export function TaskRoundResult({ data, redName, blueName }: { data: any; redName: string; blueName: string }) {
  const scores = data.scores || {}
  const errors = data.task_errors || {}
  const rows: [string, string, string][] = [['team_a', redName, 'bg-red-500'], ['team_b', blueName, 'bg-blue-500']]
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card/70 p-4" data-testid="task-round-result">
      <div>
        <p className="text-xs text-muted-foreground">Đề của hiệp {data.round_number}</p>
        <p className="font-display text-lg font-extrabold">{data.task?.name}</p>
        <p className="text-xs text-muted-foreground">{data.task?.title} · luật {data.task?.rule_id}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map(([side, name, color]) => (
          <div key={side} className={cn('rounded-xl border p-3', data.winner === side ? 'border-amber-400/60 bg-amber-400/10' : 'border-border')}>
            <p className="flex items-center gap-2 text-sm font-semibold"><span className={cn('size-2.5 rounded-full', color)} />{name}{data.winner === side && <Crown className="size-4 text-amber-500" aria-label="Thắng hiệp" />}</p>
            <p className="font-display mt-1 text-3xl font-black tabular-nums" data-testid={`task-score-${side}`}>{fmt(scores[side])}</p>
            <ScoreBar value={Number(scores[side]) || 0} label="Điểm riêng tư trên đề" />
            {errors[side] && <p className="mt-2 text-xs text-red-700 dark:text-red-300">Lỗi: {errors[side]}</p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{data.win_reason}</p>
    </div>
  )
}
