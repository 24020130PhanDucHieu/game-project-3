'use client'

import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate } from '@/lib/cache'
import { dateStamp, downloadCsv, parseCsv } from '@/lib/csv'
import { stamp } from '@/lib/format'
import { Badge, Button, Card, DataTable, ProgressBar, Select } from '../../ui'
import { useLive } from '../../context'
import { CertificatesCard } from './certificates'

type Row = { student_id: string; team_name: string; password: string; email: string; problem?: string }
const CHUNK = 100
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { CREATED: 'success', EXISTS: 'neutral', DUPLICATE: 'warning', INVALID: 'danger', ERROR: 'danger' }
const STATUS_LABEL: Record<string, string> = { CREATED: 'Đã tạo', EXISTS: 'Đã tồn tại', DUPLICATE: 'Trùng trong file', INVALID: 'Không hợp lệ', ERROR: 'Lỗi lưu' }

function readRows(text: string): Row[] {
  const table = parseCsv(text)
  if (!table.length) return []
  const head = table[0].map((h) => h.trim().toLowerCase())
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h))
  let sid = find('student_id', 'mssv', 'ma_sinh_vien', 'mã sinh viên')
  let name = find('team_name', 'ten_doi', 'tên đội', 'team')
  let pass = find('password', 'mat_khau', 'mật khẩu')
  const mail = find('email', 'mail', 'e-mail')
  let body = table.slice(1)
  if (sid < 0 && name < 0) { sid = 0; name = 1; pass = 2; body = table } // file không có tiêu đề
  return body.map((r) => {
    const row: Row = { student_id: (r[sid] ?? '').trim().toUpperCase(), team_name: (r[name] ?? '').trim(), password: pass >= 0 ? (r[pass] ?? '') : '', email: mail >= 0 ? (r[mail] ?? '').trim() : '' }
    if (!/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(row.student_id)) row.problem = 'Mã sinh viên 4–32 ký tự chữ/số'
    else if (row.team_name.length < 2 || row.team_name.length > 80) row.problem = 'Tên đội 2–80 ký tự'
    else if (row.password && (row.password.length < 6 || row.password.length > 72)) row.problem = 'Mật khẩu 6–72 ký tự'
    return row
  })
}

function ImportCard() {
  const { tournaments, tournamentId, run, toast } = useLive()
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [target, setTarget] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<any[]>([])
  const problems = useMemo(() => rows.filter((r) => r.problem).length, [rows])

  async function start() {
    const valid = rows.filter((r) => !r.problem)
    const all: any[] = []
    setResults([])
    setProgress({ done: 0, total: valid.length })
    // Chia nhỏ vì mỗi tài khoản cần băm mật khẩu bcrypt; tránh một yêu cầu quá lâu.
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK).map(({ student_id, team_name, password, email }) => ({ student_id, team_name, password, email }))
      const res: any = await run(() => arenaApi.importAccounts(chunk, target || undefined), `Đã xử lý ${Math.min(i + CHUNK, valid.length)}/${valid.length} dòng`)
      if (!res) break
      all.push(...res.results.map((r: any) => ({ ...r, row: r.row + i })))
      setProgress({ done: Math.min(i + CHUNK, valid.length), total: valid.length })
    }
    setResults(all)
    invalidate('admin:accounts')
    if (target) { invalidate('t:'); invalidate('tl') }
    if (all.some((r) => r.password)) toast('info', 'Có mật khẩu được sinh tự động — hãy tải file kết quả ngay, mật khẩu chỉ hiển thị một lần.')
  }

  return (
    <Card title="Nhập tài khoản đội từ CSV" subtitle="Cột: student_id (MSSV), team_name, password (tùy chọn — để trống để hệ thống tự sinh). Chấp nhận dấu phẩy hoặc chấm phẩy.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10">
            <Upload className="size-4" />{fileName || 'Chọn file CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setFileName(file.name)
              setResults([])
              setProgress(null)
              setRows(readRows(await file.text()))
            }} />
          </label>
          <Select label="Ghi danh luôn vào giải (tùy chọn)" value={target} onChange={(e) => setTarget(e.target.value)} className="w-64">
            <option value="">Không ghi danh</option>
            {tournaments.data?.map((t) => <option key={t.tournament_id} value={t.tournament_id}>{t.name}{t.tournament_id === tournamentId ? ' (đang chọn)' : ''}</option>)}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => downloadCsv('mau-nhap-doi.csv', ['student_id', 'team_name', 'password', 'email'], [['24020001', 'Alpha Bot', '', 'alpha@gmail.com'], ['24020002', 'Beta Bot', 'matkhau123', 'beta@gmail.com']])}><FileSpreadsheet className="size-4" />Tải file mẫu</Button>
        </div>

        {rows.length > 0 && !results.length && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="info">{rows.length} dòng</Badge>
              {problems > 0 ? <Badge tone="danger">{problems} dòng lỗi sẽ bị bỏ qua</Badge> : <Badge tone="success">Tất cả hợp lệ</Badge>}
            </div>
            <DataTable head={['#', 'MSSV', 'Tên đội', 'Mật khẩu', 'Kiểm tra']}>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={i} className={r.problem ? 'bg-red-500/5' : undefined}>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.student_id}</td>
                  <td className="px-3 py-2">{r.team_name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.password ? '••••••' : 'tự sinh'}</td>
                  <td className="px-3 py-2 text-xs">{r.problem ? <span className="text-red-600 dark:text-red-400">{r.problem}</span> : <Badge tone="success">OK</Badge>}</td>
                </tr>
              ))}
            </DataTable>
            {rows.length > 200 && <p className="text-xs text-muted-foreground">Hiển thị 200 dòng đầu.</p>}
            <Button disabled={!!progress && progress.done < progress.total || rows.length === problems} onClick={() => void start()}><Upload className="size-4" />Tạo {rows.length - problems} tài khoản</Button>
          </>
        )}
        {progress && progress.total > 0 && <ProgressBar value={progress.done} max={progress.total} label={`Đã xử lý ${progress.done}/${progress.total}`} />}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(results.reduce((acc: Record<string, number>, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})).map(([s, n]) => <Badge key={s} tone={STATUS_TONE[s]}>{STATUS_LABEL[s] ?? s}: {n as number}</Badge>)}
              <span className="flex-1" />
              <Button onClick={() => downloadCsv(`ket-qua-nhap-${dateStamp()}.csv`, ['student_id', 'team_name', 'trang_thai', 'mat_khau_tu_sinh', 'ghi_danh', 'ghi_chu'], results.map((r) => [r.student_id, r.team_name, STATUS_LABEL[r.status] ?? r.status, r.password ?? '', r.enrolled ? 'có' : '', r.detail ?? r.enroll_error ?? '']))}><Download className="size-4" />Tải kết quả (kèm mật khẩu tự sinh)</Button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">Mật khẩu tự sinh chỉ có trong file kết quả này; hệ thống không hiển thị lại. Hãy gửi riêng cho từng đội và yêu cầu đổi qua chức năng quên mật khẩu nếu cần.</p>
          </div>
        )}
      </div>
    </Card>
  )
}

async function allPages<T>(load: (page: number) => Promise<{ items: T[]; total: number; page_size: number }>): Promise<T[]> {
  const first = await load(1)
  const out = [...first.items]
  const pages = Math.ceil(first.total / Math.max(1, first.page_size))
  for (let page = 2; page <= pages; page++) out.push(...(await load(page)).items)
  return out
}

function ExportCard() {
  const { tournament, qualifiers, qualifierId, run } = useLive()
  const [qid, setQid] = useState(qualifierId)
  const exports: { label: string; hint: string; go: () => Promise<void> }[] = [
    { label: 'Tài khoản đội', hint: 'MSSV, tên đội (không có mật khẩu)', go: async () => {
      const rows = await arenaApi.getAdminAccounts()
      downloadCsv(`tai-khoan-${dateStamp()}.csv`, ['student_id', 'team_name'], rows.map((a) => [a.student_id, a.team_name]))
    } },
    { label: 'Xếp hạng toàn hệ thống', hint: 'ELO, số trận, tỉ lệ thắng', go: async () => {
      const rows = await arenaApi.getRanking()
      downloadCsv(`xep-hang-${dateStamp()}.csv`, ['hang', 'student_id', 'doi', 'elo', 'thang', 'tran', 'ti_le_thang'], rows.map((r, i) => [i + 1, r.student_id, r.bot_name, r.elo_score, r.wins, r.matches_played, r.win_rate]))
    } },
    { label: 'Xếp hạng vòng loại', hint: 'Gom toàn bộ các trang', go: async () => {
      if (!qid) throw new Error('Chọn vòng loại để xuất.')
      const rows = await allPages((page) => arenaApi.getQualifierRanking(qid, page))
      downloadCsv(`vong-loai-${dateStamp()}.csv`, ['hang', 'student_id', 'doi', 'elo', 'thang', 'tran', 'luot_nghi'], rows.map((r: any) => [r.rank, r.student_id, r.team_name, Number(r.elo).toFixed(1), r.wins, r.played, r.byes]))
    } },
    { label: 'Kết quả giải đang chọn', hint: 'Từng trận: vòng, hai đội, tỉ số, đội thắng', go: async () => {
      const t = tournament.data
      if (!t) throw new Error('Chưa chọn giải.')
      const rows = Object.values(t.matches || {}).sort((a: any, b: any) => a.round_level - b.round_level).map((m: any) => [m.round_name, m.title, m.team_a?.team_name ?? '', m.team_a?.rounds_won ?? 0, m.team_b?.rounds_won ?? 0, m.team_b?.team_name ?? '', m.status, m.winner_name ?? ''])
      downloadCsv(`ket-qua-${t.tournament_id}-${dateStamp()}.csv`, ['vong', 'tran', 'doi_do', 'diem_do', 'diem_xanh', 'doi_xanh', 'trang_thai', 'doi_thang'], rows)
    } },
    { label: 'Lịch sử trận', hint: 'Mọi trận đã có hiệp hoàn tất', go: async () => {
      const rows = await arenaApi.getMatchHistory()
      downloadCsv(`lich-su-tran-${dateStamp()}.csv`, ['thoi_gian', 'vong', 'cap_dau', 'so_hiep', 'doi_thang'], rows.map((r) => [stamp(r.timestamp), r.stage, (r.bot_names || []).join(' vs '), r.total_rounds, r.winner_name]))
    } },
    { label: 'Nhật ký quản trị', hint: 'Ai làm gì, lúc nào', go: async () => {
      const res = await arenaApi.getAuditLogs()
      downloadCsv(`nhat-ky-${dateStamp()}.csv`, ['thoi_gian', 'nguoi_thao_tac', 'thao_tac', 'giai', 'tran', 'chi_tiet'], (res.logs || []).map((l: any) => [stamp(l.created_at), l.admin_user, l.action, l.tournament_id ?? '', l.match_id ?? '', JSON.stringify(l.details ?? {})]))
    } },
    { label: 'Hỏi đáp BTC', hint: 'Câu hỏi, câu trả lời, người trả lời', go: async () => {
      const rows = await allPages((page) => arenaApi.getClarifications({ page }))
      downloadCsv(`hoi-dap-${dateStamp()}.csv`, ['thoi_gian', 'student_id', 'doi', 'chu_de', 'cau_hoi', 'trang_thai', 'cong_khai', 'tra_loi', 'nguoi_tra_loi'], rows.map((r: any) => [stamp(r.created_at), r.student_id, r.team_name, r.topic, r.question, r.status, r.public ? 'có' : '', r.answer ?? '', r.answered_by ?? '']))
    } },
  ]
  return (
    <Card title="Xuất dữ liệu (CSV mở được bằng Excel)" subtitle="Dữ liệu lấy trực tiếp từ server tại thời điểm bấm.">
      <div className="mb-4 max-w-sm">
        <Select label="Vòng loại dùng khi xuất xếp hạng vòng loại" value={qid} onChange={(e) => setQid(e.target.value)}>
          {qualifiers.data?.length ? qualifiers.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>) : <option value="">Chưa có vòng loại</option>}
        </Select>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {exports.map((e) => (
          <li key={e.label} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span className="min-w-0"><span className="block text-sm font-semibold">{e.label}</span><span className="block text-xs text-muted-foreground">{e.hint}</span></span>
            <Button size="sm" variant="secondary" onClick={() => void run(e.go, `Đã xuất “${e.label}”`)}><Download className="size-3.5" />CSV</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ImportExportTab() {
  return <div className="space-y-6"><ImportCard /><ExportCard /><CertificatesCard /></div>
}
