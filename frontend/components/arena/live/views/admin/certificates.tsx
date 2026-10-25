'use client'

import { useEffect, useState } from 'react'
import { Award, Download, Printer, Send } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { invalidate, useResource } from '@/lib/cache'
import { Badge, Button, Card, EmptyState, ErrorNote, Field, SkeletonRows } from '../../ui'
import { useLive } from '../../context'
import { CertificateImage, useCertificateActions } from '../../certificate-vault'

/**
 * Giấy chứng nhận của giải đang chọn (máy chủ tính từ chung kết và bán kết).
 * Khi chung kết xong, máy chủ tự gửi thông báo cho các đội; ở đây ban tổ chức chỉnh đơn vị, người ký, ngày
 * rồi bấm gửi lại — mỗi đội chỉ nhận một thông báo cho mỗi giải, nội dung giấy cập nhật ngay trong kho của đội.
 */
export function CertificatesCard() {
  const { tournamentId, tournament, run } = useLive()
  const certs = useResource(tournamentId ? `certs:admin:${tournamentId}` : null, () => arenaApi.getCertificates(tournamentId).then((r) => r.items || []), { ttl: 15_000, refreshMs: 30_000 })
  const items = certs.data || []
  const first = items[0]
  const [org, setOrg] = useState('BOT K69 ARENA')
  const [signer, setSigner] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('vi-VN'))
  useEffect(() => {
    if (!first) return
    setOrg(first.org || 'BOT K69 ARENA'); setSigner(first.signer || ''); setDate(first.date || new Date().toLocaleDateString('vi-VN'))
  }, [first?.tournament_id, first?.org, first?.signer, first?.date])
  const { busy, download, print } = useCertificateActions()
  const preview = items.map((c) => ({ ...c, org, signer, date }))

  const send = () => run(async () => {
    const r = await arenaApi.saveCertificates(tournamentId, { org, signer, date })
    return r
  }, 'Đã lưu giấy chứng nhận và gửi thông báo cho các đội đạt giải', () => invalidate('certs:'))

  return (
    <Card title="Giấy chứng nhận đội đạt giải" subtitle={`${tournament.data?.name || 'Giải đang chọn'} · Tự gửi thông báo cho các đội khi chung kết kết thúc; đội xem và tải trong Hồ sơ đội.`} action={<Award className="size-4 text-muted-foreground" />}>
      {certs.loading ? <SkeletonRows rows={3} /> : certs.error && !certs.data ? <ErrorNote message={certs.error.message} onRetry={() => void certs.reload()} /> : items.length ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Đơn vị tổ chức" value={org} maxLength={120} onChange={(e) => setOrg(e.target.value)} />
            <Field label="Người ký" value={signer} maxLength={80} onChange={(e) => setSigner(e.target.value)} placeholder="Họ và tên" />
            <Field label="Ngày cấp" value={date} maxLength={40} onChange={(e) => setDate(e.target.value)} />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {preview.map((c) => (
              <li key={c.student_id + c.place} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="bg-white"><CertificateImage data={c} /></div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{c.team_name}</span>
                  <Badge tone={c.rank === 1 ? 'warning' : 'accent'}>{c.place}</Badge>
                </div>
                <div className="flex gap-2 px-3 pb-3">
                  <Button size="sm" variant="secondary" loading={busy === c.tournament_id + c.student_id} onClick={() => void download(c)}><Download className="size-3.5" />PNG</Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void send()}><Send className="size-4" />Lưu &amp; gửi cho các đội</Button>
            <Button variant="secondary" onClick={() => print(preview)}><Printer className="size-4" />In / lưu PDF ({items.length} giấy)</Button>
          </div>
        </div>
      ) : <EmptyState title="Chưa có đội đạt giải" hint="Giấy chứng nhận có khi trận chung kết của giải đang chọn đã kết thúc." />}
    </Card>
  )
}
