'use client'

import { useMemo, useState } from 'react'
import { Award, Printer } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field } from '../../ui'
import { useLive } from '../../context'

type Placement = { place: string; team: string; studentId: string }

/** Thứ hạng từ sơ đồ loại trực tiếp: thắng/thua trận chung kết, hai đội thua bán kết đồng hạng ba. */
export function placementsOf(tournament: any): Placement[] {
  const matches: any[] = Object.values(tournament?.matches || {})
  if (!matches.length) return []
  const top = Math.max(...matches.map((m) => Number(m.round_level) || 0))
  const side = (m: any, s: 'team_a' | 'team_b') => ({ team: m?.[s]?.team_name || '', studentId: m?.[s]?.student_id || '' })
  const winnerOf = (m: any) => (m?.winner === 'team_a' || m?.winner === 'team_b' ? m.winner : null)
  const out: Placement[] = []
  const final = matches.find((m) => Number(m.round_level) === top)
  const w = winnerOf(final)
  if (w) {
    out.push({ place: 'Quán quân', ...side(final, w) })
    out.push({ place: 'Á quân', ...side(final, w === 'team_a' ? 'team_b' : 'team_a') })
  }
  for (const semi of matches.filter((m) => Number(m.round_level) === top - 1)) {
    const sw = winnerOf(semi)
    if (sw) out.push({ place: 'Đồng hạng Ba', ...side(semi, sw === 'team_a' ? 'team_b' : 'team_a') })
  }
  return out.filter((p) => p.team)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function certificateHtml(items: Placement[], event: string, org: string, signer: string, date: string) {
  const pages = items.map((p) => `
  <section class="page">
    <div class="frame">
      <p class="org">${esc(org)}</p>
      <h1>GIẤY CHỨNG NHẬN</h1>
      <p class="lead">Ban tổ chức trân trọng chứng nhận đội</p>
      <h2>${esc(p.team)}</h2>
      <p class="sid">Đội trưởng · MSSV ${esc(p.studentId)}</p>
      <p class="lead">đã đạt</p>
      <p class="place">${esc(p.place.toUpperCase())}</p>
      <p class="lead">tại ${esc(event)}</p>
      <div class="foot"><span>${esc(date)}</span><span class="sign">${esc(signer)}<br/><small>Trưởng ban tổ chức</small></span></div>
    </div>
  </section>`).join('')
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Giấy chứng nhận · ${esc(event)}</title>
<style>
@page { size: A4 landscape; margin: 0 }
* { box-sizing: border-box } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1e1b4b }
.page { width: 297mm; height: 210mm; padding: 12mm; page-break-after: always; background: #fff }
.frame { height: 100%; border: 3mm double #b8862f; border-radius: 6mm; padding: 14mm 20mm; text-align: center;
  background: radial-gradient(circle at 50% 0%, #fef3c7 0, #fff 55%) }
.org { letter-spacing: .3em; font-weight: 700; color: #6d28d9; margin: 0 }
h1 { font-size: 46pt; margin: 8mm 0 4mm; letter-spacing: .08em; color: #b8862f }
h2 { font-size: 34pt; margin: 3mm 0 1mm; color: #4c1d95 }
.lead { font-size: 15pt; margin: 2mm 0 } .sid { color: #64748b; margin: 0 0 3mm }
.place { font-size: 28pt; font-weight: 800; color: #b91c1c; margin: 3mm 0 }
.foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14mm; font-size: 13pt }
.sign { text-align: center; min-width: 70mm; border-top: 1px solid #94a3b8; padding-top: 2mm }
</style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`
}

export function CertificatesCard() {
  const { tournament } = useLive()
  const t = tournament.data
  const items = useMemo(() => placementsOf(t), [t])
  const [org, setOrg] = useState('BOT K69 ARENA')
  const [signer, setSigner] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('vi-VN'))
  const print = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(certificateHtml(items, t?.name || 'Giải đấu', org, signer, date))
    win.document.close()
  }
  return (
    <Card title="Giấy chứng nhận đội đạt giải" subtitle="Lấy từ kết quả chung kết và bán kết của giải đang chọn. Mở cửa sổ in, chọn “Lưu thành PDF”." action={<Award className="size-4 text-muted-foreground" />}>
      {items.length ? (
        <div className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">{items.map((p, i) => <li key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"><span className="font-semibold">{p.team}</span><Badge tone={i === 0 ? 'warning' : 'accent'}>{p.place}</Badge></li>)}</ul>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Đơn vị tổ chức" value={org} onChange={(e) => setOrg(e.target.value)} />
            <Field label="Người ký" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Họ và tên" />
            <Field label="Ngày" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button onClick={print}><Printer className="size-4" />In / lưu PDF ({items.length} giấy)</Button>
        </div>
      ) : <EmptyState title="Chưa có đội đạt giải" hint="Giấy chứng nhận có khi trận chung kết của giải đang chọn đã kết thúc." />}
    </Card>
  )
}
