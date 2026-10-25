'use client'

import { useState } from 'react'
import { Award, Download, Eye, Printer } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { certificateSvg, downloadCertificatePng, printCertificates, type CertificateData } from '@/lib/certificate'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, EmptyState, ErrorNote, SkeletonRows } from './ui'
import { Overlay } from './replay-viewer'
import { useLive } from './context'

const TONE: Record<number, string> = {
  1: 'from-amber-300/40 to-amber-500/10 ring-amber-400/50',
  2: 'from-slate-200/40 to-slate-400/10 ring-slate-300/50',
  3: 'from-orange-300/40 to-orange-600/10 ring-orange-400/50',
}

/** Ảnh giấy chứng nhận (SVG do mình dựng, mọi chữ đã được escape). */
export function CertificateImage({ data, className }: { data: CertificateData; className?: string }) {
  return <div role="img" aria-label={`Giấy chứng nhận ${data.place} · ${data.team_name}`} className={cn('[&>svg]:h-auto [&>svg]:w-full', className)} dangerouslySetInnerHTML={{ __html: certificateSvg(data) }} />
}

export function useCertificateActions() {
  const { toast } = useLive()
  const [busy, setBusy] = useState('')
  const download = async (c: CertificateData) => {
    setBusy(c.tournament_id + c.student_id)
    try { await downloadCertificatePng(c); toast('success', 'Đã tải giấy chứng nhận về máy') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Không tải được giấy chứng nhận') }
    finally { setBusy('') }
  }
  const print = (list: CertificateData[]) => {
    try { printCertificates(list) } catch (e) { toast('error', e instanceof Error ? e.message : 'Không mở được cửa sổ in') }
  }
  return { busy, download, print }
}

/** Kho giấy chứng nhận của đội trong Hồ sơ: mọi giải đội đã đạt giải. */
export function CertificateVault() {
  const { scope } = useLive()
  const certs = useResource(`certs:${scope}`, () => arenaApi.getCertificates().then((r) => r.items || []), { ttl: 30_000 })
  const [open, setOpen] = useState<CertificateData | null>(null)
  const { busy, download, print } = useCertificateActions()
  const items = certs.data || []

  return (
    <Card
      icon={<Award />}
      title="Kho giấy chứng nhận"
      subtitle="Giấy chứng nhận của đội ở các giải đã đạt thành tích. Xem, tải ảnh hoặc in / lưu PDF."
      action={items.length > 1 ? <Button size="sm" variant="secondary" onClick={() => print(items)}><Printer className="size-4" />In tất cả</Button> : undefined}
    >
      <div id="certificates" className="scroll-mt-24" />
      {certs.loading ? <SkeletonRows rows={2} /> : certs.error && !certs.data ? <ErrorNote message={certs.error.message} onRetry={() => void certs.reload()} /> : items.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <li key={c.tournament_id + c.student_id} className={cn('group overflow-hidden rounded-2xl bg-gradient-to-br p-[1px] ring-1', TONE[c.rank] || TONE[3])}>
              <div className="h-full rounded-2xl bg-card">
                <button type="button" onClick={() => setOpen(c)} className="block w-full overflow-hidden rounded-t-2xl bg-white" aria-label={`Xem giấy chứng nhận ${c.place} tại ${c.tournament_name}`}>
                  <CertificateImage data={c} className="transition-transform duration-300 group-hover:scale-[1.02]" />
                </button>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-semibold">{c.tournament_name}</p><p className="text-xs text-muted-foreground">Ngày cấp {c.date}</p></div>
                    <Badge tone={c.rank === 1 ? 'warning' : 'accent'}>{c.place}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setOpen(c)}><Eye className="size-4" />Xem</Button>
                    <Button size="sm" loading={busy === c.tournament_id + c.student_id} onClick={() => void download(c)}><Download className="size-4" />Tải PNG</Button>
                    <Button size="sm" variant="ghost" onClick={() => print([c])}><Printer className="size-4" />In / PDF</Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Award className="size-6" />} title="Chưa có giấy chứng nhận" hint="Khi đội vào top 4 và chung kết của giải kết thúc, giấy chứng nhận sẽ xuất hiện ở đây kèm một thông báo." />}

      {open && (
        <Overlay
          title={`Giấy chứng nhận · ${open.place}`}
          subtitle={`${open.team_name} · ${open.tournament_name}`}
          onClose={() => setOpen(null)}
          actions={<div className="flex gap-2"><Button size="sm" loading={busy === open.tournament_id + open.student_id} onClick={() => void download(open)}><Download className="size-4" />Tải PNG</Button><Button size="sm" variant="secondary" onClick={() => print([open])}><Printer className="size-4" />In / PDF</Button></div>}
        >
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5"><CertificateImage data={open} /></div>
        </Overlay>
      )}
    </Card>
  )
}
