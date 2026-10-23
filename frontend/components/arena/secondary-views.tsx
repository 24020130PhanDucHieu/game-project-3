'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Edit,
  ExternalLink,
  Layers,
  Medal,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Swords,
  Trophy,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { qualifierTeams } from '@/lib/arena-data'
import { arenaApi } from '@/lib/api-client'
import { Btn, Card, CodeBlock, Notice, Pill, SectionHeader, TableShell, WeaponIcon, tdClass, thClass } from './primitives'

const defaultRanked = [...qualifierTeams].sort((a, b) => b.elo - a.elo)

/* ========================================================================= */
/* 1. RANKING VIEW (BẢNG XẾP HẠNG TOÀN DIỆN)                                 */
/* ========================================================================= */
export function RankingView() {
  const [ranking, setRanking] = useState(defaultRanked)

  useEffect(() => {
    arenaApi.getRanking().then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setRanking(
          data.map((r, i) => ({
            id: r.id || `r-${i}`,
            name: r.team_name || r.name,
            sbd: r.student_id || r.sbd || '24020000',
            elo: typeof r.elo === 'number' ? r.elo : (r.score || 1200),
            won: r.won || 0,
            played: r.played || 0,
            advanced: i < 8,
            lang: r.language || 'py',
            status: 'submitted' as const,
            updatedAt: r.updated_at || '',
          })),
        )
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Bảng Xếp Hạng Đấu Trường"
        description="Thứ hạng các đội và bot tham gia giải đấu tính theo hệ số ELO chuẩn (K=32)."
        actions={
          <Pill tone="primary" dot>
            Cập nhật tự động sau mỗi lượt đấu
          </Pill>
        }
      />

      <Card className="p-4 sm:p-5">
        <TableShell minWidth="36rem">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className={`${thClass} w-16 text-center`}>Hạng</th>
              <th className={thClass}>Đội / Bot</th>
              <th className={thClass}>MSSV / SBD</th>
              <th className={thClass}>Thắng / Đã đấu</th>
              <th className={`${thClass} text-right`}>Điểm ELO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ranking.map((t, i) => (
              <tr
                key={t.id}
                className={cn('transition hover:bg-secondary/20', t.name === 'ap' && 'bg-accent/40')}
              >
                <td className={`${tdClass} text-center`}>
                  <span
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-lg font-mono text-xs font-bold',
                      i === 0
                        ? 'bg-warning text-foreground'
                        : i === 1
                          ? 'bg-secondary text-foreground'
                          : i === 2
                            ? 'bg-team-red/20 text-team-red'
                            : 'text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className={tdClass}>
                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-semibold text-foreground">{t.name}</strong>
                    {t.name === 'ap' && (
                      <Pill tone="primary" className="text-[10px]">
                        Đội của bạn
                      </Pill>
                    )}
                    {i < 8 && <Pill tone="neutral" className="text-[10px]">Top 8 Tứ Kết</Pill>}
                  </div>
                </td>
                <td className={tdClass}>
                  <span className="font-mono text-xs text-muted-foreground">{t.sbd}</span>
                </td>
                <td className={tdClass}>
                  <span className="font-mono text-xs font-medium text-foreground">
                    {t.won ?? 4} / {t.played ?? 5}
                  </span>
                </td>
                <td className={`${tdClass} text-right`}>
                  <span className="font-mono text-xs font-bold text-primary">{t.elo.toFixed(2)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Card>
    </div>
  )
}

/* ========================================================================= */
/* 2. BRACKET VIEW (BẢNG ĐẤU VỚI CÁC NÚT ĐIỀU HÀNH ADMIN)                    */
/* ========================================================================= */
const pairs = [
  { id: 'm1', a: 'DeepRPS', aScore: 3, b: 'Greedy Bros', bScore: 1, status: 'finished' },
  { id: 'm2', a: 'NullPointer', aScore: 1, b: 'ap (Đội của bạn)', bScore: 1, status: 'live' },
  { id: 'm3', a: 'BFS Squad', aScore: 2, b: 'Minimax K69', bScore: 0, status: 'live' },
  { id: 'm4', a: 'Kéo Búa Bao', aScore: 0, b: 'Segfault69', bScore: 0, status: 'waiting' },
] as const

export function BracketView({
  isAdmin = true,
  onOpenCreateTourn,
  onOpenStageSchedule,
  onOpenStageRules,
  onOpenBracketSwap,
  onOpenTournList,
  onOpenTeamManager,
  onSelectMatch,
}: {
  isAdmin?: boolean
  onOpenCreateTourn?: () => void
  onOpenStageSchedule?: () => void
  onOpenStageRules?: () => void
  onOpenBracketSwap?: () => void
  onOpenTournList?: () => void
  onOpenTeamManager?: () => void
  onSelectMatch?: (matchId: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header và Toolbar điều hành */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Bảng Đấu Nhánh</h1>
          <p className="text-xs text-muted-foreground">
            Giải: <strong className="text-foreground">Giải Đấu BOT K69 Mùa 2</strong> · Thể thức: Tứ Kết → Chung Kết (Bo5)
          </p>
        </div>

        {/* Thanh nút Admin & Tiện ích */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <Btn variant="primary" size="sm" onClick={onOpenCreateTourn}>
                <Plus className="size-3.5" />
                Tạo giải đấu
              </Btn>
              <Btn variant="outline" size="sm" onClick={onOpenStageSchedule}>
                <Clock className="size-3.5" />
                Đặt thời gian
              </Btn>
              <Btn variant="outline" size="sm" onClick={onOpenStageRules}>
                <Settings className="size-3.5" />
                Thiết lập luật
              </Btn>
              <Btn variant="outline" size="sm" onClick={onOpenBracketSwap}>
                <Shuffle className="size-3.5" />
                Đổi cặp &amp; Nhánh
              </Btn>
              <Btn variant="outline" size="sm" onClick={onOpenTeamManager}>
                <Users className="size-3.5" />
                Quản lý đội
              </Btn>
            </>
          )}
          <Btn variant="outline" size="sm" onClick={onOpenTournList}>
            <Trophy className="size-3.5 text-warning" />
            Các giải đấu
          </Btn>
        </div>
      </div>

      {/* Sơ đồ nhánh thi đấu */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tứ Kết */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tứ Kết (4 Trận)</p>
            <Pill tone="success" dot className="text-[10px]">Đang diễn ra</Pill>
          </div>

          {pairs.map((p) => (
            <Card
              key={p.id}
              onClick={() => onSelectMatch?.(p.id)}
              className={cn(
                'cursor-pointer divide-y divide-border transition hover:border-primary/50 hover:shadow-md',
                p.status === 'live' && 'ring-2 ring-primary/20',
              )}
            >
              <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className={cn('font-semibold', p.a.includes('ap') ? 'text-primary' : 'text-foreground')}>
                  {p.a}
                </span>
                <span className="font-mono font-bold text-foreground">{p.aScore}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className={cn('font-semibold', p.b.includes('ap') ? 'text-primary' : 'text-foreground')}>
                  {p.b}
                </span>
                <span className="font-mono font-bold text-foreground">{p.bScore}</span>
              </div>
              <div className="flex items-center justify-between bg-secondary/30 px-4 py-1.5 text-[10px] text-muted-foreground">
                <span>{p.status === 'live' ? 'Đang đấu Hiệp 3' : p.status === 'finished' ? 'Đã hoàn tất' : 'Chờ bắt đầu'}</span>
                <span className="font-medium text-primary hover:underline">Vào xem trận &rarr;</span>
              </div>
            </Card>
          ))}
        </div>

        {/* Bán Kết */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bán Kết (2 Trận)</p>
          {[1, 2].map((i) => (
            <Card key={i} className="flex h-32 flex-col items-center justify-center border-dashed p-4 text-center">
              <Clock className="size-5 text-muted-foreground/60 mb-1" />
              <p className="text-xs font-medium text-foreground">Chờ kết quả Tứ Kết</p>
              <span className="mt-1 font-mono text-[11px] text-muted-foreground">Dự kiến: 24/10/2026</span>
            </Card>
          ))}
        </div>

        {/* Chung Kết */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chung Kết (1 Trận)</p>
          <Card className="flex h-64 flex-col items-center justify-center border-dashed p-4 text-center">
            <Trophy className="size-8 text-warning/70 mb-2" />
            <strong className="text-sm font-bold text-foreground">Trận Chung Kết Cúp K69</strong>
            <p className="mt-1 text-xs text-muted-foreground">Đội đầu tiên thắng 3 hiệp sẽ trở thành Nhà Vô Địch</p>
            <Pill tone="warning" className="mt-3 text-[10px]">Khởi tranh 26/10/2026</Pill>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* 3. OVERVIEW VIEW (TỔNG QUAN VỚI CARD TRẬN ĐẤU NỔI BẬT & LEADERBOARD TOP 5)*/
/* ========================================================================= */
export function OverviewView({
  onEnterMatch,
  onViewBracket,
  onViewFullRanking,
}: {
  onEnterMatch?: () => void
  onViewBracket?: () => void
  onViewFullRanking?: () => void
}) {
  const stats = [
    { label: 'Số đội tham gia', value: '8 Đội', icon: Users, tone: 'text-primary' },
    { label: 'Trận đã đấu', value: '14 / 21', icon: Swords, tone: 'text-team-blue' },
    { label: 'Thể thức nhánh', value: 'Bo5 Nhánh Đơn', icon: Layers, tone: 'text-success' },
    { label: 'Trạng thái giải', value: 'Đang diễn ra', icon: CheckCircle2, tone: 'text-success' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Tổng Quan Đấu Trường"
        description="Theo dõi tình hình giải đấu, tiến độ các bảng và các trận đấu tâm điểm đang diễn ra."
        actions={
          <Pill tone="success" dot>
            Giải Đang Diễn Ra
          </Pill>
        }
      />

      {/* 4 Thẻ chỉ số giải đấu */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <s.icon className={cn('size-4', s.tone)} />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Grid dưới: Trận đấu nổi bật & Bảng xếp hạng Top 5 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card Trận Đấu Nổi Bật */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Swords className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Trận Đấu Nổi Bật</h3>
              </div>
              <Pill tone="success" dot className="text-[11px]">
                Đang trực tiếp
              </Pill>
            </div>

            <div className="my-5 flex items-center justify-around">
              <div className="text-center">
                <div className="size-12 mx-auto rounded-full bg-team-red flex items-center justify-center text-white font-bold text-base shadow">
                  ĐỎ
                </div>
                <strong className="mt-2 block text-xs font-semibold text-team-red">Đội Cú Đêm</strong>
                <span className="font-mono text-[10px] text-muted-foreground">MSSV: 24020277</span>
              </div>

              <div className="text-center">
                <span className="font-mono text-3xl font-black text-foreground">1 - 1</span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">Tứ Kết · Hiệp 3</span>
              </div>

              <div className="text-center">
                <div className="size-12 mx-auto rounded-full bg-team-blue flex items-center justify-center text-white font-bold text-base shadow">
                  XANH
                </div>
                <strong className="mt-2 block text-xs font-semibold text-team-blue">Đội Rồng Lửa</strong>
                <span className="font-mono text-[10px] text-muted-foreground">MSSV: 24020112</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            <Btn variant="primary" size="sm" onClick={onEnterMatch} className="flex-1">
              <Swords className="size-3.5" />
              Xem bàn đấu 9×9
            </Btn>
            <Btn variant="outline" size="sm" onClick={onViewBracket} className="flex-1">
              Xem sơ đồ nhánh
            </Btn>
          </div>
        </Card>

        {/* Card Bảng Xếp Hạng Top 5 */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-warning" />
                <h3 className="text-sm font-semibold text-foreground">Bảng Xếp Hạng Top 5</h3>
              </div>
              <button
                type="button"
                onClick={onViewFullRanking}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                Xem tất cả &rarr;
              </button>
            </div>

            <ol className="my-2 divide-y divide-border">
              {defaultRanked.slice(0, 5).map((t, idx) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-muted-foreground w-4">{idx + 1}.</span>
                    <strong className="text-foreground">{t.name}</strong>
                    {t.name === 'ap' && <Pill tone="primary" className="text-[10px]">Bạn</Pill>}
                  </div>
                  <span className="font-mono font-bold text-primary">{t.elo.toFixed(2)} ELO</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-[11px] text-muted-foreground pt-3 border-t border-border">
            Điểm ELO cập nhật sau mỗi hiệp đấu chính thức hoàn tất.
          </p>
        </Card>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* 4. PROFILE VIEW (HỒ SƠ ĐỘI THI ĐẤU ĐẦY ĐỦ THÀNH VIÊN VÀ STATS)            */
/* ========================================================================= */
export function ProfileView({
  onEditProfile,
  onGoToBracket,
}: {
  onEditProfile?: () => void
  onGoToBracket?: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Hồ Sơ Đội Thi Đấu"
        description="Thông tin thành viên, chỉ số chiến thuật và lịch sử tranh tài của đội."
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="primary" size="sm" onClick={onEditProfile}>
              <Edit className="size-3.5" />
              Chỉnh sửa hồ sơ
            </Btn>
          </div>
        }
      />

      {/* Hero Identity Card */}
      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 font-mono text-2xl font-black text-primary-foreground shadow-md">
          AP
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">ap (Cú Đêm K69)</h2>
            <Pill tone="primary">ĐỘI TUYỂN CHÍNH THỨC</Pill>
            <Pill tone="neutral" className="uppercase font-mono text-[10px]">Python 3.10</Pill>
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Đội trưởng: <strong className="text-foreground">Nguyễn Minh Anh</strong> (24020277)</span>
            <span>Đơn vị: <strong className="text-foreground">ĐH Công Nghệ – ĐHQGHN</strong></span>
          </div>
          <p className="mt-2 text-xs italic text-muted-foreground">
            "Thức khuya, nghĩ sâu, tối ưu từng nước đi thuật toán."
          </p>
        </div>

        <div className="flex items-center gap-6 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 text-center">
          <div>
            <p className="font-mono text-2xl font-bold text-success">14</p>
            <p className="text-[11px] text-muted-foreground">Trận Thắng</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-team-red">5</p>
            <p className="text-[11px] text-muted-foreground">Trận Thua</p>
          </div>
        </div>
      </Card>

      {/* 4 Thẻ Thống Kê */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-primary">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Điểm ELO</span>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">1,284.00</p>
          <span className="text-[10px] text-muted-foreground">Hạng #1 toàn hệ thống</span>
        </Card>
        <Card className="p-4 border-l-4 border-l-success">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tỷ Lệ Thắng</span>
          <p className="mt-1 font-mono text-2xl font-bold text-success">73.6%</p>
          <span className="text-[10px] text-muted-foreground">14 thắng / 19 trận</span>
        </Card>
        <Card className="p-4 border-l-4 border-l-team-blue">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Trận Bo5 Hoàn Tất</span>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">5</p>
          <span className="text-[10px] text-muted-foreground">Trong các giải tham gia</span>
        </Card>
        <Card className="p-4 border-l-4 border-l-warning">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tổng Hiệp Thắng</span>
          <p className="mt-1 font-mono text-2xl font-bold text-warning">28</p>
          <span className="text-[10px] text-muted-foreground">Trên tổng 41 hiệp đấu</span>
        </Card>
      </div>

      {/* Cột 1: Thành viên + Thành tích | Cột 2: Lịch sử thi đấu */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Users className="size-4 text-primary" />
              Thành Viên Trong Đội
            </h3>
            <ul className="divide-y divide-border text-xs">
              <li className="py-2 flex items-center justify-between">
                <div>
                  <strong className="text-foreground">Nguyễn Minh Anh</strong>
                  <Pill tone="primary" className="ml-2 text-[10px]">Đội trưởng</Pill>
                </div>
                <span className="font-mono text-muted-foreground">MSSV: 24020277</span>
              </li>
              <li className="py-2 flex items-center justify-between">
                <span className="text-foreground">Trần Đức Huy</span>
                <span className="font-mono text-muted-foreground">MSSV: 24020281</span>
              </li>
              <li className="py-2 flex items-center justify-between">
                <span className="text-foreground">Lê Thu Hà</span>
                <span className="font-mono text-muted-foreground">MSSV: 24020295</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
              <Medal className="size-4 text-warning" />
              Thành Tích &amp; Danh Hiệu
            </h3>
            <p className="text-xs text-muted-foreground">
              Đang tranh tài tại Tứ Kết giải Tân Sinh Viên K69 Mùa 2. Thành tích chính thức sẽ cập nhật sau trận Chung Kết!
            </p>
          </Card>
        </div>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Swords className="size-4 text-primary" />
              Lịch Sử Các Trận Đấu
            </h3>
            <Btn variant="outline" size="sm" onClick={onGoToBracket}>
              Đến bảng đấu
            </Btn>
          </div>

          <div className="flex flex-col gap-2">
            {[
              { vs: 'Greedy Bros', res: 'THẮNG', score: '3 - 1', round: 'Vòng 1/8' },
              { vs: 'DeepRPS', res: 'THẮNG', score: '3 - 2', round: 'Vòng Bảng' },
              { vs: 'Segfault69', res: 'THUA', score: '1 - 3', round: 'Tập huấn' },
            ].map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-2.5 text-xs">
                <div>
                  <span className="text-muted-foreground">Đối đầu: </span>
                  <strong className="text-foreground">{m.vs}</strong>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">({m.round})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{m.score}</span>
                  <Pill tone={m.res === 'THẮNG' ? 'success' : 'red'} className="text-[10px]">
                    {m.res}
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ========================================================================= */
/* 5. GUIDE VIEW (HƯỚNG DẪN THI ĐẤU TOÀN DIỆN VÀ CODE MẪU)                  */
/* ========================================================================= */
export function GuideView() {
  const sections = [
    {
      title: '1. Thể thức thi đấu & Mục tiêu chiến thắng',
      body: [
        'Trận đấu diễn ra trên bàn cờ lưới 9×9 (81 ô) giữa hai đội Đỏ và Xanh.',
        'Mỗi đội sở hữu 9 quân cờ gồm 3 Búa, 3 Bao, 3 Kéo. Đỏ xuất phát ở hàng 7, Xanh ở hàng 1.',
        'Căn cứ Đội Xanh tại [8, 0] (mục tiêu của Đỏ); Căn cứ Đỏ tại [0, 8] (mục tiêu của Xanh).',
        'Điều kiện thắng hiệp: Đưa một quân bất kỳ đột kích vào căn cứ đối phương trước, HOẶC tiêu diệt toàn bộ 9 quân địch.',
      ],
    },
    {
      title: '2. Quy tắc di chuyển & Khắc chế',
      body: [
        'Hai đội luân phiên ra quyết định từng nước đi (đi trước hoán đổi qua từng hiệp).',
        'Quy tắc khắc chế: Búa thắng Kéo · Kéo thắng Bao · Bao thắng Búa.',
        'Va chạm cùng loại: Khi hai quân cùng loại chạm nhau, quân PHÒNG THỦ (đang đứng yên tại ô) luôn chiến thắng.',
        'Biến thể luật: Luật Đảo tương khắc hoặc Ô đặc biệt (Portal/Trap/Evolve) theo cấu hình Ban tổ chức.',
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Hướng Dẫn Thi Đấu &amp; Lập Trình Bot"
        description="Luật thi đấu Ô Ăn Tù Tì V2 trên bàn cờ 9×9 và tài liệu mẫu code Python 3, C++ 17."
      />

      {/* Grid 2 thẻ quy tắc */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title} className="p-4 sm:p-5">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">{s.title}</h3>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground list-inside list-disc">
              {s.body.map((b, i) => (
                <li key={i} className="leading-relaxed">{b}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* Tóm tắt tương khắc */}
      <Card className="flex flex-wrap items-center justify-around gap-4 p-4 text-xs font-semibold">
        <div className="flex items-center gap-2 text-foreground">
          <span className="flex size-7 items-center justify-center rounded-full bg-team-blue text-white">
            <WeaponIcon weapon="rock" className="size-3.5" />
          </span>
          <span>Búa (ROCK) thắng Kéo (SCISSORS)</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <span className="flex size-7 items-center justify-center rounded-full bg-team-blue text-white">
            <WeaponIcon weapon="scissors" className="size-3.5" />
          </span>
          <span>Kéo (SCISSORS) thắng Bao (PAPER)</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <span className="flex size-7 items-center justify-center rounded-full bg-team-blue text-white">
            <WeaponIcon weapon="paper" className="size-3.5" />
          </span>
          <span>Bao (PAPER) thắng Búa (ROCK)</span>
        </div>
      </Card>

      {/* Code mẫu Python 3 & C++ 17 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-foreground">Cấu trúc Bot Python 3 (Hàm chuẩn)</span>
          <CodeBlock
            title="bot_template.py"
            code={`def decide_move(game_state):
    """
    game_state: my_pieces, opponent_pieces, remaining_cards, turn_number
    Trả về dict: {"piece_id": "...", "target": [row, col]}
    hoặc chuỗi loại quân: "ROCK" / "PAPER" / "SCISSORS"
    """
    my_pieces = game_state.get("my_pieces", [])
    if my_pieces:
        p = my_pieces[0]
        return {"piece_id": p["id"], "target": [p["row"] - 1, p["col"]]}
    return "ROCK"`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-foreground">Cấu trúc Bot C++ 17 (STDIN / STDOUT)</span>
          <CodeBlock
            title="bot_template.cpp"
            code={`#include <iostream>
#include <string>

int main() {
    // Đọc trạng thái từ STDIN
    std::string gameState;
    while (std::getline(std::cin, gameState)) {
        // Thuật toán ra quyết định: in ra nước đi
        // Định dạng: MOVE <from_row> <from_col> <to_row> <to_col>
        std::cout << "MOVE 1 4 2 4" << std::endl;
    }
    return 0;
}`}
          />
        </div>
      </div>
    </div>
  )
}
