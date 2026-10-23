'use client'

import { useState } from 'react'
import {
  CalendarClock,
  CodeXml,
  Download,
  Lock,
  PenLine,
  RefreshCw,
  Swords,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { GithubForm } from './github-form'
import { WebIdeForm } from './web-ide-form'
import { Btn, Card, GithubIcon, Notice, Pill, SectionHeader, SegmentedTabs, TableShell, tdClass, thClass } from './primitives'
import { PracticeModal } from './modals/practice-modal'

const steps: { title: string; body: string; icon: LucideIcon; action?: string }[] = [
  {
    title: 'Bước 1: Lấy mẫu Bot',
    body: 'Tải bộ khung bot Python hoặc C++ có sẵn hàm đọc trạng thái bàn cờ và in nước đi.',
    icon: Download,
    action: 'Tải bot mẫu',
  },
  {
    title: 'Bước 2: Viết chiến thuật',
    body: 'Cài đặt logic chọn nước đi theo luật Đảo tương khắc. Kiểm tra cục bộ với bộ test mẫu.',
    icon: PenLine,
  },
  {
    title: 'Bước 3: Đồng bộ & Nộp',
    body: 'Đẩy mã lên GitHub rồi đồng bộ, hoặc dán trực tiếp vào Web IDE bên dưới để nộp.',
    icon: RefreshCw,
  },
]

type Mode = 'github' | 'ide'

export function QualifierView() {
  const [mode, setMode] = useState<Mode>('github')
  const [registered, setRegistered] = useState(true)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [selectedQualifier, setSelectedQualifier] = useState('Đợt 1 - Vòng Loại Tân Sinh Viên K69')

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Vòng Loại &amp; Xếp Hạng ELO"
        description="Đăng ký tham gia, nộp bot chiến thuật và thi đấu vòng tròn tự động để tranh suất vào Tứ Kết."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="primary" className="font-mono">
              <TrendingUp className="size-3" />
              ELO 1,284.00 (#1)
            </Pill>
            <Pill tone="warning" className="font-mono">
              <CalendarClock className="size-3" />
              Hạn: 00:32:00 23/10/2026
            </Pill>
          </div>
        }
      />

      {/* Card Đăng Ký / Chọn Giải Vòng Loại */}
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Giải Vòng Loại Đang Xem:</span>
            <select
              className="h-8 rounded-md border border-input bg-card px-2.5 text-xs font-semibold outline-none focus:border-primary"
              value={selectedQualifier}
              onChange={(e) => setSelectedQualifier(e.target.value)}
            >
              <option value="Đợt 1 - Vòng Loại Tân Sinh Viên K69">Đợt 1 - Vòng Loại Tân Sinh Viên K69 (Đang mở)</option>
              <option value="Đợt 2 - Vòng Loại Mở Rộng UET">Đợt 2 - Vòng Loại Mở Rộng UET (Sắp mở)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {registered ? (
              <Pill tone="success" dot>
                Đội của bạn đã ghi danh thi đấu
              </Pill>
            ) : (
              <Btn variant="primary" size="sm" onClick={() => setRegistered(true)}>
                <UserCheck className="size-3.5" />
                Đăng ký thi vòng loại
              </Btn>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Mỗi đội gặp một đối thủ ngẫu nhiên trong từng lượt đấu. Bản bot hợp lệ cuối cùng trước hạn sẽ được tự động khóa để tính điểm ELO.
        </p>
      </Card>

      {/* 3 Bước Hướng Dẫn */}
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Card className="relative flex h-full flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <step.icon className="size-4" />
                </span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">0{i + 1}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
              {step.action && (
                <Btn variant="outline" size="sm" className="mt-auto self-start" onClick={() => alert('Đang tải bot_template.py...')}>
                  <Download className="size-3.5" />
                  {step.action}
                </Btn>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {/* Khung Nộp Bài Vòng Loại */}
      <Card className="mx-auto w-full max-w-4xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Nộp Bài Thi Đấu Vòng Loại</h3>
            <p className="text-xs text-muted-foreground">
              Bản nộp mới nhất trước hạn sẽ được dùng để ghép cặp và thi đấu tính điểm ELO.
            </p>
          </div>
          <Btn variant="outline" size="sm" onClick={() => setPracticeOpen(true)}>
            <Swords className="size-3.5 text-primary" />
            Chạy thử với Boss
          </Btn>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <SegmentedTabs
            label="Phương thức nộp vòng loại"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'github', label: 'Nộp qua GitHub (Khuyên dùng)', icon: <GithubIcon /> },
              { value: 'ide', label: 'Nộp trực tiếp (Web IDE / File)', icon: <CodeXml /> },
            ]}
          />

          <div role="tabpanel">
            {mode === 'github' ? (
              <GithubForm refLabel="Branch" refHint="Nhánh chứa mã bot cần chấm." />
            ) : (
              <WebIdeForm showNote={false} showUpload />
            )}
          </div>
        </div>
      </Card>

      {/* Lịch Sử Bài Nộp & Kết Quả Vòng Loại */}
      <Card className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Lịch Sử Nộp Bài Vòng Loại Của Đội</h3>
        <TableShell minWidth="32rem">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className={thClass}>Phiên bản</th>
              <th className={thClass}>Thời gian nộp</th>
              <th className={thClass}>Ngôn ngữ</th>
              <th className={thClass}>Trạng thái</th>
              <th className={`${thClass} text-right`}>Điểm ELO tạm tính</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="hover:bg-secondary/20">
              <td className={tdClass}><span className="font-mono text-xs font-bold">v3_adaptive</span></td>
              <td className={tdClass}><span className="font-mono text-xs text-muted-foreground">14:02:15 23/10/2026</span></td>
              <td className={tdClass}><span className="text-xs font-mono">Python 3</span></td>
              <td className={tdClass}><Pill tone="success" dot className="text-[11px]">Hợp lệ (Khóa chấm)</Pill></td>
              <td className={`${tdClass} text-right`}><span className="font-mono text-xs font-bold text-primary">1,284.00</span></td>
            </tr>
            <tr className="hover:bg-secondary/20">
              <td className={tdClass}><span className="font-mono text-xs font-bold text-muted-foreground">v2_rush</span></td>
              <td className={tdClass}><span className="font-mono text-xs text-muted-foreground">11:45:00 23/10/2026</span></td>
              <td className={tdClass}><span className="text-xs font-mono">Python 3</span></td>
              <td className={tdClass}><Pill tone="neutral" className="text-[11px]">Bản cũ</Pill></td>
              <td className={`${tdClass} text-right`}><span className="font-mono text-xs text-muted-foreground">1,220.00</span></td>
            </tr>
          </tbody>
        </TableShell>
      </Card>

      <PracticeModal open={practiceOpen} onClose={() => setPracticeOpen(false)} />
    </div>
  )
}
