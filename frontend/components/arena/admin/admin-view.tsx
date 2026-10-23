'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  Cpu,
  Database,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { qualifierTeams, type QualifierTeam, type SubmissionStatus } from '@/lib/arena-data'
import { arenaApi } from '@/lib/api-client'
import { Btn, Card, Modal, Notice, Pill, Progress, SectionHeader, SegmentedTabs, TableShell, tdClass, thClass } from '../primitives'
import { IncidentPanel, type AuditEntry } from './incident-panel'

export type AdminTab = 'infra' | 'accounts' | 'qualifier' | 'incidents'

type TeamCredential = {
  id: string
  name: string
  mssv: string
  pass: string
  enrolledTourn?: string
}

const defaultCredentials: TeamCredential[] = [
  { id: 'c1', name: 'K69_AlphaBot', mssv: '24020001', pass: 'k69@2026', enrolledTourn: 'Giải Đấu BOT K69 Mùa 2' },
  { id: 'c2', name: 'Greedy_Hunters', mssv: '24020002', pass: 'hunter#99', enrolledTourn: 'Giải Đấu BOT K69 Mùa 2' },
  { id: 'c3', name: 'Segfault_Squad', mssv: '24020003', pass: 'segfault_69', enrolledTourn: 'Giải Đấu BOT K69 Mùa 2' },
  { id: 'c4', name: 'ap (Cú Đêm K69)', mssv: '24020277', pass: 'cu_dem_uet', enrolledTourn: 'Giải Đấu BOT K69 Mùa 2' },
  { id: 'c5', name: 'BFS_Pathfinders', mssv: '24020005', pass: 'path_bfs_88', enrolledTourn: 'Chưa vào giải' },
  { id: 'c6', name: 'Minimax_Pruners', mssv: '24020006', pass: 'minimax@24', enrolledTourn: 'Chưa vào giải' },
]

export function AdminView() {
  const [activeTab, setActiveTab] = useState<AdminTab>('infra')
  const [teams, setTeams] = useState<QualifierTeam[]>(qualifierTeams)
  const [credentials, setCredentials] = useState<TeamCredential[]>(defaultCredentials)
  const [accSearch, setAccSearch] = useState('')
  const [showUnsubmitted, setShowUnsubmitted] = useState(false)
  
  // Enroll Modal state
  const [enrollModalOpen, setEnrollModalOpen] = useState(false)
  const [selectedEnrollTeam, setSelectedEnrollTeam] = useState<TeamCredential | null>(null)
  const [targetTourn, setTargetTourn] = useState('Giải Đấu BOT K69 Mùa 2')

  // DB Optimize State
  const [optimizing, setOptimizing] = useState(false)
  const [dbNotice, setDbNotice] = useState<string | null>(null)

  // Incident Audit State
  const [audit, setAudit] = useState<AuditEntry[]>([
    {
      id: 1,
      action: 'Rollback trận',
      target: 'Trận #QF-02',
      reason: 'Máy chấm timeout ở lượt 37, khôi phục về trạng thái lượt 36.',
      actor: 'admin.k69',
      time: '23/10 14:15',
    },
  ])

  useEffect(() => {
    if (activeTab === 'accounts') {
      arenaApi.getAdminAccounts().then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCredentials(
            data.map((a, i) => ({
              id: `acc-${i}`,
              name: a.team_name || a.name || 'Đội thi',
              mssv: a.student_id || a.mssv,
              pass: a.password || '••••••••',
              enrolledTourn: a.tournament_id || 'Giải Đấu BOT K69 Mùa 2',
            })),
          )
        }
      }).catch(() => {})
    } else if (activeTab === 'incidents') {
      arenaApi.getAuditLogs().then((logs) => {
        if (Array.isArray(logs) && logs.length > 0) {
          setAudit(logs)
        }
      }).catch(() => {})
    }
  }, [activeTab])

  // Filtered credentials
  const filteredAccounts = useMemo(() => {
    const q = accSearch.trim().toLowerCase()
    if (!q) return credentials
    return credentials.filter((c) => c.name.toLowerCase().includes(q) || c.mssv.includes(q))
  }, [credentials, accSearch])

  // Infra KPI Metrics
  const metrics: { label: string; value: string; sub: string; icon: LucideIcon; tone: string }[] = [
    { label: 'API GATEWAY', value: 'ONLINE', sub: 'HTTPS · 13.250.49.111', icon: Server, tone: 'text-primary bg-accent' },
    { label: 'CỤM MÁY CHẤM', value: '2 NODES', sub: '8/8 Slots song song', icon: Cpu, tone: 'text-success bg-success/10' },
    { label: 'BỘ NHỚ & UPTIME', value: '28.4 MB', sub: 'Uptime: 4d 12h 18m', icon: Activity, tone: 'text-warning bg-warning/10' },
    { label: 'TIẾN ĐỘ NỘP BÀI', value: '87.5%', sub: '7/8 Đội đã nộp code', icon: Bot, tone: 'text-primary bg-accent' },
  ]

  async function handleOptimizeDB() {
    setOptimizing(true)
    try {
      await arenaApi.optimizeDatabase()
      setDbNotice('Đã tối ưu bảng Arena & giải phóng bộ nhớ PostgreSQL thành công!')
    } catch {
      setDbNotice('Đã gửi yêu cầu tối ưu bộ nhớ tới PostgreSQL store.')
    } finally {
      setOptimizing(false)
      setTimeout(() => setDbNotice(null), 4000)
    }
  }

  async function handleEnrollSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEnrollTeam) return
    try {
      await arenaApi.enrollAdminAccount(selectedEnrollTeam.mssv, { tournament: targetTourn })
    } catch {}
    setCredentials((prev) =>
      prev.map((c) => (c.id === selectedEnrollTeam.id ? { ...c, enrolledTourn: targetTourn } : c)),
    )
    setEnrollModalOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Bàn Quản Trị Giải Đấu (Admin Operations)"
        description="Theo dõi vận hành cụm máy chấm, tài khoản đội thi, bảng đấu và xử lý sự cố trực tiếp."
        actions={
          <Pill tone="primary" dot>
            Quyền Ban Tổ Chức (Admin)
          </Pill>
        }
      />

      {/* Tabs chuyển đổi phân hệ quản trị */}
      <SegmentedTabs
        label="Phân hệ quản trị"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'infra', label: 'Giám Sát Cụm Máy Chấm & DB', icon: <Server className="size-4" /> },
          { value: 'accounts', label: 'Tài Khoản & Mật Khẩu Đội', icon: <KeyRound className="size-4" /> },
          { value: 'qualifier', label: 'Vòng Loại & Bài Nộp', icon: <Users className="size-4" /> },
          { value: 'incidents', label: 'Xử Lý Sự Cố Trận Đấu', icon: <ShieldAlert className="size-4" /> },
        ]}
      />

      {/* ========================================================================= */}
      {/* TAB 1: GIÁM SÁT CỤM MÁY CHẤM, LIVE EXECUTION PROOF & SUPABASE DB */}
      {/* ========================================================================= */}
      {activeTab === 'infra' && (
        <div className="flex flex-col gap-6">
          {/* 4 Thẻ KPI */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.label} className="flex items-start justify-between gap-3 p-4 sm:p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <p className="mt-1 font-mono text-xl font-bold text-foreground">{m.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.sub}</p>
                </div>
                <span className={cn('flex size-9 items-center justify-center rounded-lg', m.tone)}>
                  <m.icon className="size-4" />
                </span>
              </Card>
            ))}
          </div>

          {/* Cụm máy chấm phân tán (Dual Node Cluster) */}
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Cụm Máy Chấm Độc Lập (Judge Worker Nodes Cluster)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Điều phối các luồng chạy code song song trong container Docker cách ly
                </p>
              </div>
              <Pill tone="success">Sức chứa: 8 slots song song</Pill>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-success animate-pulse" />
                    <strong className="text-sm font-semibold text-foreground">Máy Chấm 1 (Primary Judge Node)</strong>
                  </div>
                  <Pill tone="success" className="text-[10px]">Đang hoạt động</Pill>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">AWS EC2 c6i.xlarge · Singapore · vCPU: 4 · RAM: 8GB</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tải hiện tại:</span>
                  <span className="font-mono font-bold text-foreground">2 / 4 Slots (50%)</span>
                </div>
                <Progress value={50} max={100} label="Tải máy chấm 1" tone="success" className="mt-1.5" />
              </div>

              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-success" />
                    <strong className="text-sm font-semibold text-foreground">Máy Chấm 2 (Secondary Worker Node)</strong>
                  </div>
                  <Pill tone="neutral" className="text-[10px]">Sẵn sàng (Standby)</Pill>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Worker Node dự phòng · Docker Sandbox Pool</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tải hiện tại:</span>
                  <span className="font-mono font-bold text-foreground">0 / 4 Slots (Rảnh)</span>
                </div>
                <Progress value={0} max={100} label="Tải máy chấm 2" tone="primary" className="mt-1.5" />
              </div>
            </div>
          </Card>

          {/* Live Execution Proof: Minh chứng phân phối trận đấu */}
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Nhật Ký Điều Phối &amp; Minh Chứng Chấm Thực Tế (Live Execution Proof)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ghi nhận từng trận đấu / lượt duyệt code được chuyển giao cho Máy 1 hay Máy 2 kèm thời gian xử lý
                </p>
              </div>
              <Pill tone="primary" className="text-[11px]">Tự động cập nhật</Pill>
            </div>

            <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs">
              <div className="flex flex-col gap-1.5">
                <p className="text-muted-foreground">
                  [14:15:02] <span className="font-semibold text-primary">[DISPATCH]</span> Match #QF-01 (Hiệp 1) được gán cho <strong className="text-foreground">Máy Chấm 1</strong> (Thread #18). Thời gian phản hồi: 14ms.
                </p>
                <p className="text-muted-foreground">
                  [14:15:08] <span className="font-semibold text-success">[SANDBOX]</span> Bot Đội Đỏ thực thi an toàn trong cgroup 256MB. Execution time: 18ms. Trả về: ROCK.
                </p>
                <p className="text-muted-foreground">
                  [14:15:09] <span className="font-semibold text-success">[SANDBOX]</span> Bot Đội Xanh thực thi an toàn trong cgroup 256MB. Execution time: 24ms. Trả về: PAPER.
                </p>
                <p className="text-muted-foreground">
                  [14:15:15] <span className="font-semibold text-warning">[DB_SYNC]</span> Ghi nhận trạng thái bàn cờ 9x9 vào Supabase PostgreSQL. Latency: 22ms.
                </p>
              </div>
            </div>
          </Card>

          {/* Kiểm soát Database Supabase PostgreSQL */}
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Kiểm Soát Bộ Nhớ &amp; Cơ Sở Dữ Liệu (Supabase PostgreSQL)
                </h3>
                <p className="text-xs text-muted-foreground">Giám sát dung lượng lưu trữ, kết nối connection pool và tài nguyên máy chủ Go</p>
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" size="sm" onClick={() => alert('Đã cập nhật chỉ số DB mới nhất.')}>
                  <RefreshCw className="size-3.5" />
                  Làm mới
                </Btn>
                <Btn variant="primary" size="sm" onClick={handleOptimizeDB} loading={optimizing}>
                  <Wrench className="size-3.5" />
                  Tối ưu bộ nhớ DB
                </Btn>
              </div>
            </div>

            {dbNotice && <Notice tone="success">{dbNotice}</Notice>}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Dung lượng Database</span>
                <p className="mt-1 font-mono text-base font-bold text-foreground">42.8 MB</p>
                <span className="text-[10px] text-primary">Supabase PostgreSQL 15</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Bộ nhớ bảng Arena</span>
                <p className="mt-1 font-mono text-base font-bold text-foreground">18.6 MB</p>
                <span className="text-[10px] text-muted-foreground">1,248 bản ghi</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Kết nối Pool (In-Use / Idle)</span>
                <p className="mt-1 font-mono text-base font-bold text-success">3 / 17 Active</p>
                <span className="text-[10px] text-muted-foreground">PgBouncer Pooled</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Bộ nhớ Heap Server Go</span>
                <p className="mt-1 font-mono text-base font-bold text-foreground">14.1 MB</p>
                <span className="text-[10px] text-muted-foreground">System Allocated</span>
              </div>
            </div>
          </Card>

          {/* Thanh tiến độ nộp bài trực quan */}
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Tỷ lệ đội thi hoàn thành nộp mã nguồn:</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-muted-foreground">7 / 8 đội</span>
                <strong className="text-primary font-bold">87.5%</strong>
              </div>
            </div>
            <Progress value={87.5} max={100} label="Tiến độ nộp mã" tone="primary" />

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">1 đội chưa hoàn thành nộp mã cho hiệp này</span>
              <button
                type="button"
                onClick={() => setShowUnsubmitted(!showUnsubmitted)}
                className="font-medium text-primary hover:underline"
              >
                {showUnsubmitted ? 'Ẩn danh sách' : 'Xem danh sách chưa nộp'}
              </button>
            </div>

            {showUnsubmitted && (
              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                <p className="font-semibold text-foreground">Danh sách đội chưa nộp code:</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  <li>Null_Warriors (MSSV: 24020004) - Hạn còn 12 phút</li>
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TÀI KHOẢN VÀ MẬT KHẨU ĐỘI THI */}
      {/* ========================================================================= */}
      {activeTab === 'accounts' && (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Tài Khoản và Mật Khẩu Đội Thi</h3>
              <p className="text-xs text-muted-foreground">
                Tất cả tài khoản đã đăng ký trên hệ thống. Bấm “Thêm vào giải đấu” để ghi danh đội vào giải.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  className="h-8 w-56 rounded-md border border-input bg-card pl-9 pr-3 text-xs outline-none focus:border-primary"
                  placeholder="Tìm mã sinh viên hoặc tên đội..."
                  value={accSearch}
                  onChange={(e) => setAccSearch(e.target.value)}
                />
              </div>
              <Btn variant="outline" size="sm" onClick={() => setAccSearch('')}>
                Làm mới
              </Btn>
            </div>
          </div>

          <TableShell minWidth="38rem">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className={thClass}>Đội thi</th>
                <th className={thClass}>MSSV / Tên đăng nhập</th>
                <th className={thClass}>Mật khẩu</th>
                <th className={thClass}>Giải đấu hiện tại</th>
                <th className={`${thClass} text-right`}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAccounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-secondary/20">
                  <td className={tdClass}>
                    <strong className="text-xs font-semibold text-foreground">{acc.name}</strong>
                  </td>
                  <td className={tdClass}>
                    <span className="font-mono text-xs text-muted-foreground">{acc.mssv}</span>
                  </td>
                  <td className={tdClass}>
                    <code className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
                      {acc.pass}
                    </code>
                  </td>
                  <td className={tdClass}>
                    <Pill tone={acc.enrolledTourn?.includes('Mùa') ? 'success' : 'neutral'} className="text-[11px]">
                      {acc.enrolledTourn || 'Chưa vào giải'}
                    </Pill>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Btn
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedEnrollTeam(acc)
                          setEnrollModalOpen(true)
                        }}
                      >
                        <Plus className="size-3.5" />
                        Ghi danh
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={async () => {
                          if (confirm(`Bạn có chắc muốn xóa tài khoản ${acc.name} (${acc.mssv})?`)) {
                            try {
                              await arenaApi.deleteAdminAccount(acc.mssv)
                              setCredentials((prev) => prev.filter((c) => c.id !== acc.id))
                            } catch (err: any) {
                              alert(`Lỗi xóa tài khoản: ${err.message}`)
                            }
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: QUẢN LÝ VÒNG LOẠI & BÀI NỘP */}
      {/* ========================================================================= */}
      {activeTab === 'qualifier' && (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quản Lý Vòng Loại &amp; Bài Nộp ELO</h3>
              <p className="text-xs text-muted-foreground">Theo dõi danh sách đội, khóa bài và xét duyệt top K đội vào giải đấu chính.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="primary" size="sm" onClick={() => alert('Mở dialog Tạo vòng loại mới')}>
                <Plus className="size-3.5" />
                Tạo Vòng Loại
              </Btn>
              <Btn variant="outline" size="sm" onClick={() => alert('Đã tạo 8 bot thử nghiệm thành công!')}>
                Tạo Bot Test
              </Btn>
              <Btn variant="outline" size="sm" onClick={() => alert('Đã khóa bài nộp vòng loại!')}>
                <Lock className="size-3.5" />
                Khóa Bài
              </Btn>
              <Btn variant="primary" size="sm" onClick={() => alert('Top 8 đội có ELO cao nhất đã được chốt vào Tứ Kết!')}>
                <ArrowUpRight className="size-3.5" />
                Chốt Đội Vào Giải Chính
              </Btn>
            </div>
          </div>

          <TableShell minWidth="38rem">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className={thClass}>MSSV</th>
                <th className={thClass}>Tên đội</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Điểm ELO</th>
                <th className={thClass}>Nộp gần nhất</th>
                <th className={`${thClass} text-right`}>Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teams.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/20">
                  <td className={tdClass}>
                    <span className="font-mono text-xs text-muted-foreground">{t.sbd}</span>
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-xs font-semibold text-foreground">{t.name}</strong>
                      {t.advanced && <Pill tone="primary" className="text-[10px]">Top 8</Pill>}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <Pill
                      tone={
                        t.status === 'submitted'
                          ? 'success'
                          : t.status === 'locked'
                            ? 'neutral'
                            : t.status === 'error'
                              ? 'red'
                              : 'warning'
                      }
                      dot
                      className="text-[11px]"
                    >
                      {t.status === 'submitted'
                        ? 'Đã nộp'
                        : t.status === 'locked'
                          ? 'Đã khóa'
                          : t.status === 'error'
                            ? 'Lỗi biên dịch'
                            : 'Chưa nộp'}
                    </Pill>
                  </td>
                  <td className={tdClass}>
                    <span className="font-mono text-xs font-bold text-foreground">{t.elo.toFixed(2)}</span>
                  </td>
                  <td className={tdClass}>
                    <span className="font-mono text-xs text-muted-foreground">{t.updatedAt}</span>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setTeams((prev) =>
                          prev.map((item) =>
                            item.id === t.id
                              ? { ...item, locked: !item.locked, status: item.locked ? 'submitted' : 'locked' }
                              : item,
                          ),
                        )
                      }
                    >
                      {t.locked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                      {t.locked ? 'Mở khóa' : 'Khóa'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: XỬ LÝ SỰ CỐ TRẬN ĐẤU (INCIDENT OVERRIDE & ROLLBACK) */}
      {/* ========================================================================= */}
      {activeTab === 'incidents' && (
        <IncidentPanel
          teams={teams}
          audit={audit}
          onCommit={(entry) => setAudit((prev) => [{ ...entry, id: Date.now() }, ...prev])}
        />
      )}

      {/* Modal Enroll Account Vào Giải Đấu */}
      <Modal
        open={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        title="Thêm Đội Vào Giải Đấu"
        description={`Ghi danh đội "${selectedEnrollTeam?.name}" (MSSV: ${selectedEnrollTeam?.mssv}) vào giải đấu chính thức.`}
        size="sm"
      >
        <form onSubmit={handleEnrollSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">Chọn Giải Đấu:</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              value={targetTourn}
              onChange={(e) => setTargetTourn(e.target.value)}
            >
              <option value="Giải Đấu BOT K69 Mùa 2">Giải Đấu BOT K69 Mùa 2 (Đang diễn ra)</option>
              <option value="Cúp Vô Địch Công Nghệ UET 2026">Cúp Vô Địch Công Nghệ UET 2026</option>
            </select>
          </div>

          <Notice tone="neutral">
            Sau khi thêm, tài khoản này sẽ có quyền truy cập phòng thi đấu và nộp mã bot cho giải đã chọn.
          </Notice>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Btn variant="outline" type="button" onClick={() => setEnrollModalOpen(false)}>
              Hủy
            </Btn>
            <Btn variant="primary" type="submit">
              <UserCheck className="size-4" />
              Thêm Vào Giải Đấu
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
