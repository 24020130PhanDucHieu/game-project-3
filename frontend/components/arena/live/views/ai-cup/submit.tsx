'use client'

import { useEffect, useState } from 'react'
import { Cpu, FlaskConical, Info, Save } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate } from '@/lib/cache'
import { offlineEngine } from '@/lib/offline-engine'
import { enqueue, isRetryable, newSubmissionId } from '@/lib/outbox'
import { stamp } from '@/lib/format'
import { Badge, Button, Card, DataTable, EmptyState, Select, StatusBadge, TextArea } from '../../ui'
import { useLive } from '../../context'
import { Workbench } from '../../workbench'
import { SyncStatusCard } from '../../sync-status'
import { CodeViewer } from '../../replay-viewer'
import { AI_TEMPLATES } from './templates'
import { TASK_TEMPLATES } from './task-templates'
import { FAMILY_NAME, ScoreBar, fmt } from './common'
import { CheckVisual, LossChart, visualFrom, type CheckVisualData } from './check-visual'

type Check = { public_score: number; families_public: Record<string, number>; errors: string[]; elapsed_ms: number }

function ModelCardForm({ eventId, problem, mine, editable }: { eventId: string; problem: any; mine: any; editable: boolean }) {
  const { run } = useLive()
  const [technique, setTechnique] = useState('')
  const [card, setCard] = useState('')
  useEffect(() => { setTechnique(mine?.technique || ''); setCard(mine?.model_card || '') }, [mine?.technique, mine?.model_card])
  const dirty = technique !== (mine?.technique || '') || card.trim() !== (mine?.model_card || '')
  return (
    <Card icon={<Cpu />} title="Khai báo kỹ thuật" subtitle="Giúp ban giám khảo hiểu mô hình và là cơ sở để chấm báo cáo kỹ thuật ở giải chính">
      <div className="space-y-3">
        <Select label="Kỹ thuật chính" value={technique} onChange={(e) => setTechnique(e.target.value)} disabled={!editable} data-testid="ai-technique">
          <option value="">— Chọn kỹ thuật —</option>
          {(problem?.techniques || []).map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <TextArea label="Thẻ mô hình (tối đa 2.000 ký tự): ý tưởng, dữ liệu dùng để huấn luyện, điểm yếu đã biết" rows={4} maxLength={2000} value={card} onChange={(e) => setCard(e.target.value)} disabled={!editable} data-testid="ai-model-card" />
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={!editable || !technique || !dirty} onClick={() => void run(() => arenaApi.saveAiModelCard(eventId, { technique, model_card: card.trim() }), 'Đã lưu khai báo kỹ thuật', () => invalidate('q'))} data-testid="ai-save-card"><Save className="size-4" />Lưu khai báo</Button>
          {!editable && <span className="text-xs text-muted-foreground">Vòng loại đã bắt đầu chấm; không đổi được nữa.</span>}
          {editable && mine?.technique && !dirty && <Badge tone="success">Đã lưu</Badge>}
        </div>
      </div>
    </Card>
  )
}

function CheckResult({ check }: { check: Check }) {
  const rows = Object.entries(check.families_public)
  return (
    <div data-testid="ai-check-result" className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-xs text-muted-foreground">Điểm trên bộ công khai (chạy trên máy bạn)</p><p className="font-display text-3xl font-black tabular-nums" data-testid="ai-check-score">{fmt(check.public_score)}</p></div>
        <p className="text-xs text-muted-foreground">{(check.elapsed_ms / 1000).toFixed(1)} giây · đoán ngẫu nhiên ≈ 50</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{rows.map(([kind, value]) => <ScoreBar key={kind} value={value} label={FAMILY_NAME[kind] || kind} />)}</div>
      {check.errors.length > 0 && <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">{check.errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />Con số này dùng đúng bộ đối thủ công khai nên sát điểm trên bảng công khai. Điểm xếp hạng thật tính trên bộ ẩn và bàn cờ, nên đừng chỉnh mô hình chỉ để đẹp con số này.</p>
    </div>
  )
}

export function SubmitTab({ eventId, event, problem, detail, mine, blocked, onMineChange }: { eventId: string; event: any; problem: any; detail: any; mine: any; blocked: string; onMineChange: () => void }) {
  const tasksMode = problem?.mode === 'TASKS'
  const { session, outbox, toast } = useLive()
  const [submitting, setSubmitting] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [viewing, setViewing] = useState<any>(null)
  const [taskIndex, setTaskIndex] = useState('1')
  const [taskCheck, setTaskCheck] = useState<{ n: number; name: string; visual: CheckVisualData } | null>(null)
  const [live, setLive] = useState<number[]>([])
  const history: any[] = detail.data?.history || []
  const participant = detail.data?.participant
  const pending = outbox.filter((o) => o.kind !== 'match' && o.qualifierId === eventId)
  const draftKey = `aicup:${eventId}:${session.student_id}`

  async function submit(value: { code: string; language: string }) {
    const id = newSubmissionId()
    const payload = { code: value.code, language: value.language }
    setSubmitting(true)
    try {
      await arenaApi.submitQualifier(eventId, payload, id)
      toast('success', 'Server đã nhận mô hình và đưa vào hàng đợi kiểm tra.')
      invalidate('q')
      onMineChange()
    } catch (e) {
      if (isRetryable(e) && session.student_id) {
        enqueue({ id, studentId: session.student_id, qualifierId: eventId, payload })
        toast('info', 'Chưa gửi được tới server. Bài đã lưu trên thiết bị và sẽ tự gửi lại khi có mạng.')
      } else toast('error', e instanceof Error ? e.message : 'Bài bị từ chối')
    } finally { setSubmitting(false) }
  }

  async function localCheck(code: string) {
    setChecking(true); setCheckError(''); setCheck(null)
    try {
      setCheck(await offlineEngine.aiCheck(code, problem.public_seed, problem.rounds_per_match, problem.instances))
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Không chấm thử được')
    } finally { setChecking(false) }
  }

  async function localTaskCheck(code: string) {
    const n = Number(taskIndex)
    setChecking(true); setCheckError(''); setTaskCheck(null); setLive([])
    try {
      const data = await arenaApi.getAiCupTaskData(eventId, n)
      const result = await offlineEngine.taskCheck(code, data, (p) => setLive((old) => (old.length < 400 ? [...old, p.loss] : old)))
      setTaskCheck({ n, name: problem.tasks?.[n - 1]?.name || `Đề ${n}`, visual: visualFrom(data, result) })
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Không chấm thử được')
    } finally { setChecking(false) }
  }

  const editableCard = ['OPEN', 'CLOSING', 'LOCKED'].includes(event.status)
  return (
    <div className="space-y-6">
      <ModelCardForm eventId={eventId} problem={problem} mine={mine} editable={editableCard} />
      <Card title="Nộp mô hình" subtitle="Bản hợp lệ cuối cùng được khóa khi hết hạn. Giải AI chỉ nhận Python.">
        <Workbench
          draftKey={draftKey}
          submitLabel="Gửi mô hình tới hàng đợi"
          submitting={submitting}
          submitDisabledReason={blocked}
          onSubmit={submit}
          templates={tasksMode ? TASK_TEMPLATES : AI_TEMPLATES}
          pythonOnly
          practice={!tasksMode}
          hideValidate={tasksMode}
          renderActions={(value) => tasksMode ? (
            <>
              <Select value={taskIndex} onChange={(e) => setTaskIndex(e.target.value)} aria-label="Chọn đề để chấm thử" className="w-56">
                {(problem.tasks || []).map((t: any, i: number) => <option key={i} value={String(i + 1)}>{`Đề ${i + 1}: ${t.name}`}</option>)}
              </Select>
              <Button variant="secondary" loading={checking} disabled={!value.code.trim() || !problem.tasks?.length} onClick={() => void localTaskCheck(value.code)} data-testid="ai-task-check"><FlaskConical className="size-4" />Chấm thử đề này (trên máy)</Button>
            </>
          ) : (
            <Button variant="secondary" loading={checking} disabled={!value.code.trim()} onClick={() => void localCheck(value.code)} data-testid="ai-local-check"><FlaskConical className="size-4" />Chấm thử trên bộ công khai (trên máy)</Button>
          )}
          extra={
            <div className="space-y-4">
              {checking && <p className="text-xs text-muted-foreground" role="status">Đang chấm trên máy bạn. Lần đầu khởi động máy chấm có thể mất khoảng một phút…</p>}
              {checkError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" data-testid="ai-check-error">{checkError}</p>}
              {check && <CheckResult check={check} />}
              {checking && tasksMode && live.length > 1 && <LossChart points={live} live />}
              {taskCheck && (
                <div data-testid="ai-task-check-result" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Đề {taskCheck.n}: {taskCheck.name} · huấn luyện trên {taskCheck.visual.result.n_train} mẫu, kiểm tra {taskCheck.visual.result.n_val} mẫu để riêng ra từ dữ liệu bạn tải</p>
                  <span className="sr-only" data-testid="ai-task-check-score">{fmt(taskCheck.visual.result.score)}</span>
                  <CheckVisual data={taskCheck.visual} />
                  <p className="text-xs text-muted-foreground">{(taskCheck.visual.result.elapsed_ms / 1000).toFixed(1)} giây trên máy bạn · đây là ước lượng; điểm thật tính trên thế cờ ẩn của máy chấm</p>
                  {taskCheck.visual.result.error && <p className="text-xs text-amber-700 dark:text-amber-300">{taskCheck.visual.result.error}</p>}
                </div>
              )}
              <SyncStatusCard draftKey={draftKey} pending={pending} serverLoading={detail.loading}
                server={history[0] ? { id: history[0].id, code: history[0].code, language: history[0].language, at: Number(history[0].at), valid: history[0].valid } : null} />
            </div>
          }
        />
      </Card>
      <Card title="Lịch sử bài nộp" subtitle="Mỗi lần nộp là một bản; bản hợp lệ cuối cùng sẽ được khóa">
        {history.length ? (
          <DataTable head={['Thời gian', 'Mã bài', 'Kết quả', 'Chi tiết', '']}>
            {history.map((h) => (
              <tr key={h.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2.5">{stamp(h.at)}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{String(h.id).slice(0, 10)}</td>
                <td className="px-3 py-2.5"><StatusBadge status={h.status || (h.valid ? 'VALID' : 'INVALID')} />{participant?.locked_id === h.id && <Badge tone="info" className="ml-2">Đã khóa</Badge>}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{h.error}</td>
                <td className="px-3 py-2.5 text-right">{h.code && <Button size="sm" variant="secondary" onClick={() => setViewing({ ...h, team_name: session.team_name || 'Đội của bạn', submitted_at: h.at })}>Xem mã</Button>}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Chưa có bài nộp" />}
      </Card>
      {viewing && <CodeViewer submission={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
