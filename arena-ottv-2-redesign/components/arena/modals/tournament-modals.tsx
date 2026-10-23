'use client'

import { useEffect, useState } from 'react'
import { Calendar, Check, Clock, Plus, Settings2, Trophy } from 'lucide-react'
import { Btn, Field, Modal, Notice, Pill, SelectField, TableShell, tdClass, thClass } from '../primitives'
import { arenaApi } from '@/lib/api-client'

export type TournamentItem = {
  id: string
  name: string
  teamsCount: number
  status: 'active' | 'upcoming' | 'completed'
  format: string
}

export const sampleTournaments: TournamentItem[] = [
  { id: 'tourn-k69-m2', name: 'Giải Đấu BOT K69 Mùa 2', teamsCount: 8, status: 'active', format: 'Tứ Kết → Chung Kết (Bo5)' },
  { id: 'tourn-k69-m1', name: 'Giải Đấu Tân Sinh Viên K69 (Mùa 1)', teamsCount: 16, status: 'completed', format: 'Vòng 1/8 → Chung Kết (Bo5)' },
  { id: 'tourn-cup-vnu', name: 'Cúp Vô Địch Công Nghệ UET 2026', teamsCount: 32, status: 'upcoming', format: 'Vòng 1/16 → Chung Kết (Bo5)' },
]

export function CreateTournamentModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate?: (tournament: { name: string; teams: number }) => void
}) {
  const [name, setName] = useState('Giải Đấu BOT K69 Mùa 3')
  const [teams, setTeams] = useState<number>(8)
  const [loading, setLoading] = useState(false)

  const formatText =
    teams === 4
      ? 'Bán Kết (2 trận) → Chung Kết (1 trận)'
      : teams === 8
        ? 'Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận)'
        : teams === 16
          ? 'Vòng 1/8 (8 trận) → Tứ Kết (4 trận) → Bán Kết → Chung Kết'
          : 'Vòng 1/16 (16 trận) → Vòng 1/8 → Tứ Kết → Bán Kết → Chung Kết'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await arenaApi.createTournament({ name, num_teams: teams, team_count: teams })
    } catch {}
    onCreate?.({ name, teams })
    onClose()
    setLoading(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo Giải Đấu Lập Trình Mới"
      description="Thiết lập quy mô bảng đấu loại trực tiếp tự động theo lũy thừa của 2."
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Tên Giải Đấu"
          placeholder="Ví dụ: Cúp Vô Địch Tân Sinh Viên K69..."
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            Số Lượng Đội Tham Gia <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[4, 8, 16, 32].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setTeams(num)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  teams === num
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                {num} Đội
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/50 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Sơ đồ nhánh dự kiến:</span>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{formatText}</p>
        </div>

        <Notice tone="neutral">
          Quy tắc: Hệ thống tự động chia cặp đấu loại trực tiếp Bo5 (Best of 5). Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải.
        </Notice>

        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="outline" type="button" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            <Plus className="size-4" />
            Khởi Tạo Giải Đấu
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

export function TournamentListModal({
  open,
  onClose,
  tournaments = sampleTournaments,
  activeId,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  tournaments?: TournamentItem[]
  activeId?: string
  onSelect?: (id: string) => void
}) {
  const [items, setItems] = useState<TournamentItem[]>(tournaments)

  useEffect(() => {
    if (open) {
      arenaApi.getTournamentList().then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          setItems(
            res.map((t) => ({
              id: t.id || t.tournament_id,
              name: t.name,
              teamsCount: t.teams ? t.teams.length : (t.team_count || 8),
              status: t.status === 'completed' ? 'completed' : t.status === 'upcoming' ? 'upcoming' : 'active',
              format: t.format || 'Vòng bảng → Chung Kết (Bo5)',
            })),
          )
        }
      }).catch(() => {})
    }
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Danh Sách Các Giải Đấu"
      description="Chọn giải đấu để tải đúng danh sách đội, sơ đồ nhánh và dữ liệu trận tương ứng."
      size="lg"
    >
      <TableShell minWidth="36rem">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            <th className={thClass}>Tên giải đấu</th>
            <th className={thClass}>Số đội</th>
            <th className={thClass}>Trạng thái</th>
            <th className={`${thClass} text-right`}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((t) => (
            <tr key={t.id} className={t.id === activeId ? 'bg-accent/40' : 'hover:bg-secondary/20'}>
              <td className={tdClass}>
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-primary" />
                  <div>
                    <strong className="text-sm font-semibold text-foreground">{t.name}</strong>
                    <p className="font-mono text-xs text-muted-foreground">{t.format}</p>
                  </div>
                </div>
              </td>
              <td className={tdClass}>
                <span className="font-mono text-xs font-semibold">{t.teamsCount} Đội</span>
              </td>
              <td className={tdClass}>
                <Pill
                  tone={t.status === 'active' ? 'success' : t.status === 'upcoming' ? 'warning' : 'neutral'}
                  dot
                >
                  {t.status === 'active' ? 'Đang diễn ra' : t.status === 'upcoming' ? 'Sắp mở' : 'Đã kết thúc'}
                </Pill>
              </td>
              <td className={`${tdClass} text-right`}>
                <Btn
                  variant={t.id === activeId ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => {
                    onSelect?.(t.id)
                    onClose()
                  }}
                >
                  {t.id === activeId ? 'Đang chọn' : 'Xem giải này'}
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </Modal>
  )
}

export function StageScheduleModal({
  open,
  onClose,
  tournamentName = 'Giải Đấu Tân Sinh Viên K69',
  onSave,
}: {
  open: boolean
  onClose: () => void
  tournamentName?: string
  onSave?: (schedule: Record<string, { open: string; close: string }>) => void
}) {
  const [stages, setStages] = useState([
    { id: 'qf', name: 'Tứ Kết', open: '2026-10-23T14:00', close: '2026-10-23T16:00' },
    { id: 'sf', name: 'Bán Kết', open: '2026-10-24T09:00', close: '2026-10-24T11:30' },
    { id: 'fn', name: 'Chung Kết', open: '2026-10-24T14:30', close: '2026-10-24T17:00' },
  ])
  const [loading, setLoading] = useState(false)

  function updateField(id: string, key: 'open' | 'close', val: string) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: val } : s)))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onSave?.(Object.fromEntries(stages.map((s) => [s.id, { open: s.open, close: s.close }])))
      onClose()
    }, 600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đặt Thời Gian Các Vòng Đấu"
      description={`Cài đặt giờ mở và đóng từng vòng cho "${tournamentName}". Khoảng trống giữa các vòng là giờ nghỉ giải lao.`}
      size="lg"
    >
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Notice tone="neutral">
          Sau giờ đóng, hệ thống không bắt đầu hiệp mới; hiệp đang chạy sẽ hoàn tất. Vòng đã thi đấu có thể bổ sung lịch; lịch đã có chỉ được phép gia hạn giờ đóng.
        </Notice>

        <div className="flex flex-col gap-3">
          {stages.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-3 sm:p-4">
              <span className="text-sm font-semibold text-foreground">{s.name}</span>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Giờ mở vòng (Bắt đầu nhận bot)"
                  type="datetime-local"
                  value={s.open}
                  onChange={(e) => updateField(s.id, 'open', e.target.value)}
                />
                <Field
                  label="Giờ đóng vòng (Khóa thi đấu)"
                  type="datetime-local"
                  value={s.close}
                  onChange={(e) => updateField(s.id, 'close', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="outline" type="button" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            <Clock className="size-4" />
            Lưu Lịch Thi Đấu
          </Btn>
        </div>
      </form>
    </Modal>
  )
}

export function StageRulesModal({
  open,
  onClose,
  tournamentName = 'Giải Đấu Tân Sinh Viên K69',
  onSave,
}: {
  open: boolean
  onClose: () => void
  tournamentName?: string
  onSave?: (rules: Record<string, string[]>) => void
}) {
  const [rules, setRules] = useState<Record<string, { reverse: boolean; specialCells: boolean; speedRush: boolean }>>({
    qf: { reverse: false, specialCells: false, speedRush: false },
    sf: { reverse: true, specialCells: false, speedRush: false },
    fn: { reverse: true, specialCells: true, speedRush: true },
  })
  const [loading, setLoading] = useState(false)

  function toggleRule(stage: string, ruleKey: 'reverse' | 'specialCells' | 'speedRush') {
    setRules((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [ruleKey]: !prev[stage][ruleKey] },
    }))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onSave?.(
        Object.fromEntries(
          Object.entries(rules).map(([k, v]) => [
            k,
            [v.reverse && 'REVERSE_RPS', v.specialCells && 'SPECIAL_CELLS', v.speedRush && 'SPEED_RUSH'].filter(
              Boolean,
            ) as string[],
          ]),
        ),
      )
      onClose()
    }, 600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thiết Lập Luật Thi Đấu Từng Vòng"
      description={`Tùy chỉnh tổ hợp luật đặc thù cho các vòng của "${tournamentName}". Không chọn: áp dụng Luật chuẩn.`}
      size="lg"
    >
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Notice tone="neutral">
          Mọi hiệp trong vòng dùng cùng tổ hợp luật; mỗi hiệp đội vẫn nộp code mới. Đổi luật trước giờ mở vòng đòi hỏi thí sinh nộp lại bot.
        </Notice>

        <div className="flex flex-col gap-3">
          {[
            { id: 'qf', name: 'Tứ Kết' },
            { id: 'sf', name: 'Bán Kết' },
            { id: 'fn', name: 'Chung Kết' },
          ].map((st) => (
            <div key={st.id} className="rounded-lg border border-border bg-card p-3.5 sm:p-4">
              <span className="text-sm font-semibold text-foreground">{st.name}</span>
              <div className="mt-2.5 flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={rules[st.id]?.reverse}
                    onChange={() => toggleRule(st.id, 'reverse')}
                  />
                  <span>Đảo tương khắc (Reverse RPS)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={rules[st.id]?.specialCells}
                    onChange={() => toggleRule(st.id, 'specialCells')}
                  />
                  <span>Ô đặc biệt (Portal / Trap / Evolve)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={rules[st.id]?.speedRush}
                    onChange={() => toggleRule(st.id, 'speedRush')}
                  />
                  <span>Giới hạn thời gian siêu tốc (500ms)</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="outline" type="button" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            <Settings2 className="size-4" />
            Lưu Thiết Lập Luật
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
