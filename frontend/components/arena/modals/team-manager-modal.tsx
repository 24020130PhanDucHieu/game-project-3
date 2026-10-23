'use client'

import { useEffect, useState } from 'react'
import { Plus, Shuffle, Sparkles, Trash2, Users } from 'lucide-react'
import { Btn, Field, Modal, Notice, Pill, TableShell, tdClass, thClass } from '../primitives'
import { arenaApi } from '@/lib/api-client'

export type ManagedTeam = {
  id: string
  name: string
  mssv: string
  uni: string
  seed?: number
}

const defaultTeams: ManagedTeam[] = [
  { id: 'm1', name: 'K69_AlphaBot', mssv: '24020001', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 1 },
  { id: 'm2', name: 'Greedy_Hunters', mssv: '24020002', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 2 },
  { id: 'm3', name: 'Segfault_Squad', mssv: '24020003', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 3 },
  { id: 'm4', name: 'Null_Warriors', mssv: '24020004', uni: 'Khối Kỹ Thuật', seed: 4 },
  { id: 'm5', name: 'BFS_Pathfinders', mssv: '24020005', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 5 },
  { id: 'm6', name: 'Minimax_Pruners', mssv: '24020006', uni: 'ĐH Bách Khoa', seed: 6 },
  { id: 'm7', name: 'DeepRPS_AI', mssv: '24020007', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 7 },
  { id: 'm8', name: 'ap_Champion', mssv: '24020277', uni: 'ĐH Công Nghệ - ĐHQGHN', seed: 8 },
]

export function TeamManagerModal({
  open,
  onClose,
  initialTeams = defaultTeams,
  maxTeams = 8,
  tournamentId,
  onSave,
}: {
  open: boolean
  onClose: () => void
  initialTeams?: ManagedTeam[]
  maxTeams?: number
  tournamentId?: string
  onSave?: (teams: ManagedTeam[]) => void
}) {
  const [teams, setTeams] = useState<ManagedTeam[]>(initialTeams)
  const [name, setName] = useState('')
  const [mssv, setMssv] = useState('')
  const [uni, setUni] = useState('Khối Kỹ Thuật')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (open && tournamentId) {
      arenaApi
        .getTeams(tournamentId)
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setTeams(
              data.map((t: any, idx: number) => ({
                id: t.id || `t-${idx}`,
                name: t.team_name || t.name,
                mssv: t.student_id || t.mssv,
                uni: t.university || 'ĐH Công Nghệ - ĐHQGHN',
                seed: idx + 1,
              })),
            )
          }
        })
        .catch(() => {})
    }
  }, [open, tournamentId])

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !mssv.trim()) return
    if (teams.length >= maxTeams) {
      setNotice(`Giải đấu đã đạt giới hạn tối đa ${maxTeams} đội. Hãy xóa bớt trước khi thêm.`)
      return
    }
    const newTeam: ManagedTeam = {
      id: `team-${Date.now()}`,
      name: name.trim(),
      mssv: mssv.trim(),
      uni: uni.trim(),
      seed: teams.length + 1,
    }
    const next = [...teams, newTeam]
    setTeams(next)
    setName('')
    setMssv('')
    setNotice(null)
    if (tournamentId) {
      arenaApi.addTeam(tournamentId, { team_name: newTeam.name, student_id: newTeam.mssv, university: newTeam.uni }).catch(() => {})
    }
    onSave?.(next)
  }

  function handleRemove(id: string) {
    const target = teams.find((t) => t.id === id)
    const next = teams.filter((t) => t.id !== id).map((t, idx) => ({ ...t, seed: idx + 1 }))
    setTeams(next)
    if (tournamentId && target) {
      arenaApi.removeTeam(tournamentId, target.mssv).catch(() => {})
    }
    onSave?.(next)
  }

  function handleQuickFill() {
    setTeams(defaultTeams)
    setNotice('Đã nạp nhanh 8 đội mẫu thử nghiệm thành công.')
    if (tournamentId) {
      arenaApi.quickFillTeams(tournamentId).catch(() => {})
    }
    onSave?.(defaultTeams)
  }

  function handleAutoShuffle() {
    const shuffled = [...teams].sort(() => Math.random() - 0.5).map((t, idx) => ({ ...t, seed: idx + 1 }))
    setTeams(shuffled)
    setNotice('Đã bốc thăm và hoán đổi hạt giống ngẫu nhiên thành công.')
    onSave?.(shuffled)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quản Lý Tuyển Thủ & Đội Thi Đấu"
      description="Thêm, xóa thành viên và bốc thăm ngẫu nhiên hạt giống vào sơ đồ nhánh thi đấu."
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Thanh ghi danh đội mới */}
        <form onSubmit={handleAdd} className="rounded-lg border border-border bg-secondary/40 p-3.5 sm:p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ghi danh đội tuyển mới:
          </span>
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
            <input
              type="text"
              className="h-9 rounded-md border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              placeholder="Tên Đội (VD: K69_AlphaBot)"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text"
              className="h-9 rounded-md border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              placeholder="MSSV (VD: 24020001)"
              required
              value={mssv}
              onChange={(e) => setMssv(e.target.value)}
            />
            <input
              type="text"
              className="h-9 rounded-md border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              placeholder="Đơn vị đào tạo"
              value={uni}
              onChange={(e) => setUni(e.target.value)}
            />
            <Btn type="submit" variant="primary" size="sm">
              <Plus className="size-4" />
              Thêm Đội
            </Btn>
          </div>
        </form>

        {notice && <Notice tone="neutral">{notice}</Notice>}

        {/* Thanh công cụ quản lý */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Danh sách đội đã tham gia giải:</span>
            <Pill tone="primary">{teams.length} / {maxTeams} Đội</Pill>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="outline" size="sm" onClick={handleQuickFill} title="Nạp nhanh các đội mẫu để kiểm thử giải">
              <Sparkles className="size-3.5 text-primary" />
              Nạp Nhanh Đội Mẫu
            </Btn>
            <Btn
              variant="outline"
              size="sm"
              onClick={handleAutoShuffle}
              title="Tự động bốc thăm ngẫu nhiên các đội vào nhánh"
            >
              <Shuffle className="size-3.5 text-success" />
              Bốc Thăm &amp; Chia Nhánh
            </Btn>
          </div>
        </div>

        {/* Bảng danh sách đội */}
        <TableShell minWidth="34rem">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className={thClass}>Hạt giống</th>
              <th className={thClass}>Tên đội</th>
              <th className={thClass}>MSSV / SBD</th>
              <th className={thClass}>Đơn vị</th>
              <th className={`${thClass} text-center`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  Chưa có đội nào tham gia giải này. Hãy thêm đội ở form trên.
                </td>
              </tr>
            ) : (
              teams.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/20">
                  <td className={tdClass}>
                    <Pill tone="primary" className="font-mono text-[11px]">
                      #{t.seed}
                    </Pill>
                  </td>
                  <td className={tdClass}>
                    <strong className="text-xs font-semibold text-foreground">{t.name}</strong>
                  </td>
                  <td className={tdClass}>
                    <span className="font-mono text-xs text-muted-foreground">{t.mssv}</span>
                  </td>
                  <td className={tdClass}>
                    <span className="text-xs text-muted-foreground">{t.uni}</span>
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <button
                      type="button"
                      onClick={() => handleRemove(t.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Xóa đội"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </Modal>
  )
}
