'use client'

import { useState, type ReactNode } from 'react'
import { BookOpen, Check, Copy, Cpu, FileCode2, Flag, HelpCircle, ListOrdered, MessageCircleQuestion, Scale, WifiOff } from 'lucide-react'
import { decodeRule, ruleBits, shortTime } from '@/lib/format'
import { Badge, Button, Card, DataTable, SectionTitle, Tabs } from '../ui'
import { useLive } from '../context'
import { CPP_TEMPLATE, PY_TEMPLATE } from '../workbench'
import { TeamClarifications } from '../clarifications'

type Section = 'flow' | 'rules' | 'bot' | 'qualifier' | 'offline' | 'faq' | 'ask'

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => { void navigator.clipboard?.writeText(children).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }) }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? 'Đã chép' : 'Chép'}
      </Button>
    </div>
  )
}

function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, i) => (
        <li key={item.title} className="flex gap-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{i + 1}</span>
          <div className="min-w-0"><p className="font-semibold">{item.title}</p><div className="mt-1 text-sm text-muted-foreground">{item.body}</div></div>
        </li>
      ))}
    </ol>
  )
}

export function GuideView() {
  const [section, setSection] = useState<Section>('flow')
  const { capabilities, tournament } = useLive()
  const languages = capabilities.data?.languages
  const published = Object.entries(tournament.data?.stage_rules || {}).sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Tài liệu" title="Hướng dẫn thi đấu" />
      <Tabs<Section>
        value={section} onChange={setSection}
        tabs={[
          { id: 'flow', label: 'Quy trình', icon: <ListOrdered className="size-4" /> },
          { id: 'rules', label: 'Luật chơi', icon: <Scale className="size-4" /> },
          { id: 'bot', label: 'Viết bot', icon: <FileCode2 className="size-4" /> },
          { id: 'qualifier', label: 'Vòng loại', icon: <Flag className="size-4" /> },
          { id: 'offline', label: 'Mất mạng', icon: <WifiOff className="size-4" /> },
          { id: 'faq', label: 'Câu hỏi thường gặp', icon: <HelpCircle className="size-4" /> },
          { id: 'ask', label: 'Hỏi BTC', icon: <MessageCircleQuestion className="size-4" /> },
        ]}
      />

      {section === 'flow' && (
        <Card title="Từ đăng ký đến quán quân" subtitle="Các bước thi đấu của một đội">
          <Steps items={[
            { title: 'Đăng ký tài khoản đội', body: 'Dùng mã sinh viên, tên đội và mật khẩu. Đăng nhập được ngay, kể cả khi chưa được thêm vào giải. Nếu quên mật khẩu, dùng “Quên mật khẩu” ở hộp thoại đăng nhập.' },
            { title: 'Tham gia vòng loại', body: 'Vào tab Vòng loại, đăng ký, rồi nộp bot trước hạn. Bạn có thể kiểm tra mã và đấu thử boss không giới hạn trước khi nộp.' },
            { title: 'Khóa bài và chấm', body: 'Khi hết hạn (hoặc ban tổ chức khóa sớm), hệ thống lấy bản hợp lệ cuối cùng của mỗi đội, ghép cặp nhiều lượt và tính ELO.' },
            { title: 'Vào giải chính', body: 'Top 8, 16 hoặc 32 đội được chuyển vào giải loại trực tiếp. Ban tổ chức cũng có thể ghi danh đội trực tiếp, không bắt buộc qua vòng loại.' },
            { title: 'Thi đấu Bo5', body: 'Mỗi trận tối đa 5 hiệp, đội thắng 3 hiệp trước sẽ đi tiếp. Mỗi hiệp phải nộp bot mới trong tab Trận đấu. Ban tổ chức khai hỏa khi cả hai đội đã nộp bot hợp lệ.' },
            { title: 'Xem lại và theo dõi', body: 'Dùng replay trong tab Trận đấu để xem từng bước. Bảng đấu và Xếp hạng cập nhật theo thời gian thực.' },
          ]} />
        </Card>
      )}

      {section === 'rules' && (
        <div className="space-y-6">
          <Card title="Luật cơ bản">
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>Bàn cờ 9×9. Mỗi bên có 9 quân: 3 Búa, 3 Bao, 3 Kéo. Hai bên đi luân phiên.</li>
              <li>Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Quân chỉ ăn được quân mà nó khắc; cùng loại thì hòa, không quân nào bị loại. Quân không tự đi vào ô có quân địch. Nếu cả hai bên đều hết nước đi, đội còn nhiều quân hơn (rồi đến đội có quân gần căn cứ đối thủ hơn) thắng.</li>
              <li>Thắng hiệp khi chiếm cứ điểm đối phương hoặc tiêu diệt hết quân đối phương.</li>
              <li>Bot lỗi, trả nước đi không hợp lệ hoặc quá thời gian sẽ bị xử thua hiệp đó.</li>
              <li>Bot chỉ chọn <code className="rounded bg-muted px-1">ROCK</code>, <code className="rounded bg-muted px-1">PAPER</code> hoặc <code className="rounded bg-muted px-1">SCISSORS</code>; engine tự chọn quân và di chuyển.</li>
            </ul>
          </Card>
          <Card title="Luật bổ sung theo từng vòng" subtitle="Ban tổ chức có thể bật độc lập từng luật (hoặc không bật luật nào = luật chuẩn)">
            <div className="grid gap-3 md:grid-cols-3">
              {ruleBits.map((r) => (
                <div key={r.key} className="rounded-xl border border-border p-4"><Badge tone="accent">{r.label}</Badge><p className="mt-2 text-sm text-muted-foreground">{r.hint}</p></div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Đổi luật trước khi vòng bắt đầu sẽ yêu cầu các đội nộp lại bot. Với luật Trộn quân, đừng giả định luôn có 3 quân mỗi loại — hãy đọc <code className="rounded bg-muted px-1">remaining_cards</code>.</p>
          </Card>
          <Card title={`Luật đã công bố${tournament.data?.name ? ` · ${tournament.data.name}` : ''}`}>
            {published.length ? (
              <DataTable head={['Vòng', 'Luật']}>
                {published.map(([level, rule]: [string, any]) => {
                  const decoded = decodeRule(rule.rule_id)
                  const chips = [...decoded.active, ...decoded.extra]
                  return (
                    <tr key={level}>
                      <td className="px-3 py-2.5 font-medium">{(Object.values(tournament.data?.matches || {}).find((m: any) => String(m.round_level) === level) as any)?.round_name || `Vòng ${level}`}</td>
                      <td className="px-3 py-2.5">{rule.hidden ? <Badge tone="warning">Công bố lúc {shortTime(rule.publish_at)}</Badge> : chips.length ? <span className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</span> : <Badge>Luật chuẩn</Badge>}</td>
                    </tr>
                  )
                })}
              </DataTable>
            ) : <p className="text-sm text-muted-foreground">Giải đang chọn chưa cấu hình luật riêng cho từng vòng — áp dụng luật chuẩn.</p>}
          </Card>
        </div>
      )}

      {section === 'bot' && (
        <div className="space-y-6">
          <Card title="Hợp đồng của bot" subtitle="Engine gọi bot ở mỗi lượt đi và nhận về đúng một nước chọn">
            <div className="grid gap-5 lg:grid-cols-2">
              <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Badge>Python</Badge>Hàm <code className="rounded bg-muted px-1">decide_move(game_state)</code></p><Code>{PY_TEMPLATE}</Code></div>
              <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Badge>C++</Badge>Đọc 1 dòng JSON từ stdin, in nước đi ra stdout</p><Code>{CPP_TEMPLATE}</Code></div>
            </div>
          </Card>
          <Card title="Trạng thái bot nhận được (game_state)">
            <DataTable head={['Trường', 'Ý nghĩa']}>
              {[
                ['remaining_cards', 'Số quân còn lại của bạn theo loại: ROCK / PAPER / SCISSORS'],
                ['my_pieces / opponent_pieces', 'Danh sách quân (row, col, type, alive). Khi có sương mù, quân đối thủ không có type'],
                ['turn_number, ply_number, active_side', 'Lượt hiện tại và bên đang đi'],
                ['history', 'Lịch sử nước đi của bạn (và của đối thủ nếu không có sương mù)'],
                ['target', 'Tọa độ cứ điểm cần chiếm'],
                ['reverse_rule', 'true nếu luật Đảo tương khắc đang bật'],
                ['obstacles', 'Danh sách ô chướng ngại (nếu có)'],
                ['rules', 'Cấu hình luật của hiệp: id, fog, shuffle, reverse, board_size, win_conditions'],
              ].map(([k, v]) => <tr key={k}><td className="px-3 py-2.5 font-mono text-xs">{k}</td><td className="px-3 py-2.5 text-muted-foreground">{v}</td></tr>)}
            </DataTable>
          </Card>
          <Card title="Giới hạn kỹ thuật" action={<Cpu className="size-4 text-muted-foreground" />}>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>Ngôn ngữ hỗ trợ trên máy chủ hiện tại: {languages ? languages.map((l) => <Badge key={l} className="mx-0.5">{l === 'CPP' ? 'C++' : 'Python'}</Badge>) : 'đang tải…'}</li>
              <li>Mã nguồn tối đa 64 KB. Ghi chú chiến thuật tối đa 2.000 ký tự.</li>
              <li>Bot chạy trong sandbox: giới hạn module, tệp, mạng, tiến trình và thời gian. Không thể truy cập mạng hay đọc tệp hệ thống.</li>
              <li>Dùng “Kiểm tra mã” và “Đấu thử” (boss ngẫu nhiên, tấn công, thích ứng) để thử trước. Đấu thử không tính vào kết quả.</li>
            </ul>
          </Card>
        </div>
      )}

      {section === 'qualifier' && (
        <Card title="Vòng loại hoạt động như thế nào" subtitle="Ghép cặp nhiều lượt và xếp hạng bằng ELO">
          <Steps items={[
            { title: 'Nộp bài và kiểm tra', body: 'Mỗi lần nộp được đưa vào hàng đợi và kiểm tra trong sandbox; server trả biên nhận trước rồi chấm nền. Một lần nộp lỗi không thay thế bản hợp lệ trước đó.' },
            { title: 'Khóa bài', body: 'Bản hợp lệ cuối cùng được khóa khi hết hạn hoặc khi ban tổ chức khóa sớm. Ban tổ chức có thể gia hạn cho mọi đội trước khi bắt đầu ghép cặp.' },
            { title: 'Ghép cặp nhiều lượt', body: 'Mỗi lượt các đội được ghép cặp và chấm; ELO thay đổi sau mỗi trận. Nếu số đội lẻ, một đội được nghỉ (bye) trong lượt đó.' },
            { title: 'Chọn đội vào giải chính', body: 'Top 8/16/32 theo ELO được chuyển vào một giải chính còn trống có số chỗ tương ứng.' },
          ]} />
        </Card>
      )}

      {section === 'offline' && (
        <Card title="Mất mạng, mất điện và lỗi máy chấm">
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Khi nộp bài vòng loại mà không có mạng hoặc server bận, bài được <strong className="text-foreground">lưu trên thiết bị</strong> và tự gửi lại khi có mạng (kèm mã bài để server chống nhận trùng). Bạn thấy danh sách chờ ngay trong tab Vòng loại và có thể tải bản dự phòng.</p>
            <ul className="list-inside list-disc space-y-2">
              <li><strong className="text-foreground">“Đã lưu trên máy” chưa phải “server đã nhận”.</strong> Hãy nối mạng trước hạn nộp và giữ trình duyệt mở.</li>
              <li>Dùng cùng một thiết bị và trình duyệt; không xóa dữ liệu trình duyệt. Đổi tài khoản sẽ không gửi bài của đội cũ.</li>
              <li>Kiểm tra mã và đấu thử boss luôn cần mạng.</li>
              <li>Bản nháp trong ô soạn thảo được lưu tự động, nhưng nếu mất điện đúng lúc vừa gõ thì phần chưa kịp lưu có thể mất.</li>
              <li>Nếu máy chấm lỗi, hệ thống thử lại hoặc chuyển sang máy khác; ban tổ chức có thể tạm dừng để xử lý.</li>
            </ul>
          </div>
        </Card>
      )}

      {section === 'ask' && <TeamClarifications />}

      {section === 'faq' && (
        <Card title="Câu hỏi thường gặp">
          <div className="divide-y divide-border">
            {[
              ['Tôi không nộp được bài trong trận?', 'Kiểm tra: đã “Vào phòng trận” chưa, luật vòng đã công bố chưa, cửa sổ vòng còn mở không, và hiệp có đang chạy/nghỉ không. Giao diện hiển thị lý do ngay dưới nút Nộp.'],
              ['Vì sao tôi không thấy mã của đối thủ?', 'Mã nguồn riêng chỉ đội sở hữu và ban tổ chức xem được; replay che thông tin đối thủ theo luật sương mù.'],
              ['Đấu thử có tính điểm không?', 'Không. Đấu thử với boss (trong tab Nộp bot) không ghi vào giải, bài nộp, lịch sử hay ELO.'],
              ['Bảng xếp hạng tính thế nào?', 'Xếp hạng toàn hệ thống dựa trên các trận Bo5 đã hoàn tất (hiệp lẻ không tính). Xếp hạng vòng loại dùng ELO sau mỗi lượt ghép cặp.'],
              ['Có thể nộp qua Git không?', 'Có thể lấy mã từ một repo GitHub công khai vào ô soạn thảo; một số vòng loại yêu cầu bắt buộc kèm commit. Hệ thống chưa tự nhận bài qua webhook.'],
              ['Ai sửa kết quả khi có sự cố?', 'Chỉ ban tổ chức, qua thao tác có ghi nhật ký và có thể hoàn tác.'],
            ].map(([q, a]) => (
              <details key={q} className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold"><span className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />{q}</span><span className="text-muted-foreground transition-transform group-open:rotate-45">+</span></summary><p className="mt-2 pl-6 text-sm text-muted-foreground">{a}</p></details>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
