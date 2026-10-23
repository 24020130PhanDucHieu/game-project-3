'use client'

import { useState } from 'react'
import { CodeXml } from 'lucide-react'
import { GithubForm } from '../github-form'
import { WebIdeForm } from '../web-ide-form'
import { Card, GithubIcon, Pill, SegmentedTabs } from '../primitives'

type Mode = 'github' | 'ide'

export function SubmissionPanel() {
  const [mode, setMode] = useState<Mode>('github')
  const [submitted, setSubmitted] = useState(false)

  return (
    <Card className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Phòng nộp code bot</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Mã nộp sẽ dùng cho lượt kế tiếp của hiệp đấu.</p>
          </div>
        </div>
        {submitted ? (
          <Pill tone="success" dot className="self-start">
            Đã nộp mã cho Round 3
          </Pill>
        ) : (
          <Pill tone="warning" dot className="self-start">
            Chưa nộp mã cho Round 3
          </Pill>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <SegmentedTabs
          label="Phương thức nộp"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'github', label: 'Nộp qua GitHub', icon: <GithubIcon /> },
            { value: 'ide', label: 'Nộp trực tiếp (Web IDE)', icon: <CodeXml /> },
          ]}
        />
        <div role="tabpanel">
          {mode === 'github' ? (
            <GithubForm onSubmitted={() => setSubmitted(true)} />
          ) : (
            <WebIdeForm onSubmitted={() => setSubmitted(true)} />
          )}
        </div>
      </div>
    </Card>
  )
}
