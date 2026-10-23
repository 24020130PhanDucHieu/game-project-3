'use client'

import { useState } from 'react'
import { Activity, Bot, ShieldCheck, Swords } from 'lucide-react'
import { Card, Pill, SegmentedTabs } from '../primitives'

export type LogCategory = 'moves' | 'bots' | 'system'

export function MatchLogs({
  roundLabel = 'Hiệp 1 / 5',
}: {
  roundLabel?: string
}) {
  const [tab, setTab] = useState<LogCategory>('moves')

  const moveLogs = [
    { id: 1, step: 1, team: 'blue', text: 'Đội Xanh điều quân Kéo từ [1, 4] tới [2, 4].' },
    { id: 2, step: 2, team: 'red', text: 'Đội Đỏ điều quân Búa từ [7, 4] tới [6, 4].' },
    { id: 3, step: 3, team: 'blue', text: 'Đội Xanh tiếp tục tiến quân Kéo tới [3, 4].' },
    { id: 4, step: 4, team: 'red', text: 'Đội Đỏ tấn công: Búa hạ Kéo! Đội Xanh mất 1 quân.' },
  ]

  const botLogs = [
    { id: 1, time: '14:02:18', team: 'blue', runtime: '42ms', text: 'decide_move executed successfully. Output: {"target": [2,4]}' },
    { id: 2, time: '14:02:19', team: 'red', runtime: '18ms', text: 'decide_move executed successfully. Output: {"target": [6,4]}' },
    { id: 3, time: '14:02:20', team: 'blue', runtime: '55ms', text: 'decide_move executed successfully. Memory: 12MB. STDOUT: "Scanning opponent pieces..."' },
  ]

  const systemLogs = [
    { id: 1, time: '14:02:00', text: 'Phân phối trận đấu cho Worker Node #01 (AWS c6i.xlarge Singapore).' },
    { id: 2, time: '14:02:05', text: 'Khởi tạo Docker Sandbox biệt lập cho Đội Đỏ và Đội Xanh thành công.' },
    { id: 3, time: '14:02:15', text: 'Trọng tài tự động (Engine Referee) kích hoạt Hiệp 1. Bắt đầu đếm thời gian.' },
  ]

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Diễn Biến Trận Đấu (Match Execution Logs)</h3>
          <p className="text-xs text-muted-foreground">Nhật ký nước đi, thực thi sandbox bot và thông tin hệ thống máy chấm.</p>
        </div>
        <Pill tone="primary" className="font-mono text-[11px]">
          {roundLabel}
        </Pill>
      </div>

      <SegmentedTabs
        label="Phân loại nhật ký"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'moves', label: 'Nước đi', icon: <Swords className="size-3.5" /> },
          { value: 'bots', label: 'Thực thi bot', icon: <Bot className="size-3.5" /> },
          { value: 'system', label: 'Hệ thống', icon: <ShieldCheck className="size-3.5" /> },
        ]}
      />

      <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3 font-mono text-xs">
        {tab === 'moves' && (
          <div className="flex flex-col gap-2">
            {moveLogs.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                <span className="shrink-0 text-muted-foreground">#{m.step}</span>
                <span className={m.team === 'red' ? 'font-semibold text-team-red' : 'font-semibold text-team-blue'}>
                  [{m.team === 'red' ? 'Đỏ' : 'Xanh'}]
                </span>
                <span className="text-foreground">{m.text}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'bots' && (
          <div className="flex flex-col gap-2">
            {botLogs.map((b) => (
              <div key={b.id} className="flex flex-wrap items-baseline gap-2 border-b border-border/40 pb-1.5 last:border-0">
                <span className="text-muted-foreground">[{b.time}]</span>
                <span className={b.team === 'red' ? 'font-bold text-team-red' : 'font-bold text-team-blue'}>
                  {b.team === 'red' ? 'ĐỘI ĐỎ' : 'ĐỘI XANH'}
                </span>
                <span className="rounded bg-secondary px-1 py-0.5 text-[10px] text-muted-foreground">
                  {b.runtime}
                </span>
                <span className="w-full text-foreground/90 sm:w-auto">{b.text}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'system' && (
          <div className="flex flex-col gap-2">
            {systemLogs.map((s) => (
              <div key={s.id} className="flex items-start gap-2 text-muted-foreground">
                <span className="shrink-0 text-primary">[{s.time}]</span>
                <span className="text-foreground">{s.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
