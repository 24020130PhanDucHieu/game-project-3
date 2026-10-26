'use client'

import { BookOpen, Braces, CheckCircle2, Flag, Target } from 'lucide-react'
import { decodeRule, ruleBits } from '@/lib/format'

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

export function ProblemExplanation({ task }: { task: any }) {
  const spec = describeProblem(task)
  const rules = decodeRule(task.rule_id || task.params?.rule_id).active
  const time = task.time_s ?? task.params?.time_s
  const train = task.n_train ?? task.params?.n_train
  return <div className="space-y-4 text-sm leading-relaxed" data-testid="problem-explanation">
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4"><h4 className="flex items-center gap-2 font-bold"><Target className="size-4 text-primary" />1. Bạn cần dự đoán gì?</h4><p className="mt-2">{spec.goal}</p><p className="mt-3 text-muted-foreground">{spec.output}</p></section>
      <section className="rounded-2xl border border-border bg-muted/20 p-4"><h4 className="flex items-center gap-2 font-bold"><Braces className="size-4 text-primary" />2. Hàm nhận gì, trả gì?</h4><p className="mt-2">Viết <code>solve(task)</code>. Học từ <code>task["train"]["X"]</code> và nhãn cùng vị trí trong <code>task["train"]["y"]</code>{train ? ` (${train} mẫu có nhãn)` : ''}. Dự đoán cho từng mẫu trong <code>task["test"]["X"]</code>.</p><p className="mt-2 font-medium">Trả một danh sách số, đúng số mẫu và đúng thứ tự. Không trả tọa độ, văn bản hay danh sách lá bài.</p></section>
    </div>
    <section className="rounded-2xl border border-border p-4"><h4 className="font-bold">3. Ví dụ định dạng đầu ra</h4><div className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">3 mẫu trong test["X"]</span><span aria-hidden>→</span><code className="rounded-lg bg-primary/10 px-3 py-2 font-bold text-primary">{spec.example}</code></div><p className="mt-2 text-muted-foreground">{spec.exampleNote} Ví dụ này chỉ minh họa định dạng, không phải đáp án của các bàn cờ bên dưới.</p></section>
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-border p-4"><h4 className="flex items-center gap-2 font-bold"><BookOpen className="size-4 text-primary" />4. Đọc một mẫu thế cờ</h4><ul className="mt-2 space-y-2 text-muted-foreground"><li><code>b</code>: 81 ký tự, đọc theo hàng; ô ở hàng r, cột c có chỉ số <code>9*r+c</code> (r, c từ 0 đến 8).</li><li><code>R/P/S/J</code>: quân của bên đi. <code>r/p/s/j</code>: quân đối thủ. <code>.</code>: ô trống; <code>#</code>: vật cản; <code>?</code>: quân bị che.</li><li><code>s</code>: 0 là Đỏ, 1 là Xanh. Chữ HOA luôn là bên đi, không phải luôn là Đỏ.</li><li><code>c</code>, <code>e</code>: số quân Búa/Bao/Kéo của bên đi và đối thủ; <code>e</code> có thể null khi sương mù.</li><li><code>t</code>: số lượt; <code>h</code>, <code>g</code>: lịch sử lá bài gần đây của hai bên. Dùng đúng dữ liệu được cấp, không tự đoán loại quân bị che.</li></ul></section>
      <section className="rounded-2xl border border-border p-4"><h4 className="flex items-center gap-2 font-bold"><Flag className="size-4 text-primary" />5. Luật và cách chấm</h4><p className="mt-2 font-medium">{rules.length ? rules.join(' + ') : 'Luật chuẩn: Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa.'}</p>{ruleBits.filter(r => rules.includes(r.label)).map(r => <p className="mt-2 text-muted-foreground" key={r.key}>{r.hint}</p>)}<p className="mt-3">{spec.metric}</p><p className="mt-3 text-muted-foreground">{time ? `Giới hạn ${time} giây cho cả lần giải đề, không phải mỗi mẫu. ` : ''}Chấm thử tách một phần dữ liệu học để kiểm tra; điểm xếp hạng được chấm trên dữ liệu ẩn riêng.</p></section>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-amber-900 dark:text-amber-200"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span><strong>Điểm cần hiểu đúng: </strong>{spec.caution}</span></p>
  </div>
}
