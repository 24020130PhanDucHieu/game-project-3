'use client'

import { useState } from 'react'
import { BookOpenCheck, Brain, Check, Code2, Copy, Download, EyeOff, FlaskConical, Gauge, Layers, Lock, Scale, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { Badge, Button, Card, EmptyState, Skeleton } from '../../ui'
import { AI_TEMPLATES } from './templates'
import { TASK_TEMPLATES } from './task-templates'
import { cn } from '@/lib/utils'
import { Fold, JsonNote, TaskCard } from './task-card'
import { FAMILY_NAME } from './common'

export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1800) }) }}>
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done ? 'Đã chép' : 'Chép mã'}
      </Button>
      <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-muted/40 p-4 pr-28 text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}

export function TaskTab({ eventId, problem }: { eventId: string; problem: { data?: any; loading: boolean } }) {
  const p = problem.data
  if (p?.mode === 'TASKS') return <TasksTaskTab eventId={eventId} p={p} />
  if (problem.loading && !p) return <Skeleton className="h-72 w-full rounded-3xl" />
  if (!p) return <Card><EmptyState title="Chưa tải được đề bài" hint="Hãy làm mới trang hoặc thử lại sau ít phút." /></Card>
  const readingPct = Math.round(p.weights.reading * 100)
  const boardPct = Math.round(p.weights.board * 100)
  return (
    <div className="space-y-6">
      <Card icon={<BookOpenCheck />} title="Đề bài" subtitle="Viết một mô hình đọc được lối chơi của đối thủ rồi ra nước thắng">
        <div className="space-y-4 text-sm leading-relaxed">
          <p>Mô hình của bạn là một hàm Python <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">decide_move(game_state)</code> trả về <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">ROCK</code>, <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">PAPER</code> hoặc <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">SCISSORS</code>. Đây cũng chính là hợp đồng của giải thường, nên mô hình bạn huấn luyện ở vòng loại này dùng được nguyên cho giải chính.</p>
          <p>Thông tin duy nhất mô hình cần là <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">game_state[&quot;history&quot;]</code>: danh sách các lượt đã qua, mỗi phần tử có <code className="font-mono text-xs">my_move</code> (nước của bạn) và <code className="font-mono text-xs">opponent_move</code> (nước của đối thủ ở lượt đó).</p>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100">
            <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" />Mô hình không nhớ gì giữa hai lần gọi</p>
            <p className="mt-1">Mỗi lần được gọi, mã chạy trong một phạm vi mới nên biến toàn cục không giữ được giá trị. Mọi thứ phải suy ra từ <code className="font-mono text-xs">history</code> mỗi lần. Trọng số đã huấn luyện thì nhúng thẳng vào mã (tối đa 64 KB).</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card icon={<Gauge />} title="Cách chấm điểm" subtitle="Thang 0–100, đoán ngẫu nhiên sẽ được khoảng 50">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><Badge tone="info">A</Badge><span><strong>Đọc đối thủ ({readingPct}%).</strong> Mô hình đấu {p.instances} đối thủ cho mỗi nhóm, mỗi trận {p.rounds_per_match} lượt oẳn tù tì liên tiếp. Điểm = (số lượt thắng + 0,5 × số lượt hòa) / số lượt.</span></li>
            <li className="flex gap-3"><Badge tone="accent">B</Badge><span><strong>Bàn cờ 9×9 ({boardPct}%).</strong> Đấu {p.board_games} trận với ba boss (ngẫu nhiên, tấn công, thích ứng) trên hạt giống bí mật của từng lượt.</span></li>
          </ol>
          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm"><strong>Điểm lượt riêng tư</strong> = {p.weights.reading} × A (bộ ẩn) + {p.weights.board} × B. Điểm xếp hạng chính thức là trung bình các lượt.</div>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li>• Mỗi lượt dùng hạt giống bí mật mới, nên may rủi được bù trừ qua nhiều lượt.</li>
            <li>• Mỗi nước đi tối đa {p.limits.move_ms} ms; cả bộ đề tối đa {p.limits.suite_seconds} giây. Chạy chậm sẽ bị cắt và mất điểm phần còn lại.</li>
            <li>• Lỗi hoặc nước đi sai làm thua cả trận đấu đó, các trận khác vẫn được chấm.</li>
          </ul>
        </Card>

        <Card icon={<Layers />} title="Bảng công khai và bảng riêng tư" subtitle="Vì sao điểm công khai cao chưa chắc là thắng">
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <p className="font-semibold">Bảng công khai (xem ngay khi đang chấm)</p>
              <p className="mt-1 text-muted-foreground">Chấm trên {p.public_families.length} nhóm đối thủ công khai với hạt giống công khai <code className="font-mono text-xs">{p.public_seed}</code>. Bạn dựng lại được đúng các đối thủ này trên máy bằng nút “Chấm thử trên máy” ở tab Nộp mô hình.</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="flex items-center gap-2 font-semibold"><EyeOff className="size-4" />Bảng riêng tư (mở khi vòng loại kết thúc)</p>
              <p className="mt-1 text-muted-foreground">Gồm bốn nhóm công khai với <em>tham số mới mỗi lượt</em> và thêm các nhóm đối thủ chưa từng công bố (có loại thay đổi sở thích giữa chừng, có loại thích ứng theo bạn). Mô hình chỉ ghi nhớ bộ công khai sẽ tụt hạng ở đây.</p>
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-xs"><Scale className="mt-0.5 size-4 shrink-0 text-primary" />Cột “Chênh lệch” trên bảng cuối cho biết mô hình của bạn tốt trên bộ công khai hơn bộ ẩn bao nhiêu điểm. Chênh lệch lớn nghĩa là mô hình quá khớp, tức là “học vẹt” bộ công khai.</p>
          </div>
        </Card>
      </div>

      <Card icon={<Brain />} title="Các nhóm đối thủ công khai" subtitle="Bộ ẩn có thêm các nhóm khác; tên và tham số chỉ công bố sau khi kết thúc">
        <div className="grid gap-3 sm:grid-cols-2">
          {p.public_families.map((f: any) => (
            <div key={f.kind} className="rounded-xl border border-border p-3">
              <p className="font-semibold">{FAMILY_NAME[f.kind] || f.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card icon={<Download />} title="Dữ liệu huấn luyện" subtitle="Chuỗi nước đi của một bot ngẫu nhiên đấu từng nhóm công khai, sinh bằng máy, không chứa dữ liệu cá nhân">
        <div className="flex flex-wrap items-center gap-3">
          <a href={arenaApi.aiCupDatasetUrl(eventId)} download className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" data-testid="ai-dataset-link"><Download className="size-4" />Tải bộ dữ liệu (JSON)</a>
          <p className="text-xs text-muted-foreground">Mỗi nhóm có vài trận, mỗi trận {p.rounds_per_match} lượt. Dữ liệu dùng các đối thủ khác với đối thủ lúc chấm điểm, nên huấn luyện trên đó là huấn luyện thật chứ không phải học vẹt đáp án.</p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Định dạng: R = ROCK, P = PAPER, S = SCISSORS. <code className="font-mono">bot[t]</code> là nước của bot tham chiếu, <code className="font-mono">opponent[t]</code> là nước của đối thủ ở lượt t.</p>
      </Card>

      <Card icon={<Sparkles />} title="Mô hình mẫu" subtitle="Điểm xuất phát; bạn cũng nạp được chúng bằng nút ở tab Nộp mô hình">
        <div className="space-y-5">
          {AI_TEMPLATES.map((t) => (
            <div key={t.id}><p className="mb-2 text-sm font-semibold">{t.label}</p><CopyCode code={t.code} /></div>
          ))}
        </div>
      </Card>

      <Card title="Gợi ý hướng làm" subtitle="Từ dễ đến khó">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            ['Đếm tần suất', 'Nhanh, bắt được đối thủ thiên lệch. Thử thêm cửa sổ trượt để quên dữ liệu cũ.'],
            ['Markov bậc 1–2', 'Bắt đối thủ phụ thuộc nước trước. Nhớ lùi về ngữ cảnh ngắn khi chưa đủ dữ liệu.'],
            ['Nhiều chuyên gia + trọng số', 'Chạy nhiều dự đoán song song rồi tăng trọng số cho chuyên gia vừa đúng (bandit / hedge).'],
            ['Đọc cả chiến lược của đối thủ', 'Có đối thủ phản đòn theo nước của BẠN. Hãy mô hình hóa cả “họ nghĩ bạn sẽ ra gì”.'],
            ['Mô hình tham số nhỏ', 'Huấn luyện bên ngoài (NumPy, PyTorch), xuất vài trăm trọng số và nhúng vào mã Python thuần.'],
            ['Tổng quát hóa', 'Kiểm tra trên dữ liệu bạn tự sinh khác với bộ công khai. Đừng chỉnh để đẹp riêng bảng công khai.'],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-border p-3"><p className="font-semibold">{title}</p><p className="mt-1 text-muted-foreground">{body}</p></li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Chỉ được dùng các thư viện: {p.limits.modules.join(', ')}. Mã tối đa {Math.round(p.limits.code_bytes / 1024)} KB. Không có NumPy trong lúc chấm, nên cần suy luận bằng Python thuần.</p>
      </Card>
    </div>
  )
}


const DIFFICULTY = ['', 'Dễ', 'Vừa', 'Khó']

const STEPS = [
  { icon: BookOpenCheck, title: 'Đọc đề', body: 'Mỗi đề hỏi gì, ví dụ thật, chấm thế nào.' },
  { icon: Code2, title: 'Viết hàm solve', body: 'Hàm Python nhận dữ liệu có đáp án, trả về dự đoán.' },
  { icon: FlaskConical, title: 'Chấm thử', body: 'Ở tab “Nộp mô hình”: không tốn lượt, thấy ngay thế cờ đoán sai.' },
  { icon: Send, title: 'Nộp bài', body: 'Máy chấm trên thế cờ ẩn; điểm riêng tư là điểm xếp hạng.' },
]

function TasksTaskTab({ eventId, p }: { eventId: string; p: any }) {
  const tasks: any[] = p.tasks || []
  const [active, setActive] = useState(0)
  const [dir, setDir] = useState(1)
  const current = Math.min(active, Math.max(0, tasks.length - 1))
  const pick = (i: number) => { setDir(i >= current ? 1 : -1); setActive(i) }
  return (
    <div className="space-y-5">
      <section className="surface relative overflow-hidden rounded-3xl border border-border p-5 sm:p-6" data-testid="task-hero">
        <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Giải AI · Học từ thế cờ</p>
          <h2 className="font-display mt-1 text-2xl font-extrabold">Dạy mô hình “đọc” thế cờ 9×9</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Mỗi đề là một câu hỏi về thế cờ. Bạn có nhiều thế cờ đã có đáp án để học, rồi đoán đáp án cho thế cờ chưa từng thấy. {p.task_count} đề, mỗi đề chấm trên thang 0–100.</p>
          <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0" data-testid="task-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-3 rounded-2xl border border-border bg-background/60 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl icon-tile text-primary"><s.icon className="size-5" aria-hidden /></span>
                <span className="min-w-0"><span className="block text-sm font-bold"><span className="mr-1 text-primary">{i + 1}.</span>{s.title}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{s.body}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {!p.tasks_locked && !tasks.length ? (
        <Card><EmptyState icon={<Lock className="size-6" />} title="Ban tổ chức chưa công bố bộ đề" hint="Bộ đề được bốc ngẫu nhiên từ kho và khóa trước khi nhận bài. Trang tự cập nhật khi có đề." /></Card>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Chọn đề" data-testid="task-picker">
            {tasks.map((t, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === current} onClick={() => pick(i)}
                className={cn('group flex shrink-0 items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  i === current ? 'border-primary/60 bg-primary/10 shadow-md shadow-primary/15' : 'border-border bg-card/60 hover:-translate-y-0.5 hover:border-primary/40')}>
                <span className={cn('grid size-7 place-items-center rounded-lg text-xs font-extrabold transition-colors', i === current ? 'bg-brand text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <span className="max-w-44 min-w-0"><span className="block truncate text-sm font-semibold">{t.name}</span><span className="block text-[10px] text-muted-foreground">{['', 'Dễ', 'Vừa', 'Khó'][t.difficulty]} · {t.kind === 'reg' ? 'đoán số' : 'phân loại'}</span></span>
              </button>
            ))}
          </div>
          {tasks[current] && <div key={current} className={dir > 0 ? 'task-slide-next' : 'task-slide-prev'}><TaskCard eventId={eventId} index={current} t={tasks[current]} /></div>}
        </>
      )}

      <div className="space-y-3">
        <Fold icon={<Code2 />} title="Bạn nộp gì? (mẫu hàm solve)" hint="Một tệp Python có hàm solve(task) trả về danh sách dự đoán" testid="fold-submit">
          <pre className="overflow-x-auto rounded-xl bg-background p-3 font-mono text-[12px] leading-relaxed">{`def solve(task):
    dem = len(task["test"]["X"])      # số thế cờ cần đoán
    # task["train"]["X"], task["train"]["y"]: thế cờ + đáp án để học
    return [0] * dem                   # ví dụ: đoán 0 cho tất cả`}</pre>
          <p className="mt-2 text-xs text-muted-foreground">Đề phân loại: trả số nguyên (0, 1, 2… theo bảng nhãn của đề). Đề đoán số: trả số thực. Đúng thứ tự thế cờ cần đoán.</p>
          <div className="mt-3"><JsonNote /></div>
        </Fold>
        <Fold icon={<Layers />} title="Ý nghĩa dữ liệu của mỗi thế cờ" hint="Các trường b, s, t, c, e, h, g" testid="data-dictionary">
          <table className="w-full table-fixed text-left text-xs break-words">
            <tbody className="divide-y divide-border">
              {[
                ['b', 'Bàn cờ dạng chuỗi 81 ký tự (9 hàng × 9 ô, hàng trước). Chữ HOA = quân của bên đang đi (R Búa, P Bao, S Kéo, J Joker), chữ thường = quân đối thủ, ? = quân bị sương mù che, # = vật cản, . = ô trống.'],
                ['s', 'Bên đang đến lượt: 0 = Đỏ, 1 = Xanh.'],
                ['t', 'Số thứ tự lượt hiện tại của ván.'],
                ['c', 'Số quân Búa, Bao, Kéo còn lại của bên đang đi, ví dụ [3, 2, 3].'],
                ['e', 'Số quân Búa, Bao, Kéo của đối thủ; là null khi có sương mù (không nhìn thấy).'],
                ['h, g', 'Các lá bài gần nhất của bên đang đi (h) và của đối thủ (g), ví dụ "RPS" = Búa rồi Bao rồi Kéo.'],
              ].map(([k, v]) => <tr key={k}><td className="w-14 py-2 pr-2 align-top font-mono text-sm font-bold text-primary">{k}</td><td className="py-2 text-muted-foreground">{v}</td></tr>)}
            </tbody>
          </table>
        </Fold>
        <Fold icon={<ShieldAlert />} title="Quy tắc và thư viện được dùng" hint="Python thuần, không NumPy, có sẵn nnlite" testid="fold-rules">
          <div className="space-y-3">
            <div><p className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Được import</p><ul className="flex flex-wrap gap-1.5">{p.limits.modules.map((m: string) => <li key={m}><Badge tone={m === 'nnlite' ? 'accent' : 'success'}>{m}</Badge></li>)}</ul><p className="mt-1.5 text-xs text-muted-foreground"><code className="font-mono">nnlite</code> huấn luyện mạng nơ-ron nhỏ ngay trong <code className="font-mono">solve</code> (lan truyền xuôi/ngược, SGD, Adam).</p></div>
            <div><p className="mb-1.5 text-xs font-semibold text-red-700 dark:text-red-300">Không được</p><ul className="flex flex-wrap gap-1.5">{['NumPy / thư viện ngoài', 'từ khóa class', 'tên bắt đầu bằng _ (kể cả for _ in)', 'đọc tệp, mạng'].map((m) => <li key={m}><Badge tone="danger">{m}</Badge></li>)}</ul></div>
            <p className="text-xs text-muted-foreground">Mã tối đa {Math.round(p.limits.code_bytes / 1024)} KB; mỗi đề chạy tối đa vài giây, cả bộ đề tối đa {p.limits.suite_seconds} giây.</p>
          </div>
        </Fold>
        <Fold icon={<Sparkles />} title="Mã mẫu" hint="Nạp bằng nút ở tab Nộp mô hình hoặc chép ở đây" testid="fold-samples">
          <div className="space-y-5">{TASK_TEMPLATES.map((s) => <div key={s.id}><p className="mb-2 text-sm font-semibold">{s.label}</p><CopyCode code={s.code} /></div>)}</div>
        </Fold>
      </div>
    </div>
  )
}
