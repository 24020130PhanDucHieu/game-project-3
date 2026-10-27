'use client'

import { useState } from 'react'
import { ArrowRight, BookOpen, BrainCircuit, Braces, CheckCircle2, Database, Flag, Target } from 'lucide-react'
import { decodeRule, ruleBits } from '@/lib/format'
import { Tabs } from '../../ui'
import { MotionSurface } from '../../motion-surface'

/** Cùng cách giải thích cho kho đề, đề vòng loại và đề của hiệp thi. */
export function describeProblem(task: any) {
  const p = task.params || task
  const horizon = p.horizon ? `${p.horizon} nước` : 'số nước được ghi trong đề kỹ thuật'
  const cap = p.cap ? `${p.cap}` : 'giới hạn được ghi trong đề kỹ thuật'
  const specs: Record<string, { goal: string; output: string; example: string; exampleNote: string; caution: string; metric: string }> = {
    winner: {
      goal: 'Dự đoán kết quả cuối ván của bên đang đến lượt đi trong thế cờ được cung cấp.',
      output: 'Trả về 0 nếu dự đoán bên đang đi sẽ thua; trả về 1 nếu dự đoán bên đang đi sẽ thắng.',
      example: '[1, 0, 1]', exampleNote: 'Với ba mẫu kiểm tra: dự đoán bên đi thắng ở mẫu 1 và 3, thua ở mẫu 2.',
      caution: 'Đây là kết quả ván do các bot mẫu chơi tiếp, không phải kết luận bên nào chắc chắn thắng nếu cả hai chơi tối ưu. Có yếu tố ngẫu nhiên trong dữ liệu.',
      metric: 'Điểm = 100 × số mẫu đoán đúng / tổng số mẫu. Ví dụ đúng 8 trong 10 mẫu thì được 80 điểm.',
    },
    nextcard: {
      goal: 'Dự đoán lá bài tiếp theo của chính bên đang đến lượt đi (bên được chỉ bởi trường s).',
      output: 'Trả về số nguyên: 0 = Búa (ROCK), 1 = Bao/Giấy (PAPER), 2 = Kéo (SCISSORS).',
      example: '[0, 2, 1]', exampleNote: 'Với ba mẫu kiểm tra: dự đoán bên đi ra Búa, Kéo, rồi Bao.',
      caution: 'Bạn học lại thói quen ra bài của bot tạo dữ liệu. Không trả về lá khắc chế nó, tọa độ hay tên lá bài dạng chuỗi. Bot có thể đi ngẫu nhiên nên lịch sử giống nhau chưa chắc dẫn tới cùng đáp án.',
      metric: 'Điểm = tỷ lệ dự đoán đúng lá bài × 100. Đoán ngẫu nhiên đều ba lá có kỳ vọng khoảng 33,3 điểm.',
    },
    capture_next: {
      goal: 'Dự đoán trong lượt đi đang xét, bên đang đi có thực sự ăn được ít nhất một quân đối thủ hay không.',
      output: 'Trả về 1 nếu dự đoán có ăn quân; 0 nếu dự đoán không ăn quân.',
      example: '[1, 0, 0]', exampleNote: 'Với ba mẫu kiểm tra: dự đoán chỉ lượt đi trong mẫu thứ nhất ăn được quân.',
      caution: 'Nhãn ghi nhận kết quả nước đi thực tế của bot sinh dữ liệu. Nó không đơn thuần hỏi trên bàn có tồn tại một nước ăn quân hay không; cũng không hỏi bên đi có thắng cả ván hay không.',
      metric: 'Điểm = 100 × trung bình tỷ lệ đúng của từng lớp. Ví dụ đúng 8/10 mẫu “có ăn” và 6/10 mẫu “không ăn”: điểm = (80 + 60) / 2 = 70.',
    },
    plies_left: {
      goal: `Ước lượng số nước đi còn lại của ván mẫu, với nhãn được chặn trên ở ${cap} nước.`,
      output: 'Trả về một số cho mỗi mẫu. Có thể trả số thực để biểu diễn ước lượng; không trả nhãn thắng/thua.',
      example: '[8.5, 12, 3]', exampleNote: 'Đây là ba ước lượng số nước còn lại, tương ứng ba mẫu kiểm tra; không phải ba nước đi cần thực hiện.',
      caution: 'Một nước là một lượt của một bên. Nhãn phụ thuộc vào cách các bot mẫu chơi tiếp; các giá trị vượt trần được gom về trần của đề.',
      metric: 'Điểm = 100 × max(0, R²), với R² = 1 − tổng bình phương sai số / tổng bình phương độ lệch của đáp án so với trung bình. Dự đoán sát đáp án được gần 100; kém hơn mốc trung bình được 0. Nếu mọi đáp án giống nhau, máy chấm trả 0.',
    },
    material: {
      goal: `Ước lượng chênh lệch số quân sau ${horizon} tiếp theo, hoặc ở thời điểm ván kết thúc nếu kết thúc sớm.`,
      output: 'Số quân của bên đang đi trong mẫu ban đầu trừ số quân đối thủ tại thời điểm cần dự đoán. Số dương là hơn quân, số âm là kém quân.',
      example: '[2, -1.5, 0]', exampleNote: 'Ba dự đoán tương ứng: hơn khoảng 2 quân, kém khoảng 1,5 quân, và cân bằng quân. Dự đoán được phép là số thực dù đáp án đếm quân là số nguyên.',
      caution: 'Mốc “bên mình” cố định theo bên đang đi ở mẫu đầu vào. Không đổi dấu theo bên đi ở thời điểm tương lai và không chỉ đếm chênh lệch quân hiện tại.',
      metric: 'Điểm = 100 × max(0, R²). R² so tổng bình phương sai số của mô hình với cách luôn dự đoán trung bình đáp án. Càng sát đáp án càng gần 100; không hơn mốc trung bình thì được 0. Bộ đáp án không có biến thiên được chấm 0.',
    },
  }
  return specs[task.template] || { goal: task.plain || task.title || 'Đọc mục tiêu trong đề kỹ thuật.', output: (task.label_help || []).join('; '), example: '[]', exampleNote: 'Mỗi mẫu kiểm tra cần đúng một dự đoán.', caution: 'Đối chiếu đề kỹ thuật và dữ liệu được cấp.', metric: task.metric_plain || 'Theo thước đo trong đề.' }
}

function TaskJourney({ spec, train, time }: { spec: ReturnType<typeof describeProblem>; train?: number; time?: number }) {
  const [step, setStep] = useState<'data' | 'predict' | 'score'>('data')
  const [sample, setSample] = useState(0)
  let values: number[] = []
  try { values = JSON.parse(spec.example) } catch { /* đề tùy chỉnh có thể không có ví dụ */ }
  return <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card" data-testid="task-journey">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Hiểu đề trong 3 bước</p><h4 className="mt-1 text-base font-extrabold">Dữ liệu vào → Mô hình → Kết quả</h4></div><Tabs value={step} onChange={setStep} tabs={[{ id: 'data', label: '1. Dữ liệu', icon: <Database className="size-3.5" /> }, { id: 'predict', label: '2. Dự đoán', icon: <BrainCircuit className="size-3.5" /> }, { id: 'score', label: '3. Chấm điểm', icon: <Target className="size-3.5" /> }]} /></header>
    <div key={step} className="lesson-stage min-h-52 p-4 sm:p-5" role="region" aria-label={`Minh họa ${step === 'data' ? 'dữ liệu' : step === 'predict' ? 'dự đoán' : 'chấm điểm'}`}>
      {step === 'data' && <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4"><p className="text-xs font-bold text-sky-700 dark:text-sky-300">ĐỂ HỌC</p><h5 className="mt-2 font-bold">Thế cờ + đáp án đi kèm</h5><p className="mt-2 text-muted-foreground">{train ? `${train} mẫu` : 'Các mẫu'} có nhãn giúp mô hình tìm quan hệ giữa đặc điểm thế cờ và đáp án.</p><code className="mt-3 block break-all rounded-lg bg-background/60 p-2 text-xs">task["train"]["X"] ↔ task["train"]["y"]</code></div>
        <div className="flex items-center justify-center" aria-hidden><svg viewBox="0 0 64 24" className="hidden h-6 w-12 text-primary md:block"><path d="M2 12H56M48 5L56 12L48 19" className="lesson-connector" fill="none" stroke="currentColor" strokeWidth="2" /></svg><BrainCircuit className="size-7 text-primary md:hidden" /></div>
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4"><p className="text-xs font-bold text-primary">ĐỂ DỰ ĐOÁN</p><h5 className="mt-2 font-bold">Thế cờ chưa có đáp án</h5><p className="mt-2 text-muted-foreground">Hàm <code>solve(task)</code> dùng kiến thức đã học để dự đoán lần lượt từng mẫu kiểm tra.</p><code className="mt-3 block rounded-lg bg-background/60 p-2 text-xs">task["test"]["X"] → danh sách số</code></div>
        <p className="mt-1 text-xs text-muted-foreground md:col-span-3">Dữ liệu được đưa sẵn vào hàm. Bạn có thể mở ví dụ thế cờ thật bên dưới để xem một mẫu trông như thế nào.</p>
      </div>}
      {step === 'predict' && <div className="space-y-4"><p className="text-xs font-medium text-muted-foreground">Ví dụ minh họa định dạng · Bấm một mẫu để thấy vị trí dự đoán tương ứng.</p><div className="grid gap-3 sm:grid-cols-3">{values.map((value, i) => <button type="button" key={i} onClick={() => setSample(i)} aria-pressed={sample === i} className={`lesson-token rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sample === i ? 'border-primary/60 bg-primary/10' : 'border-border bg-background/40 hover:border-primary/35'}`}><span className="text-xs text-muted-foreground">Mẫu kiểm tra {i + 1}</span><span className="mt-2 flex items-center gap-2 font-mono text-xs">test["X"][{i}]<ArrowRight className="size-4 text-primary" /><strong className="text-xl text-primary">{value}</strong></span></button>)}</div><div className="flex flex-wrap items-center gap-3 rounded-xl bg-background/60 p-3"><span className="text-xs font-semibold">Danh sách trả về:</span><code className="text-lg">[ {values.map((value, i) => <span key={i}><span className={sample === i ? 'rounded bg-primary/20 px-1 font-bold text-primary' : ''}>{value}</span>{i < values.length - 1 ? ', ' : ''}</span>)} ]</code></div><p className="text-muted-foreground">{spec.exampleNote}</p><p className="text-xs font-semibold text-primary">Đúng số lượng · Đúng thứ tự · Mỗi mẫu đúng một số</p></div>}
      {step === 'score' && <div className="space-y-4"><div className="flex gap-3"><span className="icon-tile grid size-11 shrink-0 place-items-center rounded-2xl"><Target className="size-5 text-primary" /></span><div><h5 className="font-bold">So dự đoán với đáp án thật</h5><p className="mt-2 text-muted-foreground">{spec.metric}</p></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="font-semibold">Chấm thử để hiểu lỗi</p><p className="mt-1 text-xs text-muted-foreground">Tách một phần dữ liệu học để kiểm tra. Xem từng thế cờ, đáp án và dự đoán để cải thiện mô hình.</p></div><div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="font-semibold">Điểm thi trên dữ liệu ẩn</p><p className="mt-1 text-xs text-muted-foreground">Máy chấm dùng bộ thế cờ riêng. Điểm chấm thử giúp ước lượng, không bảo đảm bằng điểm xếp hạng.</p></div></div>{time && <p className="text-xs font-medium text-primary">Giới hạn {time} giây cho cả lần giải đề.</p>}</div>}
    </div>
  </section>
}

export function ProblemExplanation({ task }: { task: any }) {
  const spec = describeProblem(task)
  const rules = decodeRule(task.rule_id || task.params?.rule_id).active
  const time = task.time_s ?? task.params?.time_s
  const train = task.n_train ?? task.params?.n_train
  return <div className="space-y-4 text-sm leading-relaxed" data-testid="problem-explanation">
    <MotionSurface className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5"><h4 className="flex items-center gap-2 font-bold"><Target className="size-4 text-primary" />Mục tiêu của bạn</h4><p className="mt-3 text-base font-semibold">{spec.goal}</p><div className="mt-4 rounded-xl border border-primary/15 bg-background/50 p-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">Đầu ra cần trả về</p><p className="text-muted-foreground">{spec.output}</p></div></MotionSurface>
    <TaskJourney key={`${task.id || task.template}`} spec={spec} train={train} time={time} />
    <details className="group rounded-2xl border border-border bg-card/50"><summary className="cursor-pointer p-4 font-bold transition-colors hover:bg-primary/5">Hướng dẫn viết hàm & ví dụ đầu ra</summary><div className="space-y-4 border-t border-border p-4">
      <section className="rounded-2xl border border-border bg-muted/20 p-4"><h4 className="flex items-center gap-2 font-bold"><Braces className="size-4 text-primary" />Hàm nhận gì, trả gì?</h4><p className="mt-2">Viết <code>solve(task)</code>. Học từ <code>task["train"]["X"]</code> và nhãn cùng vị trí trong <code>task["train"]["y"]</code>{train ? ` (${train} mẫu có nhãn)` : ''}. Dự đoán cho từng mẫu trong <code>task["test"]["X"]</code>.</p><p className="mt-2 font-medium">Trả một danh sách số, đúng số mẫu và đúng thứ tự. Không trả tọa độ, văn bản hay danh sách lá bài.</p></section>
    <section className="rounded-2xl border border-border p-4"><h4 className="font-bold">Ví dụ định dạng đầu ra</h4><div className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">3 mẫu trong test["X"]</span><span aria-hidden>→</span><code className="rounded-lg bg-primary/10 px-3 py-2 font-bold text-primary">{spec.example}</code></div><p className="mt-2 text-muted-foreground">{spec.exampleNote} Ví dụ này chỉ minh họa định dạng, không phải đáp án của các bàn cờ bên dưới.</p></section>
    </div></details>
    <details className="task-reference group rounded-2xl border border-border bg-card/50"><summary className="cursor-pointer p-4 font-bold">Tra cứu ký hiệu bàn cờ & luật áp dụng</summary><div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
      <section className="rounded-2xl border border-border p-4"><h4 className="flex items-center gap-2 font-bold"><BookOpen className="size-4 text-primary" />Đọc một mẫu thế cờ</h4><ul className="mt-2 space-y-2 text-muted-foreground"><li><code>b</code>: 81 ký tự, đọc theo hàng; ô ở hàng r, cột c có chỉ số <code>9*r+c</code> (r, c từ 0 đến 8).</li><li><code>R/P/S/J</code>: quân của bên đi. <code>r/p/s/j</code>: quân đối thủ. <code>.</code>: ô trống; <code>#</code>: vật cản; <code>?</code>: quân bị che.</li><li><code>s</code>: 0 là Đỏ, 1 là Xanh. Chữ HOA luôn là bên đi, không phải luôn là Đỏ.</li><li><code>c</code>, <code>e</code>: số quân Búa/Bao/Kéo của bên đi và đối thủ; <code>e</code> có thể null khi sương mù.</li><li><code>t</code>: số lượt; <code>h</code>, <code>g</code>: lịch sử lá bài gần đây của hai bên. Dùng đúng dữ liệu được cấp, không tự đoán loại quân bị che.</li></ul></section>
      <section className="rounded-2xl border border-border p-4"><h4 className="flex items-center gap-2 font-bold"><Flag className="size-4 text-primary" />Luật áp dụng</h4><p className="mt-2 font-medium">{rules.length ? rules.join(' + ') : 'Luật chuẩn: Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa.'}</p>{ruleBits.filter(r => rules.includes(r.label)).map(r => <p className="mt-2 text-muted-foreground" key={r.key}>{r.hint}</p>)}<p className="mt-3 text-muted-foreground">{time ? `Giới hạn ${time} giây cho cả lần giải đề, không phải mỗi mẫu. ` : ''}Chấm thử tách một phần dữ liệu học để kiểm tra; điểm xếp hạng được chấm trên dữ liệu ẩn riêng.</p></section>
    </div></details>
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-amber-900 dark:text-amber-200"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span><strong>Điểm cần hiểu đúng: </strong>{spec.caution}</span></p>
  </div>
}
