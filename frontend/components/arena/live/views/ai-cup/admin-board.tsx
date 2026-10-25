'use client'

import { ListOrdered } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { Card, DataTable, EmptyState, ErrorNote, SkeletonRows } from '../../ui'
import { TECH_SHORT, fmt } from './common'

/** Bảng riêng tư dành cho ban tổ chức: xem được ngay cả khi vòng loại chưa kết thúc (không công bố cho đội). */
export function AdminAiBoard({ qid }: { qid: string }) {
  const board = useResource<any>(`q:ai:admin-board:${qid}`, () => arenaApi.getAiCupLeaderboard(qid, 'private'), { ttl: 8_000, refreshMs: 20_000 })
  const items: any[] = board.data?.items || []
  return (
    <Card icon={<ListOrdered />} title="Bảng điểm riêng tư (chỉ ban tổ chức)" subtitle={board.data?.private_visible ? 'Đã công bố cho các đội' : 'Chưa công bố cho các đội; chỉ ban tổ chức nhìn thấy'}>
      {board.loading && !board.data ? <SkeletonRows rows={5} /> : board.error && !board.data ? <ErrorNote message={board.error.message} onRetry={() => void board.reload()} /> : items.length ? (
        <DataTable head={['Hạng', 'Đội', 'Điểm riêng tư', 'Đọc đối thủ (ẩn)', 'Bàn cờ', 'Công khai', 'Chênh lệch', 'Lượt', 'Kỹ thuật']}>
          {items.map((r) => (
            <tr key={r.student_id} data-testid="ai-admin-row">
              <td className="px-3 py-2.5 tabular-nums">{r.rank}</td>
              <td className="px-3 py-2.5 font-medium">{r.team_name}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.student_id}</span></td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{fmt(r.private)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmt(r.reading)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmt(r.board)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmt(r.public)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmt(r.gap)}</td>
              <td className="px-3 py-2.5 tabular-nums">{r.rounds}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.technique ? TECH_SHORT[r.technique] || r.technique : '—'}</td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="Chưa có điểm" hint="Bảng xuất hiện sau lượt chấm đầu tiên." />}
    </Card>
  )
}
