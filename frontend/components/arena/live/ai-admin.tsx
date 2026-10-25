'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Copy, Save } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { relative } from '@/lib/format'
import { Badge, Button, Card, EmptyState, ErrorNote, Field, SkeletonRows, Tabs } from './ui'
import { useLive } from './context'

const REASONS: Record<string, string> = {
  no_valid_citation: 'Không có trích dẫn hợp lệ',
  model_needs_human: 'Tài liệu không có thông tin',
  unsupported_claim: 'Câu trả lời có ý ngoài nguồn',
  max_turns: 'Tra cứu quá số vòng',
  no_tool_call: 'Không tra cứu dữ liệu',
  bad_answer_length: 'Câu trả lời sai độ dài',
  bad_submit: 'Phản hồi không hợp lệ',
}

function reasonLabel(r?: string) {
  if (!r) return 'Chuyển cho BTC'
  if (r.startsWith('number_not_in_source')) return 'Con số không có trong nguồn'
  return REASONS[r] || r
}

/** Quản trị trợ lý AI: bật/tắt, hạn mức, thống kê, và danh sách câu hỏi trợ lý không dám trả lời. */
export function AiAdminCard() {
  const { run, scope } = useLive()
  const info = useResource(`ai:settings:${scope}`, () => arenaApi.getAiSettings(), { ttl: 5_000, refreshMs: 20_000 })
  const [only, setOnly] = useState<'human' | 'all'>('human')
  const log = useResource(`ai:log:${scope}:${only}`, () => arenaApi.getAiLog(only === 'human'), { ttl: 5_000, refreshMs: 20_000 })
  const [enabled, setEnabled] = useState(true)
  const [perTeam, setPerTeam] = useState('30')
  const [tokens, setTokens] = useState('2000000')
  useEffect(() => {
    const s = info.data?.settings
    if (s) { setEnabled(s.enabled); setPerTeam(String(s.per_team)); setTokens(String(s.daily_tokens)) }
  }, [info.data?.settings])
  const d = info.data
  const items = log.data?.items || []
  const save = () => run(() => arenaApi.saveAiSettings({ enabled, per_team: Math.max(0, Number(perTeam) || 0), daily_tokens: Math.max(0, Number(tokens) || 0) }), 'Đã lưu cài đặt trợ lý AI', () => invalidate('ai:'))

  return (
    <Card icon={<Bot />} title="Trợ lý AI hỏi đáp luật" subtitle="Chỉ trả lời từ tài liệu, cấu hình giải và hỏi đáp công khai. Câu không có căn cứ được chuyển cho ban tổ chức." action={d && (d.available ? <Badge tone={d.settings.enabled ? 'success' : 'warning'} dot>{d.settings.enabled ? 'Đang bật' : 'Đang tắt'}</Badge> : <Badge tone="danger" dot>Chưa có khóa API</Badge>)}>
      {info.loading ? <SkeletonRows rows={3} /> : info.error && !d ? <ErrorNote message={info.error.message} onRetry={() => void info.reload()} /> : d && (
        <div className="space-y-5">
          {!d.available && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Máy chủ chưa có khóa API nên trợ lý chưa trả lời được. Đặt GEMINI_API_KEY (Google) hoặc ANTHROPIC_API_KEY (Claude) trong file môi trường của máy chủ rồi khởi động lại dịch vụ.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Câu hỏi hôm nay', d.asked_today],
              ['Chuyển cho BTC', d.needs_human_today],
              ['Token hôm nay', d.tokens_today.toLocaleString('vi-VN')],
              ['Mô hình', d.model],
            ].map(([k, v]) => <div key={String(k)} className="rounded-xl border border-border px-3 py-2"><p className="text-[11px] text-muted-foreground">{k}</p><p className="truncate font-semibold tabular-nums">{v}</p></div>)}
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--primary)]" />Bật trợ lý</label>
            <Field label="Lượt hỏi mỗi đội mỗi ngày" type="number" min={0} max={500} value={perTeam} onChange={(e) => setPerTeam(e.target.value)} />
            <Field label="Trần token mỗi ngày" type="number" min={0} value={tokens} onChange={(e) => setTokens(e.target.value)} hint="Vượt trần thì trợ lý ngừng trả lời tới hôm sau" />
            <Button onClick={() => void save()}><Save className="size-4" />Lưu cài đặt</Button>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Nhật ký hỏi đáp 3 ngày gần nhất</p>
              <Tabs value={only} onChange={setOnly} tabs={[{ id: 'human', label: 'Chưa trả lời được' }, { id: 'all', label: 'Tất cả' }]} />
            </div>
            {log.loading ? <SkeletonRows rows={3} /> : items.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {items.slice(0, 40).map((l) => (
                  <li key={l.id} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.question}</span>
                      {l.needs_human ? <Badge tone="warning">{reasonLabel(l.reason)}</Badge> : <Badge tone="success">Có nguồn</Badge>}
                      {l.cached && <Badge>Từ bộ nhớ đệm</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{l.team_name || l.student_id} · {relative(new Date(l.at * 1000).toISOString())}{l.tokens ? ` · ${l.tokens} token` : ''}</p>
                    {l.needs_human && <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(l.question)}><Copy className="size-3.5" />Chép câu hỏi để đăng câu trả lời công khai</Button>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title={only === 'human' ? 'Chưa có câu nào bị chuyển cho BTC' : 'Chưa có câu hỏi nào'} hint="Trả lời công khai ở mục Hỏi đáp bên dưới thì lần sau trợ lý tự biết." />}
          </div>
        </div>
      )}
    </Card>
  )
}
