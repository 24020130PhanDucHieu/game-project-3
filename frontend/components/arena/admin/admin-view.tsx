'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Lock,
  Search,
  Swords,
  Unlock,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type QualifierAdminRow = {
  id: number
  name: string
  sbd: string
  elo: number
  status: 'LOCKED' | 'SUBMITTED' | 'UNSUBMITTED'
  updatedAt: string
  promoted?: boolean
}

const initialRows: QualifierAdminRow[] = [
  {
    id: 1,
    name: 'DeepRPS',
    sbd: '24020009',
    elo: 1310.75,
    status: 'LOCKED',
    updatedAt: '22/10 20:03',
    promoted: true,
  },
  {
    id: 2,
    name: 'NullPointer',
    sbd: '24020112',
    elo: 1252.5,
    status: 'SUBMITTED',
    updatedAt: '22/10 22:10',
    promoted: true,
  },
  {
    id: 3,
    name: 'BFS Squad',
    sbd: '24020302',
    elo: 1206.25,
    status: 'LOCKED',
    updatedAt: '22/10 17:58',
    promoted: true,
  },
  {
    id: 4,
    name: 'ap',
    sbd: '24020277',
    elo: 1184.0,
    status: 'LOCKED',
    updatedAt: '22/10 23:41',
    promoted: true,
  },
  {
    id: 5,
    name: 'Minimax Pro',
    sbd: '24020006',
    elo: 1140.5,
    status: 'LOCKED',
    updatedAt: '22/10 19:15',
    promoted: false,
  },
  {
    id: 6,
    name: 'AlphaBot',
    sbd: '24020001',
    elo: 1095.0,
    status: 'SUBMITTED',
    updatedAt: '22/10 21:00',
    promoted: false,
  },
  {
    id: 7,
    name: 'Segfault Squad',
    sbd: '24020003',
    elo: 1020.0,
    status: 'UNSUBMITTED',
    updatedAt: '--',
    promoted: false,
  },
  {
    id: 8,
    name: 'Greedy Hunters',
    sbd: '24020002',
    elo: 980.0,
    status: 'UNSUBMITTED',
    updatedAt: '--',
    promoted: false,
  },
]

export function AdminView() {
  const [rows, setRows] = useState<QualifierAdminRow[]>(initialRows)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOCKED' | 'SUBMITTED' | 'UNSUBMITTED'>('ALL')

  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.sbd.includes(q)
    const matchesFilter = statusFilter === 'ALL' || r.status === statusFilter
    return matchesQuery && matchesFilter
  })

  function toggleLock(id: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const nextStatus = r.status === 'LOCKED' ? 'SUBMITTED' : 'LOCKED'
        return { ...r, status: nextStatus }
      }),
    )
  }

  function handleCancel(id: number, name: string) {
    if (confirm(`Bạn có chắc chắn muốn hủy bài nộp của đội "${name}"?`)) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'UNSUBMITTED', updatedAt: '--' } : r)),
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header matching Image 4 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0f172a] sm:text-3xl">
            Quản trị vòng loại &amp; sự cố
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Theo dõi bài nộp, khóa bài, xét đội đi tiếp và xử lý sự cố trận đấu.
          </p>
        </div>

        <span className="rounded-full border border-[#dce2ff] bg-[#eff2ff] px-3.5 py-1.5 text-xs font-semibold text-[#434be6]">
          Chế độ xem trước Admin
        </span>
      </div>

      {/* 4 KPI Metric Cards matching Image 4 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Tổng số đội */}
        <div className="flex items-start justify-between rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
          <div>
            <span className="text-xs font-semibold text-[#64748b]">Tổng số đội</span>
            <div className="mt-1 font-mono text-3xl font-extrabold text-[#0f172a]">8</div>
            <span className="text-xs font-semibold text-[#16a34a]">+2 trong 24h</span>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#eff2ff] text-[#434be6]">
            <Users className="size-5" />
          </div>
        </div>

        {/* Card 2: Bot đã nộp */}
        <div className="flex items-start justify-between rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
          <div>
            <span className="text-xs font-semibold text-[#64748b]">Bot đã nộp</span>
            <div className="mt-1 font-mono text-3xl font-extrabold text-[#0f172a]">6</div>
            <span className="text-xs text-[#64748b]">1 đội chưa nộp</span>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#eefdf3] text-[#16a34a]">
            <Bot className="size-5" />
          </div>
        </div>

        {/* Card 3: Trận đang diễn ra */}
        <div className="flex items-start justify-between rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
          <div>
            <span className="text-xs font-semibold text-[#64748b]">Trận đang diễn ra</span>
            <div className="mt-1 font-mono text-3xl font-extrabold text-[#0f172a]">4</div>
            <span className="text-xs text-[#64748b]">Tứ Kết - Hiệp 3</span>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#f0f7ff] text-[#0284c7]">
            <Swords className="size-5" />
          </div>
        </div>

        {/* Card 4: Sự cố chờ xử lý */}
        <div className="flex items-start justify-between rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
          <div>
            <span className="text-xs font-semibold text-[#64748b]">Sự cố chờ xử lý</span>
            <div className="mt-1 font-mono text-3xl font-extrabold text-[#0f172a]">2</div>
            <span className="text-xs font-semibold text-[#dc2626]">Cần xem xét ngay</span>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#fef2f2] text-[#dc2626]">
            <AlertTriangle className="size-5" />
          </div>
        </div>
      </div>

      {/* Section "Quản lý vòng loại" matching Image 4 */}
      <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-[#0f172a]">Quản lý vòng loại</h2>
            <p className="mt-0.5 text-xs text-[#64748b]">Sắp xếp theo ELO giảm dần.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-[#94a3b8]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên đội hoặc SBD"
                className="h-9.5 w-60 rounded-xl border border-[#cbd5e1] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#434be6] focus:ring-2 focus:ring-[#434be6]/15"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9.5 rounded-xl border border-[#cbd5e1] bg-white px-3 text-xs font-medium text-[#1e293b] outline-none focus:border-[#434be6]"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="LOCKED">Đã khóa</option>
              <option value="SUBMITTED">Đã nộp</option>
              <option value="UNSUBMITTED">Chưa nộp</option>
            </select>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#64748b]">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Đội</th>
                <th className="py-3 px-4 text-right w-28">ELO</th>
                <th className="py-3 px-4 w-36">Trạng thái</th>
                <th className="py-3 px-4 w-36">Cập nhật</th>
                <th className="py-3 px-4 text-right w-48">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {filteredRows.map((r) => {
                const isLocked = r.status === 'LOCKED'
                const isSubmitted = r.status === 'SUBMITTED'
                return (
                  <tr key={r.id} className="transition hover:bg-[#f8fafd]">
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-[#64748b]">
                      {r.id}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <strong className="font-bold text-[#0f172a]">{r.name}</strong>
                        {r.promoted && (
                          <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 text-[10.5px] font-bold text-[#2563eb]">
                            Đi tiếp
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-[#64748b] mt-0.5">
                        SBD {r.sbd}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#0f172a]">
                      {r.elo.toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#475569]">
                          <span className="size-1.5 rounded-full bg-[#475569]" />
                          Đã khóa
                        </span>
                      ) : isSubmitted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eefdf3] px-2.5 py-1 text-xs font-semibold text-[#16a34a]">
                          <span className="size-1.5 rounded-full bg-[#16a34a]" />
                          Đã nộp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef2f2] px-2.5 py-1 text-xs font-semibold text-[#dc2626]">
                          <span className="size-1.5 rounded-full bg-[#dc2626]" />
                          Chưa nộp
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-[#64748b]">
                      {r.updatedAt}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleLock(r.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-2.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fafc] hover:border-[#94a3b8]"
                        >
                          {isLocked ? (
                            <>
                              <Unlock className="size-3 text-[#475569]" />
                              Mở khóa
                            </>
                          ) : (
                            <>
                              <Lock className="size-3 text-[#475569]" />
                              Khóa
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancel(r.id, r.name)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#cbd5e1] bg-white px-2.5 text-xs font-semibold text-[#334155] transition hover:bg-[#fef2f2] hover:text-[#dc2626] hover:border-red-200"
                        >
                          ↗ Hủy
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
