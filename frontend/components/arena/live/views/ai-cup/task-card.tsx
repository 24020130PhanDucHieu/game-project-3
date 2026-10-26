'use client'

import { useState } from 'react'
import { Brain, Download, Eye, Info, Target } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { decodeRule } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, ErrorNote } from '../../ui'
import { MiniBoard } from './check-visual'

const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

/** Giải thích file JSON: dùng chung cho tab Đề bài (vòng loại) và phòng trận (giải chính). */
export function JsonNote() {
  return (
    <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="json-note">
      <Info className="mr-1 inline size-3.5 text-primary" aria-hidden />
      <strong className="text-foreground">Tệp JSON này không bắt buộc.</strong> Nó chính là dữ liệu <code className="rounded bg-muted px-1 font-mono">task["train"]</code> mà hàm <code className="rounded bg-muted px-1 font-mono">solve</code> của bạn đã nhận sẵn khi chạy. Chỉ tải nếu bạn muốn <strong>xem dữ liệu</strong> hoặc <strong>huấn luyện trên máy mình</strong> (NumPy, PyTorch…) rồi nhúng trọng số vào mã nộp (mã tối đa 64 KB).
    </p>
  )
}

/** Vạch thang 0–100 có đánh dấu mức đoán mò để biết điểm bao nhiêu là "khá". */
function ChanceBar({ chance }: { chance: number }) {
  return (
    <div className="mt-2" aria-hidden>
      <div className="relative h-2.5 rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 rounded-full bg-amber-400/70" style={{ width: `${chance}%` }} />
        <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground/70" style={{ left: `${chance}%`, height: '18px' }} />
      </div>
      <div className="relative mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span style={{ position: 'absolute', left: `${chance}%`, transform: 'translateX(-50%)' }}>đoán mò ≈ {Math.round(chance)}</span><span>100</span></div>
    </div>
  )
}

/** Một đề: hỏi gì, ví dụ thật, chấm thế nào, dữ liệu. Câu chữ lấy từ máy chấm (plain, label_help, metric_plain, chance). */
export function TaskCard({ eventId, index, t }: { eventId: string; index: number; t: any }) {
  const [examples, setExamples] = useState<{ b: string; s: number; label: string }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [full, setFull] = useState(false)
  const rules = decodeRule(t.rule_id).active
  const regression = t.kind === 'reg'

  async function loadExamples() {
    setLoading(true); setError('')
    try {
      const data = await arenaApi.getAiCupTaskData(eventId, index + 1)
      const X: any[] = data.train.X
      const y: number[] = data.train.y
      const picked: number[] = []
      if (regression) for (let i = 0; i < X.length && picked.length < 3; i += Math.max(1, Math.floor(X.length / 3))) picked.push(i)
      else {
        const seen = new Set<number>()
        for (let i = 0; i < X.length && picked.length < 3; i++) if (!seen.has(y[i])) { seen.add(y[i]); picked.push(i) }
        for (let i = 0; i < X.length && picked.length < 3; i++) if (!picked.includes(i)) picked.push(i)
      }
      setExamples(picked.map((i) => ({
        b: String(X[i].b), s: Number(X[i].s) || 0,
        label: regression ? `Nhãn = ${Number(y[i]).toFixed(1)}` : `Nhãn ${y[i]} — ${String(t.label_help?.[y[i]] || '').replace(/^\d+\s*=\s*/, '')}`,
      })))
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được ví dụ') } finally { setLoading(false) }
  }

  return (
    <Card icon={<Brain />} title={`Đề ${index + 1}: ${t.name}`} subtitle={`${t.n_train} mẫu để học · tối đa ${t.time_s} giây · ${rules.length ? rules.join(' + ') : 'luật chuẩn'}`}
      action={<Badge tone={t.difficulty === 1 ? 'success' : t.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[t.difficulty]}</Badge>}>
      <div className="space-y-5">
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">1 · Đề này hỏi gì?</h4>
          <p className="mt-1 text-sm leading-relaxed" data-testid="task-plain">{t.plain || t.title}</p>
          {Array.isArray(t.label_help) && t.label_help.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="task-labels">{t.label_help.map((l: string) => <li key={l}><Badge tone="neutral">{l}</Badge></li>)}</ul>
          )}
          {t.note && <p className="mt-2 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">Ghi chú của ban tổ chức: {t.note}</p>}
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">2 · Ví dụ thật từ dữ liệu</h4>
          {examples ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-3" data-testid="task-examples">
              {examples.map((e, i) => (
                <figure key={i} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/20 p-3">
                  <MiniBoard b={e.b} s={e.s} title={`Ví dụ ${i + 1}`} />
                  <figcaption className="text-center text-xs"><span className="block text-muted-foreground">Bên {e.s === 0 ? 'Đỏ' : 'Xanh'} đang đến lượt đi</span><strong>{e.label}</strong></figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" loading={loading} onClick={() => void loadExamples()} data-testid={`task-examples-btn-${index + 1}`}><Eye className="size-3.5" />Xem 3 ví dụ thật</Button>
              <span className="text-xs text-muted-foreground">Mỗi ví dụ là một thế cờ kèm “đáp án” (nhãn) mà mô hình của bạn phải học cách đoán.</span>
            </div>
          )}
          {error && <div className="mt-2"><ErrorNote message={error} /></div>}
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">3 · Chấm điểm thế nào?</h4>
          <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed"><Target className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span data-testid="task-metric">{t.metric_plain || 'Điểm trên thang 0–100.'}</span></p>
          <ChanceBar chance={Number(t.chance) || 0} />
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">4 · Dữ liệu để học</h4>
          <p className="text-sm text-muted-foreground">Có sẵn trong hàm <code className="rounded bg-muted px-1 font-mono text-xs">solve</code> (<code className="rounded bg-muted px-1 font-mono text-xs">task["train"]</code>: {t.n_train} mẫu có nhãn). Bạn không cần tải gì để làm bài.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={arenaApi.aiCupTaskDataUrl(eventId, index + 1)} download className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs font-semibold hover:border-primary/50" data-testid={`task-data-${index + 1}`}><Download className="size-3.5" />Tải tệp JSON (không bắt buộc)</a>
            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setFull((v) => !v)} aria-expanded={full}>{full ? 'Ẩn' : 'Xem'} đề bài kỹ thuật đầy đủ</button>
          </div>
          {full && <p className={cn('whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground')} data-testid="task-statement">{t.statement}</p>}
        </section>
      </div>
    </Card>
  )
}
