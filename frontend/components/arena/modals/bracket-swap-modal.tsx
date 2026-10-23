'use client'

import { useMemo, useState } from 'react'
import { ArrowLeftRight, Check, ShieldAlert, Shuffle, UserMinus } from 'lucide-react'
import { Btn, Field, Modal, Notice, SegmentedTabs, SelectField } from '../primitives'

export type BracketTeam = {
  id: string
  name: string
  sbd: string
  seed: number
  pairIndex: number // 0, 1, 2, 3...
}

export const sampleBracketTeams: BracketTeam[] = [
  { id: 't1', name: 'DeepRPS', sbd: '24020001', seed: 1, pairIndex: 0 },
  { id: 't2', name: 'Greedy Bros', sbd: '24020002', seed: 8, pairIndex: 0 },
  { id: 't3', name: 'NullPointer', sbd: '24020003', seed: 4, pairIndex: 1 },
  { id: 't4', name: 'ap (Đội của bạn)', sbd: '24020277', seed: 5, pairIndex: 1 },
  { id: 't5', name: 'BFS Squad', sbd: '24020005', seed: 2, pairIndex: 2 },
  { id: 't6', name: 'Minimax K69', sbd: '24020006', seed: 7, pairIndex: 2 },
  { id: 't7', name: 'Kéo Búa Bao', sbd: '24020007', seed: 3, pairIndex: 3 },
  { id: 't8', name: 'Segfault69', sbd: '24020008', seed: 6, pairIndex: 3 },
]

export function BracketSwapModal({
  open,
  onClose,
  teams = sampleBracketTeams,
  onSwap,
  onDisqualify,
}: {
  open: boolean
  onClose: () => void
  teams?: BracketTeam[]
  onSwap?: (team1Id: string, team2Id: string) => void
  onDisqualify?: (teamId: string, reason: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'swap' | 'disqualify'>('swap')
  
  // Swap State
  const [team1Id, setTeam1Id] = useState(teams[0]?.id || '')
  const [team2Id, setTeam2Id] = useState(teams[1]?.id || '')
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapAlert, setSwapAlert] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)

  // Disqualify State
  const [dqTeamId, setDqTeamId] = useState(teams[0]?.id || '')
  const [dqReason, setDqReason] = useState('Vắng mặt không nộp bot đúng hạn')
  const [dqLoading, setDqLoading] = useState(false)

  const team1 = useMemo(() => teams.find((t) => t.id === team1Id), [teams, team1Id])
  const team2 = useMemo(() => teams.find((t) => t.id === team2Id), [teams, team2Id])
  const dqTeam = useMemo(() => teams.find((t) => t.id === dqTeamId), [teams, dqTeamId])

  function handleSwap(e: React.FormEvent) {
    e.preventDefault()
    if (team1Id === team2Id) {
      setSwapAlert({ tone: 'warning', text: 'Vui lòng chọn 2 đội khác nhau để hoán đổi.' })
      return
    }
    setSwapLoading(true)
    setTimeout(() => {
      setSwapLoading(false)
      onSwap?.(team1Id, team2Id)
      setSwapAlert({ tone: 'success', text: `Đã hoán đổi vị trí giữa "${team1?.name}" và "${team2?.name}".` })
      setTimeout(() => {
        setSwapAlert(null)
        onClose()
      }, 1000)
    }, 600)
  }

  function handleDisqualify(e: React.FormEvent) {
    e.preventDefault()
    setDqLoading(true)
    setTimeout(() => {
      setDqLoading(false)
      onDisqualify?.(dqTeamId, dqReason)
      onClose()
    }, 600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quản Lý Bảng Đấu & Hoán Đổi Cặp"
      description="Dành cho Ban Tổ Chức (Admin) điều chỉnh vị trí hạt giống hoặc xử lý bỏ cuộc trước khi thi đấu."
      size="md"
    >
      <div className="flex flex-col gap-4">
        <SegmentedTabs
          label="Chế độ quản lý bảng đấu"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'swap', label: 'Hoán đổi cặp đấu', icon: <ArrowLeftRight className="size-4" /> },
            { value: 'disqualify', label: 'Xử loại đội thi', icon: <UserMinus className="size-4" /> },
          ]}
        />

        {swapAlert && (
          <Notice tone={swapAlert.tone} icon={<ShieldAlert className="size-4" />}>
            {swapAlert.text}
          </Notice>
        )}

        {/* Section 1: Hoán đổi cặp đấu */}
        {activeTab === 'swap' && (
          <form onSubmit={handleSwap} className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Chọn 2 đội trong bảng đấu Vòng 1 để tráo đổi nhánh hoặc cặp đối đầu trước khi giải bắt đầu:
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Đội thứ nhất"
                required
                value={team1Id}
                onChange={(e) => setTeam1Id(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Hạt giống #{t.seed})
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Đội thứ hai"
                required
                value={team2Id}
                onChange={(e) => setTeam2Id(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Hạt giống #{t.seed})
                  </option>
                ))}
              </SelectField>
            </div>

            {/* Preview Diff Box */}
            {team1 && team2 && team1.id !== team2.id && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3.5 text-xs">
                <strong className="block font-semibold uppercase tracking-wider text-foreground">
                  Xem Trước Thay Đổi (Preview Diff):
                </strong>
                <div className="mt-2 flex flex-col gap-1.5 font-mono">
                  <div className="text-destructive line-through">
                    - Nhánh Cặp {team1.pairIndex + 1}: {team1.name} (Seed #{team1.seed})
                  </div>
                  <div className="text-success">
                    + Nhánh Cặp {team1.pairIndex + 1}: {team2.name} (Seed #{team2.seed})
                  </div>
                  <div className="mt-1 text-destructive line-through">
                    - Nhánh Cặp {team2.pairIndex + 1}: {team2.name} (Seed #{team2.seed})
                  </div>
                  <div className="text-success">
                    + Nhánh Cặp {team2.pairIndex + 1}: {team1.name} (Seed #{team1.seed})
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
              <Btn variant="outline" type="button" onClick={onClose}>
                Hủy
              </Btn>
              <Btn variant="primary" type="submit" loading={swapLoading}>
                <Shuffle className="size-4" />
                Xác Nhận Hoán Đổi
              </Btn>
            </div>
          </form>
        )}

        {/* Section 2: Xử loại đội thi */}
        {activeTab === 'disqualify' && (
          <form onSubmit={handleDisqualify} className="flex flex-col gap-4">
            <Notice tone="warning" icon={<ShieldAlert className="size-4" />}>
              Đội bị xử loại sẽ dừng bước ngay lập tức và đối thủ trực tiếp được tính thắng mặc định (Bye/Default Win).
            </Notice>

            <SelectField
              label="Chọn đội cần xử loại"
              required
              value={dqTeamId}
              onChange={(e) => setDqTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (SBD: {t.sbd})
                </option>
              ))}
            </SelectField>

            <Field
              label="Lý do xử loại"
              placeholder="Ví dụ: Vắng mặt không tham gia thi đấu / Gian lận"
              required
              value={dqReason}
              onChange={(e) => setDqReason(e.target.value)}
            />

            <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
              <Btn variant="outline" type="button" onClick={onClose}>
                Hủy
              </Btn>
              <Btn variant="danger" type="submit" loading={dqLoading}>
                <UserMinus className="size-4" />
                Xác Nhận Xử Loại Đội
              </Btn>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
