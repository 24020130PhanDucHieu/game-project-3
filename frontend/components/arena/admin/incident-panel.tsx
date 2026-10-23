'use client'

import { useId, useState } from 'react'
import { AlertTriangle, ArrowUpRight, History, Scale, Undo2 } from 'lucide-react'
import type { QualifierTeam } from '@/lib/arena-data'
import { Btn, Card, Pill, SegmentedTabs } from '../primitives'

export type AuditEntry = {
  id: number
  action: string
  target: string
  reason: string
  actor: string
  time: string
}

type Action = 'score' | 'advance' | 'rollback'

const matches = ['QF-01 · DeepRPS vs Greedy Bros', 'QF-02 · NullPointer vs ap', 'QF-03 · BFS Squad vs Minimax K69', 'QF-04 · Kéo Búa Bao vs Segfault69']

const MIN_REASON = 15

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15'
const labelClass = 'text-xs font-semibold text-foreground'

export function IncidentPanel({
  teams,
  audit,
  onCommit,
}: {
  teams: QualifierTeam[]
  audit: AuditEntry[]
  onCommit: (entry: Omit<AuditEntry, 'id'>, advanceTeamId?: string) => void
}) {
  const ids = { match: useId(), blue: useId(), red: useId(), team: useId(), turn: useId(), reason: useId() }
  const [action, setAction] = useState<Action>('score')
  const [match, setMatch] = useState(matches[1])
  const [blue, setBlue] = useState('1')
  const [red, setRed] = useState('1')
  const [teamId, setTeamId] = useState(teams.find((t) => !t.advanced)?.id ?? teams[0].id)
  const [turn, setTurn] = useState('41')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  const reasonOk = reason.trim().length >= MIN_REASON
  const team = teams.find((t) => t.id === teamId)

  const summary =
    action === 'score'
      ? `Đặt tỉ số ${match.split(' · ')[0]} thành ${blue} : ${red}`
      : action === 'advance'
        ? `Đặc cách đội "${team?.name}" vào vòng tiếp theo`
        : `Khôi phục ${match.split(' · ')[0]} về trạng thái lượt ${turn}`

  function commit() {
    onCommit(
      {
        action: action === 'score' ? 'Điều chỉnh điểm' : action === 'advance' ? 'Đặc cách đi tiếp' : 'Rollback trận',
        target: action === 'advance' ? `Đội ${team?.name}` : `Trận #${match.split(' · ')[0]}`,
        reason: reason.trim(),
        actor: 'admin.k69',
        time: new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      },
      action === 'advance' ? teamId : undefined,
    )
    setReason('')
    setConfirming(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <div className="flex flex-col gap-1 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Xử lý sự cố (Incident Override &amp; Rollback)</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Mọi thao tác đều bắt buộc ghi lý do và được lưu vào nhật ký kiểm toán.
          </p>
        </div>

        <div className="flex flex-col gap-5 p-4">
          <SegmentedTabs
            label="Loại thao tác"
            value={action}
            onChange={(v) => {
              setAction(v)
              setConfirming(false)
            }}
            options={[
              { value: 'score', label: 'Điều chỉnh điểm', icon: <Scale /> },
              { value: 'advance', label: 'Đặc cách đi tiếp', icon: <ArrowUpRight /> },
              { value: 'rollback', label: 'Rollback trận', icon: <Undo2 /> },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {action !== 'advance' && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={ids.match} className={labelClass}>Trận đấu</label>
                <select id={ids.match} value={match} onChange={(e) => setMatch(e.target.value)} className={selectClass}>
                  {matches.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {action === 'score' && (
              <>
                <NumberField id={ids.blue} label="Điểm Đội Xanh" value={blue} onChange={setBlue} />
                <NumberField id={ids.red} label="Điểm Đội Đỏ" value={red} onChange={setRed} />
              </>
            )}

            {action === 'advance' && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={ids.team} className={labelClass}>Đội được đặc cách</label>
                <select id={ids.team} value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectClass}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.advanced}>
                      {t.name} · ELO {t.elo.toFixed(2)}
                      {t.advanced ? ' (đã đi tiếp)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {action === 'rollback' && (
              <NumberField id={ids.turn} label="Khôi phục về lượt" value={turn} onChange={setTurn} className="sm:col-span-2" />
            )}

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor={ids.reason} className={labelClass}>
                  Lý do <span className="text-destructive">*</span>
                </label>
                <span className={`font-mono text-[11px] ${reasonOk ? 'text-success' : 'text-muted-foreground'}`}>
                  {reason.trim().length}/{MIN_REASON}
                </span>
              </div>
              <textarea
                id={ids.reason}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setConfirming(false)
                }}
                rows={3}
                required
                placeholder="Mô tả sự cố, bằng chứng và căn cứ quyết định..."
                className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-3 focus:ring-primary/15"
              />
            </div>
          </div>

          {confirming ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Xác nhận:</span> {summary}?
              </p>
              <div className="flex gap-2">
                <Btn size="sm" variant="outline" onClick={() => setConfirming(false)}>Hủy</Btn>
                <Btn size="sm" variant="danger" onClick={commit}>Xác nhận thực hiện</Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{summary}</p>
              <Btn variant="danger" disabled={!reasonOk} onClick={() => setConfirming(true)}>
                Áp dụng thao tác
              </Btn>
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Nhật ký kiểm toán</h2>
          <Pill className="ml-auto font-mono">{audit.length}</Pill>
        </div>
        <ol className="flex max-h-[26rem] flex-col divide-y divide-border overflow-y-auto">
          {audit.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{entry.action}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{entry.time}</span>
              </div>
              <span className="text-xs font-medium text-primary">{entry.target}</span>
              <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{entry.reason}</p>
              <span className="font-mono text-[11px] text-muted-foreground/80">bởi {entry.actor}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
      />
    </div>
  )
}
