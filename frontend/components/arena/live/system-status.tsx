'use client'

import { useEffect, useState } from 'react'
import { Activity, Database, Server, ShieldCheck } from 'lucide-react'
import { getApiBaseUrl } from '@/lib/api-client'
import { useOnline } from '@/lib/use-online'
import { Badge, Card } from './ui'

type Ready = { status?: string; checks?: Record<string, string> }

/** Trạng thái hệ thống công khai (từ /ready): thí sinh tự xem khi nghi có sự cố, không cần hỏi ban tổ chức. */
export function SystemStatusCard() {
  const online = useOnline()
  const [data, setData] = useState<Ready | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/ready`, { cache: 'no-store' })
        const body = (await res.json().catch(() => ({}))) as Ready
        if (!stop) { setData(body); setFailed(!res.ok && !body.status) }
      } catch {
        if (!stop) setFailed(true)
      } finally {
        if (!stop) setCheckedAt(new Date())
      }
    }
    void load()
    const timer = window.setInterval(load, 30_000)
    return () => { stop = true; window.clearInterval(timer) }
  }, [])

  const ok = data?.status === 'READY' && !failed
  const rows: [string, React.ReactNode, string | undefined][] = [
    ['Máy chủ trung tâm (gateway)', <Server key="s" className="size-4" />, failed ? 'UNREACHABLE' : data?.status],
    ['Cơ sở dữ liệu', <Database key="d" className="size-4" />, data?.checks?.database],
    ['Máy chấm bot', <Activity key="w" className="size-4" />, data?.checks?.workers],
  ]
  const tone = (v?: string) => (v === 'READY' || v === 'ready' ? 'success' : v ? 'danger' : 'neutral') as 'success' | 'danger' | 'neutral'
  const label = (v?: string) => (v === 'READY' || v === 'ready' ? 'Hoạt động' : v ? 'Gặp sự cố' : 'Đang kiểm tra…')

  return (
    <Card title="Trạng thái hệ thống" subtitle={checkedAt ? `Kiểm tra lúc ${checkedAt.toLocaleTimeString('vi-VN')} · tự cập nhật mỗi 30 giây` : 'Đang kiểm tra…'}
      action={<Badge tone={!online ? 'warning' : ok ? 'success' : failed || data ? 'danger' : 'neutral'}>{!online ? 'Bạn đang mất mạng' : ok ? 'Mọi dịch vụ hoạt động' : failed || data ? 'Đang có sự cố' : 'Đang kiểm tra'}</Badge>}>
      <ul className="space-y-2 text-sm">
        {rows.map(([name, icon, value]) => (
          <li key={name} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-2">{icon}{name}</span>
            <Badge tone={tone(value)}>{label(value)}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Nếu máy chấm gặp sự cố, bài đã nộp vẫn được giữ và sẽ được chấm lại; ban tổ chức sẽ thông báo và gia hạn nếu cần. Khi mất mạng, bạn vẫn kiểm tra mã và đấu thử boss được trên máy.</p>
    </Card>
  )
}
