'use client'

import { useEffect, useState } from 'react'
import { Card } from '../../ui'

type Sample = { at: number; memory: number; active: number }

function Trend({ title, unit, values }: { title: string; unit: string; values: number[] }) {
  const max = Math.max(1, ...values)
  const points = values.map((v, i) => `${8 + i * 304 / Math.max(1, values.length - 1)},${92 - v / max * 76}`).join(' ')
  return <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
    <p className="text-sm font-semibold">{title}</p>
    <p className="mt-1 text-xl font-bold tabular-nums">{values.length ? `${values.at(-1)!.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit}` : 'Chưa có mẫu'}</p>
    <svg viewBox="0 0 320 104" className="mt-3 h-28 w-full text-primary" role="img" aria-label={`${title}: ${values.length} mẫu thực tế; cao nhất ${max.toFixed(1)} ${unit}`}>
      {[16, 54, 92].map(y => <line key={y} x1="8" x2="312" y1={y} y2={y} stroke="currentColor" opacity=".12" />)}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {values.length === 1 && <circle cx="8" cy={92 - values[0] / max * 76} r="3" fill="currentColor" />}
    </svg>
  </div>
}

export function MonitorCharts({ data }: { data: any }) {
  const [samples, setSamples] = useState<Sample[]>([])
  useEffect(() => {
    const memory = data.server?.memory_alloc_mb
    const active = data.worker_pool?.in_flight
    if (!Number.isFinite(memory) || !Number.isFinite(active)) return
    setSamples(old => [...old, { at: Date.now(), memory, active }].slice(-60))
  }, [data])
  const tables: { name: string; total_bytes: number }[] = (data.database?.tables || []).filter((t: any) => Number.isFinite(t.total_bytes)).slice().sort((a: any, b: any) => b.total_bytes - a.total_bytes).slice(0, 6)
  const largest = Math.max(1, ...tables.map(t => t.total_bytes))
  return <Card title="Biểu đồ tài nguyên" subtitle="Số liệu từ API monitoring hiện có; không phát sinh thêm truy vấn. Lưu tối đa 60 mẫu trong phiên mở trang.">
    <div className="grid gap-4 md:grid-cols-2">
      <Trend title="Bộ nhớ Go đang sử dụng" unit="MB" values={samples.map(s => s.memory)} />
      <Trend title="Tác vụ gateway đang xử lý" unit="tác vụ" values={samples.map(s => s.active)} />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{samples.length ? `Từ ${new Date(samples[0].at).toLocaleTimeString('vi-VN')} đến ${new Date(samples[samples.length - 1].at).toLocaleTimeString('vi-VN')} · mỗi điểm là một lần nhận dữ liệu; tab ẩn tạm ngừng cập nhật.` : 'Đang chờ mẫu đầu tiên.'} Không phải lịch sử CloudWatch hay biểu đồ egress.</p>
    <h3 className="mb-3 mt-5 text-sm font-semibold">Các bảng chiếm nhiều dung lượng nhất</h3>
    {tables.length ? <div className="space-y-3">{tables.map(t => <div key={t.name}>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span className="break-all font-mono">{t.name}</span><span>{(t.total_bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KiB</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${t.total_bytes / largest * 100}%` }} /></div>
    </div>)}</div> : <p className="text-sm text-muted-foreground">API chưa cung cấp dung lượng các bảng.</p>}
    <p className="mt-3 text-xs text-muted-foreground">Dung lượng gồm dữ liệu, index và TOAST; độ dài thanh so với bảng lớn nhất, không phải hạn mức gói.</p>
  </Card>
}
