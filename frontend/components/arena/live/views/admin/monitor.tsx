'use client'

import { CheckCircle2, Circle, Database, Server, Users } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { Badge, Button, Card, DataTable, EmptyState, ErrorNote, SkeletonCards, SkeletonRows, Stat, StatusBadge } from '../../ui'
import { useLive } from '../../context'
import { statusOf } from '@/lib/format'

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d ? `${d} ngày ` : ''}${h} giờ ${m} phút`
}

type Go = (tab: 'tournament' | 'qualifier' | 'accounts' | 'notify') => void

function Checklist({ onGo }: { onGo: Go }) {
  const { tournament, tournaments, qualifiers, navigate, setMatchId } = useLive()
  const t = tournament.data
  const matches: [string, any][] = Object.entries(t?.matches || {})
  const teams = t?.teams?.length ?? 0
  const scheduled = matches.some(([, m]) => m.team_a || m.team_b)
  const timed = Object.keys(t?.stage_schedule || {}).length > 0
  const ready = matches.filter(([, m]) => m.round_status === 'READY_FOR_BATTLE' && m.status !== 'COMPLETED')
  const q = qualifiers.data?.[0]
  const items: { done: boolean; title: string; hint: string; action?: { label: string; run: () => void } }[] = [
    { done: !!tournaments.data?.length, title: 'Tạo giải đấu', hint: tournaments.data?.length ? `${tournaments.data.length} giải đấu.` : 'Chưa có giải nào.', action: { label: 'Tạo giải', run: () => onGo('tournament') } },
    { done: !!t && teams >= t.num_teams, title: 'Đủ đội tham gia', hint: t ? `${teams}/${t.num_teams} đội đã ghi danh.` : 'Chọn giải để xem.', action: { label: 'Thêm đội', run: () => onGo('tournament') } },
    { done: scheduled, title: 'Xếp lịch thi đấu', hint: scheduled ? 'Đã ghép cặp vòng 1.' : 'Ghép cặp vòng 1 từ danh sách đội.', action: { label: 'Xếp lịch', run: () => onGo('tournament') } },
    { done: timed, title: 'Đặt lịch và luật từng vòng', hint: timed ? 'Đã đặt lịch các vòng.' : 'Giờ mở/đóng vòng và luật thi đấu.', action: { label: 'Đặt lịch', run: () => onGo('tournament') } },
    { done: !!q && ['FINISHED', 'PROMOTED'].includes(q.status), title: 'Vòng loại', hint: q ? `Trạng thái hiện tại: ${statusOf(q.status).label}.` : 'Chưa có vòng loại (không bắt buộc).', action: { label: q ? 'Điều hành' : 'Tạo vòng loại', run: () => onGo('qualifier') } },
    { done: ready.length === 0 && matches.length > 0, title: 'Trận sẵn sàng khai hỏa', hint: ready.length ? `${ready.length} trận đã đủ bot, chờ bạn bấm “Khai hỏa”.` : 'Không có trận nào đang chờ khai hỏa.', action: ready.length ? { label: 'Mở trận', run: () => { setMatchId(ready[0][0]); navigate('match') } } : undefined },
  ]
  const doneCount = items.filter((i) => i.done).length
  return (
    <Card title="Việc cần làm" subtitle={`${doneCount}/${items.length} bước đã xong`} action={<Badge tone={doneCount === items.length ? 'success' : 'accent'}>{Math.round((doneCount / items.length) * 100)}%</Badge>}>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.title} className={`flex items-center gap-3 rounded-xl border p-3 ${item.done ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
            {item.done ? <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-label="Đã xong" /> : <Circle className="size-5 shrink-0 text-muted-foreground" aria-label="Chưa xong" />}
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.hint}</p></div>
            {item.action && !item.done && <Button size="sm" variant="secondary" onClick={item.action.run}>{item.action.label}</Button>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function MonitorTab({ onGo }: { onGo: Go }) {
  const { tournamentId, run, confirm, busy } = useLive()
  const monitor = useResource<any>(`admin:monitor:${tournamentId}`, () => arenaApi.getMonitoring(tournamentId), { ttl: 5_000, refreshMs: 10_000 })
  const data = monitor.data
  if (monitor.loading) return <div className="space-y-4"><SkeletonCards /><SkeletonRows rows={4} /></div>
  if (monitor.error && !data) return <ErrorNote message={monitor.error.message} onRetry={() => void monitor.reload()} />
  if (!data) return null
  const contest = data.contest || {}
  const server = data.server || {}
  const db = data.database || {}
  const queueCounts: Record<string, number> = data.queue?.counts || {}
  const pool = data.worker_pool || {}
  const nodes: any[] = pool.nodes || []

  return (
    <div className="space-y-6">
      <Checklist onGo={onGo} />
      <div>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-primary" />Cuộc thi — {contest.tournament_name}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Tài khoản đã đăng ký" value={(contest.total_registered_accounts ?? 0).toLocaleString('vi-VN')} hint={`${contest.total_tournaments ?? 0} giải đấu`} />
          <Stat label="Đội ghi danh giải" value={contest.enrolled_teams ?? 0} />
          <Stat label="Đội đã nộp bot" value={contest.submitted_teams ?? 0} tone="success" />
          <Stat label="Đội chưa nộp bot" value={contest.unsubmitted_count ?? 0} tone={contest.unsubmitted_count ? 'danger' : undefined} />
        </div>
        {!!contest.unsubmitted_teams?.length && (
          <details className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-amber-800 dark:text-amber-300">Xem {contest.unsubmitted_count} đội chưa nộp bot</summary>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">{contest.unsubmitted_teams.map((n: string, i: number) => <li key={`${n}-${i}`}>{n}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card title="Gửi email" action={<StatusBadge status={data.mail?.configured ? 'READY' : 'UNAVAILABLE'} label={data.mail?.configured ? 'Đã cấu hình SMTP' : 'Chưa cấu hình'} />}>
          <p className="text-sm text-muted-foreground">{data.mail?.configured ? 'Đội quên mật khẩu sẽ nhận mã khôi phục qua email đã đăng ký.' : 'Chưa đặt SMTP_USER / SMTP_PASSWORD trên server — đội quên mật khẩu chưa nhận được mã qua email. Xem docs/EMAIL_SETUP.md.'}</p>
        </Card>
        <Card title="Cơ sở dữ liệu" action={<><StatusBadge status={db.status} /><Button size="sm" variant="secondary" loading={busy} onClick={async () => { if (await confirm({ title: 'Cập nhật thống kê truy vấn?', message: 'Chạy ANALYZE; không thu hồi dung lượng ổ đĩa.', confirmLabel: 'Chạy' })) void run(() => arenaApi.optimizeDatabase() as Promise<any>, 'Đã cập nhật thống kê cơ sở dữ liệu', () => monitor.reload()) }}><Database className="size-3.5" />Tối ưu</Button></>}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[['Nhà cung cấp', db.provider], ['Dung lượng CSDL', db.db_size], ['Dung lượng 3 bảng chính', db.tables_size], ['Bản ghi kho chấm bài', db.record_count?.toLocaleString?.('vi-VN')], ['Kết nối đang chạy', db.active_connections], ['Pool (dùng/mở/tối đa)', db.pool_open !== undefined ? `${db.pool_in_use}/${db.pool_open}/${db.pool_max_open}` : undefined]].map(([k, v]) => (
              <div key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v ?? '—'}</dd></div>
            ))}
          </dl>
          {db.metrics_error && <p role="alert" className="mt-3 text-sm text-destructive">{db.metrics_error}</p>}
          {db.sampled_at && <p className="mt-3 text-xs text-muted-foreground">Nguồn: PostgreSQL trực tiếp · Đo lúc {new Date(db.sampled_at).toLocaleString('vi-VN')} · Lưu mẫu tối đa {db.refresh_seconds} giây để giảm truy vấn.</p>}
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">Egress / Cached Egress / hạn mức organization</p>
            <p className="mt-1 text-muted-foreground">Chưa có dữ liệu API tính phí Supabase. Không thể suy ra các chỉ số này từ dung lượng database; chưa có số liệu không có nghĩa là 0 GB.</p>
            <a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-primary underline">Xem Usage trên Supabase (chọn organization mới)</a>
          </div>
          {Array.isArray(db.tables) && <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">Chi tiết {db.tables.length} bảng ứng dụng</summary>
            <div className="mt-3 overflow-x-auto">
              <DataTable head={['Bảng', 'Dung lượng', 'Index', 'Dòng ước tính', 'Dòng chết ước tính', 'RLS', 'ANALYZE gần nhất']}>
                {db.tables.map((table: any) => <tr key={table.name}>
                  <td className="px-3 py-2 font-mono text-xs">{table.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{(table.total_bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KiB</td>
                  <td className="px-3 py-2">{table.index_count}</td>
                  <td className="px-3 py-2">{table.estimated_rows?.toLocaleString('vi-VN') ?? '—'}</td>
                  <td className="px-3 py-2">{table.estimated_dead_rows?.toLocaleString('vi-VN') ?? '—'}</td>
                  <td className="px-3 py-2">{table.rls_enabled ? 'Bật' : 'Tắt'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{table.last_analyzed ? new Date(table.last_analyzed).toLocaleString('vi-VN') : 'Chưa ghi nhận'}</td>
                </tr>)}
              </DataTable>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Số dòng lấy từ thống kê PostgreSQL, là ước tính. Dòng chết là phiên bản cũ chờ VACUUM, không phải dữ liệu bị mất. Dung lượng gồm cả index và TOAST.</p>
          </details>}
        </Card>

        <Card title="Hàng đợi chấm" action={<StatusBadge status={data.queue?.status} />}>
          {Object.keys(queueCounts).length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(queueCounts).map(([k, v]) => <Stat key={k} label={k} value={Number(v).toLocaleString('vi-VN')} />)}</div>
          ) : <EmptyState title="Hàng đợi trống" />}
        </Card>
      </div>

      <Card title="Máy chủ gateway" action={<Server className="size-4 text-muted-foreground" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Thời gian chạy" value={formatUptime(server.uptime_seconds || 0)} />
          <Stat label="CPU" value={`${server.cpu_cores ?? '—'} lõi`} hint={`${server.goroutines ?? '—'} goroutine`} />
          <Stat label="Bộ nhớ đang dùng" value={`${(server.memory_alloc_mb ?? 0).toFixed(1)} MB`} hint={`Hệ thống cấp ${(server.memory_sys_mb ?? 0).toFixed(0)} MB`} />
          <Stat label="Chu kỳ GC" value={server.gc_cycles ?? '—'} />
        </div>
      </Card>

      <Card title="Máy chấm (worker)" subtitle={`${pool.ready ?? 0}/${pool.total ?? 0} sẵn sàng · ${pool.in_flight ?? 0}/${pool.capacity ?? 0} tác vụ đang chạy`} action={<StatusBadge status={pool.status} />}>
        {!!nodes.length && <div className="mb-5 grid gap-4 md:grid-cols-2">
          {nodes.map((n, i) => <section key={n.host || i} className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold"><Server className="size-4 text-primary" />Server {i + 1} · {n.provider || 'Chưa xác minh nhà cung cấp'}</h3>
              <StatusBadge status={n.status === 'UNREACHABLE' ? 'UNAVAILABLE' : n.status} label={n.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{n.with_gateway === true ? 'Gateway/API và máy chấm trên cùng server' : n.with_gateway === false ? 'Máy chấm qua mạng, tách khỏi tiến trình gateway' : 'Chưa xác minh vai trò server'}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">IP công khai (cấu hình)</dt><dd className="font-mono font-semibold">{n.public_ip || 'Chưa cấu hình'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Địa chỉ gateway gọi</dt><dd className="break-all font-mono">{n.host || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Tác vụ đang chạy / sức chứa</dt><dd>{n.active ?? '—'} / {n.capacity ?? '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Thời gian kiểm tra health</dt><dd>{n.latency_ms !== undefined ? `${n.latency_ms} ms` : '—'}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{n.checked_at ? `Kiểm tra lúc ${new Date(n.checked_at).toLocaleTimeString('vi-VN')}` : 'Chưa có thời điểm kiểm tra'} · Trạng thái lấy từ API /health.</p>
          </section>)}
        </div>}
        <p className="mb-3 text-xs text-muted-foreground">Nhà cung cấp do worker nhận diện từ hệ điều hành. Số tác vụ bên dưới do gateway ghi nhận từ lần khởi động gần nhất; không phải số liệu CloudWatch.</p>
        {nodes.length ? (
          <DataTable head={['Máy', 'Trạng thái', 'Đang chạy / Sức chứa', 'Đã chạy', 'Lỗi', 'Trung bình', 'Thành công']}>
            {nodes.map((n, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5 font-medium">{n.name}{n.public_ip && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{n.public_ip}</span>}<span className="block font-mono text-xs text-muted-foreground">{n.public_ip ? 'gọi qua ' : ''}{n.host}{/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(n.host || '') ? ' · IP nội bộ VPC' : /^(127\.|localhost)/.test(n.host || '') ? ' · cùng máy với gateway' : ''}</span></td>
                <td className="px-3 py-2.5"><StatusBadge status={n.status === 'UNREACHABLE' ? 'UNAVAILABLE' : n.status === 'HEALTHY' || n.status === 'READY' ? 'READY' : n.status} label={n.status} /></td>
                <td className="px-3 py-2.5 tabular-nums">{n.active}/{n.capacity}</td>
                <td className="px-3 py-2.5 tabular-nums">{n.finished}</td>
                <td className="px-3 py-2.5 tabular-nums">{n.failed}</td>
                <td className="px-3 py-2.5 tabular-nums">{n.avg_duration_ms} ms</td>
                <td className="px-3 py-2.5 tabular-nums">{n.success_rate ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Không có dữ liệu worker" />}
        {!!pool.recent_logs?.length && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Nhật ký tác vụ gần đây ({pool.recent_logs.length})</summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground">
              {[...pool.recent_logs].reverse().map((l: any, i: number) => <li key={i}><Badge tone={l.success ? 'success' : 'danger'}>{l.success ? 'OK' : 'LỖI'}</Badge> {l.timestamp} · {l.worker_name} · {l.detail} · {l.duration_ms} ms</li>)}
            </ul>
          </details>
        )}
      </Card>
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => { invalidate('admin:monitor'); void monitor.reload() }}>Làm mới ngay</Button></div>
    </div>
  )
}
