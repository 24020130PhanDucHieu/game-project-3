'use client'

import { Code2, Download, RefreshCw } from 'lucide-react'
import { Btn, Pill, TableShell, tdClass, thClass } from '../primitives'

export type SubmissionRow = {
  id: string
  time: string
  round: number
  status: 'VALID' | 'PENDING' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT'
  lang: string
}

const defaultSubmissions: SubmissionRow[] = [
  { id: 'sub-9481', time: '14:01:22', round: 1, status: 'VALID', lang: 'Python 3' },
  { id: 'sub-9475', time: '13:58:10', round: 1, status: 'COMPILE_ERROR', lang: 'Python 3' },
  { id: 'sub-9320', time: '12:30:45', round: 1, status: 'VALID', lang: 'C++ 17' },
]

export function SubmissionsTable({
  submissions = defaultSubmissions,
  onViewCode,
  onRefresh,
}: {
  submissions?: SubmissionRow[]
  onViewCode?: (subId: string) => void
  onRefresh?: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Lịch sử bài nộp trận này (Kaggle Submissions)
          </h4>
          <p className="text-[11px] text-muted-foreground">Các bản mã bot nộp cho từng round thi đấu</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <RefreshCw className="size-3" />
          Làm mới
        </button>
      </div>

      <TableShell minWidth="28rem">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            <th className={thClass}>Mã nộp</th>
            <th className={thClass}>Thời gian</th>
            <th className={thClass}>Hiệp</th>
            <th className={thClass}>Trạng thái Sandbox</th>
            <th className={`${thClass} text-right`}>Hành động</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {submissions.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                Chưa có bài nộp nào cho trận này.
              </td>
            </tr>
          ) : (
            submissions.map((s) => (
              <tr key={s.id} className="hover:bg-secondary/20">
                <td className={tdClass}>
                  <span className="font-mono text-xs font-semibold text-foreground">{s.id}</span>
                </td>
                <td className={tdClass}>
                  <span className="font-mono text-xs text-muted-foreground">{s.time}</span>
                </td>
                <td className={tdClass}>
                  <Pill tone="neutral" className="font-mono text-[10px]">
                    Hiệp {s.round}
                  </Pill>
                </td>
                <td className={tdClass}>
                  <Pill
                    tone={
                      s.status === 'VALID'
                        ? 'success'
                        : s.status === 'PENDING'
                          ? 'warning'
                          : 'red'
                    }
                    dot
                    className="text-[11px]"
                  >
                    {s.status === 'VALID'
                      ? 'Hợp lệ'
                      : s.status === 'PENDING'
                        ? 'Đang chấm'
                        : s.status === 'COMPILE_ERROR'
                          ? 'Lỗi biên dịch'
                          : s.status === 'RUNTIME_ERROR'
                            ? 'Lỗi thực thi'
                            : 'Quá giờ'}
                  </Pill>
                </td>
                <td className={`${tdClass} text-right`}>
                  <Btn variant="outline" size="sm" onClick={() => onViewCode?.(s.id)}>
                    <Code2 className="size-3.5" />
                    Xem mã
                  </Btn>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  )
}
