'use client'

import { CheckCircle2, Circle, ListChecks, Lock } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, ProgressBar } from '../../ui'
import { useLive } from '../../context'
import { useAiTournaments } from './common'

type Step = {
  id: string
  title: string
  done: boolean
  /** Một câu: đang ở đâu hoặc vì sao chưa làm được. */
  hint: string
  blocked?: boolean
  action?: { label: string; run: () => void; disabled?: boolean }
}

const go = (id: string) => () => {
  const el = document.getElementById(id)
  if (el instanceof HTMLDetailsElement) el.open = true
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Các bước điều hành Giải AI theo đúng thứ tự phải làm, tự đánh dấu theo trạng thái thật.
 * Người ít rành kỹ thuật chỉ cần làm bước đang sáng; bước bị chặn nói rõ vì sao.
 */
export function AdminAiSteps({ event }: { event?: any }) {
  const { run, busy } = useLive()
  const bank = useResource<any>('ai:bank', () => arenaApi.getAiBank(), { ttl: 10_000, refreshMs: 30_000 })
  const { list, current } = useAiTournaments()
  const main = list.find((t) => !event?.top_k || t.num_teams === event.top_k) || current
  const mainId = main?.tournament_id || ''
  const detail = useResource<any>(mainId ? `t:ai:admin-detail:${mainId}` : null, () => arenaApi.getTournament(mainId), { ttl: 8_000, refreshMs: 20_000 })
  const plan = useResource<any>(mainId && detail.data?.round_mode === 'TASK' ? `ai:main-plan:${mainId}` : null, () => arenaApi.getAiMainTasks(mainId), { ttl: 3_000, refreshMs: 15_000 })

  const enabled = (bank.data?.entries || []).filter((e: any) => e.enabled).length
  const needTasks = Number(event?.task_count) || 6
  const status = event?.status
  const tasksMode = event?.mode === 'TASKS'
  const eligible = Number(event?.eligible) || 0
  const need = Number(event?.top_k) || 8
  const finished = status === 'FINISHED' || status === 'PROMOTED'
  const promoted = status === 'PROMOTED'
  const t = detail.data
  const matches = Object.values(t?.matches || {}) as any[]
  const scheduled = matches.some((m) => m.team_a || m.team_b)
  const taskMain = t?.round_mode === 'TASK'
  const planLocked = !!plan.data?.locked
  const mainDone = !!t?.champion || t?.status === 'FINISHED' || t?.status === 'COMPLETED'

  const steps: Step[] = [
    {
      id: 'bank', title: 'Kho đề sẵn sàng', done: !tasksMode || enabled >= needTasks,
      hint: enabled >= needTasks ? `Kho có ${enabled} đề đang bật.` : `Kho mới có ${enabled} đề bật, cần ít nhất ${needTasks}. Bật thêm hoặc thêm đề mới ở khung Kho đề.`,
      action: { label: 'Mở kho đề', run: go('ai-step-bank') },
    },
    {
      id: 'create', title: 'Tạo vòng loại AI', done: !!event,
      hint: event ? `Đã có “${event.name}”.` : 'Bấm “Tạo mới” ở khung Vòng loại Giải AI, đặt tên, hạn nộp và số đội vào giải chính.',
      action: event ? undefined : { label: 'Tạo vòng loại', run: go('ai-step-event') },
    },
    {
      id: 'tasks', title: 'Bốc đề và Khóa & công bố đề', done: !tasksMode || !!event?.tasks_locked,
      blocked: !event,
      hint: !event ? 'Cần tạo vòng loại trước.' : !tasksMode ? 'Dạng đề cố định, không cần bốc.' : event.tasks_locked ? 'Đề đã công bố: các đội thấy đề và nộp được.' : 'Bấm “Ra đề ngẫu nhiên”, xem trước rồi “Khóa & công bố đề”. Chưa khóa thì đội chưa thấy đề và chưa nộp được.',
      action: event && tasksMode && !event.tasks_locked ? { label: 'Tới bộ đề', run: go('ai-step-tasks') } : undefined,
    },
    {
      id: 'submit', title: 'Các đội nộp mô hình', done: eligible >= need,
      blocked: !event || (tasksMode && !event.tasks_locked),
      hint: !event ? 'Cần tạo vòng loại trước.' : tasksMode && !event.tasks_locked ? 'Đội chưa nộp được vì đề chưa khóa.' : `${eligible}/${need} đội đủ điều kiện (cần ít nhất ${need} để chạy chấm).`,
    },
    {
      id: 'grade', title: 'Khóa bài và chạy chấm đến khi xong', done: finished,
      blocked: !event || eligible < need,
      hint: finished ? 'Vòng loại đã chấm xong.' : status === 'RUNNING' ? 'Đang chấm, đợi đến khi hoàn tất.' : eligible < need ? `Chưa đủ ${need} đội đủ điều kiện.` : 'Bấm “Khóa bài” rồi “Bắt đầu / tiếp tục chấm” ở khung Điều hành.',
      action: event && !finished ? { label: 'Tới điều hành', run: go('ai-step-ops') } : undefined,
    },
    {
      id: 'main', title: 'Tạo giải chính AI', done: !!main,
      hint: main ? `Đã có giải “${main.name}” (${main.num_teams} đội).` : `Tạo giải chính AI có đúng ${need} đội ở khung “Giải chính AI” phía dưới (chọn “Đề ML bốc từ kho” nếu muốn các hiệp thi bằng đề).`,
      action: main ? undefined : { label: 'Tới tạo giải', run: go('ai-step-main') },
    },
    {
      id: 'promote', title: 'Chốt đội vào giải chính', done: promoted,
      blocked: !finished || !main,
      hint: promoted ? `Top ${need} đã vào giải chính.` : !finished ? 'Chỉ chốt được khi vòng loại đã chấm xong.' : !main ? 'Cần tạo giải chính AI trước.' : 'Bấm “Chốt đội” ở khung Điều hành, chọn đúng giải chính AI.',
      action: finished && !promoted && main ? { label: 'Tới chốt đội', run: go('ai-step-ops') } : undefined,
    },
    {
      id: 'schedule', title: 'Xếp lịch giải chính', done: scheduled,
      blocked: !promoted || !main,
      hint: scheduled ? 'Đã xếp cặp đấu, sơ đồ nhánh hiện ở tab Giải chính AI.' : !promoted ? 'Làm sau khi chốt đội.' : 'Bấm “Xếp lịch” để ghép cặp vòng 1.',
      action: promoted && main && !scheduled ? {
        label: 'Xếp lịch', disabled: busy,
        run: () => void run(() => arenaApi.autoSchedule(mainId), 'Đã xếp lịch giải chính AI', () => { invalidate('t:'); invalidate('tl') }),
      } : undefined,
    },
    ...(taskMain ? [{
      id: 'round-tasks', title: 'Bốc và khóa đề cho từng hiệp của giải chính', done: planLocked,
      blocked: !scheduled,
      hint: planLocked ? 'Đề các hiệp đã khóa.' : !scheduled ? 'Làm sau khi xếp lịch.' : 'Bấm “Ra đề ngẫu nhiên” rồi “Khóa đề” ở khung Bộ đề của giải chính. Chưa khóa thì chưa nộp bài hay chạy hiệp được.',
      action: scheduled && !planLocked ? { label: 'Tới bộ đề giải chính', run: go('ai-step-main') } : undefined,
    } as Step] : []),
    {
      id: 'play', title: 'Chạy các trận, chấm báo cáo kỹ thuật và công bố', done: mainDone,
      blocked: !scheduled || (taskMain && !planLocked),
      hint: mainDone ? 'Giải chính đã có nhà vô địch.' : 'Chạy các hiệp ở tab Trận đấu; chấm báo cáo và công bố điểm ở khung Giải chính AI và báo cáo.',
      action: scheduled ? { label: 'Tới báo cáo', run: go('ai-step-main') } : undefined,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  return (
    <Card icon={<ListChecks />} title="Các bước điều hành Giải AI" subtitle="Làm lần lượt từ trên xuống. Bước sáng là việc cần làm tiếp theo."
      action={<Badge tone={doneCount === steps.length ? 'success' : 'info'}>{doneCount}/{steps.length} bước</Badge>}>
      <div className="space-y-4" data-testid="ai-steps">
        <ProgressBar value={doneCount} max={steps.length} label="Tiến độ" />
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const active = s === next
            return (
              <li key={s.id} data-testid={`ai-step-${s.id}`} data-done={s.done ? '1' : '0'}
                className={cn('flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm', active ? 'border-primary/50 bg-primary/5' : 'border-border', s.done && 'opacity-70')}>
                <span className="mt-0.5 shrink-0">
                  {s.done ? <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-label="Đã xong" /> : s.blocked ? <Lock className="size-5 text-muted-foreground" aria-label="Chưa làm được" /> : <Circle className={cn('size-5', active && 'text-primary')} aria-label="Chưa làm" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i + 1}. {s.title}{active && <Badge tone="accent" className="ml-2">Làm tiếp</Badge>}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                </div>
                {s.action && !s.done && <Button size="sm" variant={active ? 'primary' : 'secondary'} disabled={s.action.disabled || (s.blocked && !active)} onClick={s.action.run}>{s.action.label}</Button>}
              </li>
            )
          })}
        </ol>
      </div>
    </Card>
  )
}
