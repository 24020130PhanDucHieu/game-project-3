'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, Download, Info, Target } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { decodeRule } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, ErrorNote, Skeleton } from '../../ui'
import { MiniBoard } from './check-visual'
import { ProblemExplanation } from './problem-explanation'

const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

/** Giải thích file JSON: dùng chung cho tab Đề bài (vòng loại) và phòng trận (giải chính). */
export function JsonNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-border bg-muted/30 text-xs leading-relaxed text-muted-foreground', compact ? 'p-2.5' : 'p-3')} data-testid="json-note">
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <span><strong className="text-foreground">Tệp JSON không bắt buộc.</strong> Nó chính là <code className="rounded bg-muted px-1 font-mono">task["train"]</code> mà hàm <code className="rounded bg-muted px-1 font-mono">solve</code> đã nhận sẵn. Chỉ tải để xem dữ liệu hoặc huấn luyện trên máy mình (NumPy, PyTorch…) rồi nhúng trọng số vào mã (tối đa 64 KB).</span>
    </p>
  )
}

/** Mục thu gọn có biểu tượng, mũi tên xoay và nội dung trượt mở; dùng cho phần ít khi cần xem. */
export function Fold({ icon, title, hint, children, defaultOpen = false, testid }: { icon?: ReactNode; title: string; hint?: string; children: ReactNode; defaultOpen?: boolean; testid?: string }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-card/60 open:bg-card" data-testid={testid}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        {icon && <span className="grid size-8 shrink-0 place-items-center rounded-xl icon-tile text-primary [&_svg]:size-4" aria-hidden>{icon}</span>}
        <span className="min-w-0 flex-1"><span className="block">{title}</span>{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border px-4 py-4 text-sm">{children}</div>
    </details>
  )
}

/** Vạch thang 0–100 có đánh dấu mức đoán mò để biết điểm bao nhiêu là "khá". */
function ChanceBar({ chance }: { chance: number }) {
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 bg-amber-400/60" style={{ width: `${chance}%` }} />
        <span className="absolute inset-y-0 bg-emerald-400/40" style={{ left: `${chance}%`, right: 0 }} />
        <span className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${chance}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>đoán mò ≈ {Math.round(chance)}</span><span>100</span></div>
    </div>
  )
}

type Example = { b: string; s: number; label: string }
// Ví dụ thật của từng đề chỉ tải một lần cho cả phiên (đổi qua lại giữa các đề không tải lại).
const exampleCache = new Map<string, Example[]>()

/** Một đề, hai cột: bên trái đề hỏi gì kèm ví dụ thật; bên phải cách chấm điểm và dữ liệu. */
export function TaskCard({ eventId, index, t }: { eventId: string; index: number; t: any }) {
  const cacheKey = `${eventId}:${index}`
  const [examples, setExamples] = useState<Example[] | null>(exampleCache.get(cacheKey) ?? null)
  const [error, setError] = useState('')
  const [full, setFull] = useState(false)
  const rules = decodeRule(t.rule_id).active
  const regression = t.kind === 'reg'

  useEffect(() => {
    if (exampleCache.has(cacheKey)) { setExamples(exampleCache.get(cacheKey)!); return }
    let alive = true
    setExamples(null); setError('')
    void (async () => {
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
        const list = picked.map((i) => ({
          b: String(X[i].b), s: Number(X[i].s) || 0,
          label: regression ? `Nhãn = ${Number(y[i]).toFixed(1)}` : `Nhãn ${y[i]} — ${String(t.label_help?.[y[i]] || '').replace(/^\d+\s*=\s*/, '')}`,
        }))
        exampleCache.set(cacheKey, list)
        if (alive) setExamples(list)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Không tải được ví dụ') }
    })()
    return () => { alive = false }
  }, [cacheKey, eventId, index, regression, t.label_help])

  return (
    <article className="animate-fade-up space-y-4 rounded-2xl border border-border surface p-5" data-testid={`task-card-${index + 1}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Đề {index + 1}</p>
          <h3 className="font-display text-xl font-extrabold leading-tight">{t.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t.n_train} mẫu để học · tối đa {t.time_s} giây · {rules.length ? rules.join(' + ') : 'luật chuẩn'}</p>
        </div>
        <Badge tone={t.difficulty === 1 ? 'success' : t.difficulty === 2 ? 'info' : 'warning'}>{DIFFICULTY[t.difficulty]}</Badge>
      </header>

      <ProblemExplanation task={t} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <section className="space-y-3">
          <p className="rounded-2xl bg-primary/5 px-4 py-3 text-[15px] leading-relaxed" data-testid="task-plain">{t.plain || t.title}</p>
          {Array.isArray(t.label_help) && t.label_help.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" data-testid="task-labels">{t.label_help.map((l: string) => <li key={l}><Badge tone="neutral">{l}</Badge></li>)}</ul>
          )}
          {t.note && <p className="rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">Ghi chú của ban tổ chức: {t.note}</p>}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Ví dụ thật từ dữ liệu của đề</p>
            {error ? <ErrorNote message={error} /> : examples ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="task-examples">
                {examples.map((e, i) => (
                  <figure key={i} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/20 p-3 transition-transform hover:-translate-y-0.5">
                    <MiniBoard b={e.b} s={e.s} title={`Ví dụ ${i + 1}`} />
                    <figcaption className="text-center text-xs"><span className="block text-muted-foreground">Bên {e.s === 0 ? 'Đỏ' : 'Xanh'} đang đi</span><strong className="leading-snug">{e.label}</strong></figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-muted/20 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold"><Target className="size-4 text-primary" aria-hidden />Chấm điểm thế nào?</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid="task-metric">{t.metric_plain || 'Điểm trên thang 0–100.'}</p>
            {!regression && <ChanceBar chance={Number(t.chance) || 0} />}
          </section>
          <section className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold"><Download className="size-4 text-primary" aria-hidden />Dữ liệu để học</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">Có sẵn trong <code className="rounded bg-muted px-1 font-mono">task["train"]</code> ({t.n_train} mẫu có nhãn). Không cần tải gì để làm bài.</p>
            <a href={arenaApi.aiCupTaskDataUrl(eventId, index + 1)} download className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/50" data-testid={`task-data-${index + 1}`} title="Không bắt buộc: chỉ để xem dữ liệu hoặc huấn luyện ngoài máy"><Download className="size-3.5" />Tải JSON (không bắt buộc)</a>
          </section>
          <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setFull((v) => !v)} aria-expanded={full}>{full ? 'Ẩn' : 'Xem'} đề bài kỹ thuật đầy đủ</button>
          {full && <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="task-statement">{t.statement}</p>}
        </aside>
      </div>
    </article>
  )
}
