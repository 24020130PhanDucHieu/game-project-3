'use client'

import { Award } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { Badge, Card, EmptyState } from '../../ui'

/** Huy hiệu Giải AI của một đội (tính từ kết quả thật, tách riêng huy hiệu thử thách của giải thường). */
export function AiBadges({ sid }: { sid: string }) {
  const badges = useResource(sid ? `ai:badges:${sid}` : null, () => arenaApi.getAiBadges(sid), { ttl: 20_000, refreshMs: 60_000 })
  const items = badges.data?.items || []
  return (
    <Card icon={<Award />} title="Huy hiệu Giải AI" subtitle="Tính từ kết quả thật; tách riêng khỏi huy hiệu giải thường">
      {items.length ? (
        <ul className="flex flex-wrap gap-2" data-testid="ai-badges">
          {items.map((b) => (
            <li key={`${b.id}:${b.source}`} title={`${b.desc} (${b.source})`} className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-semibold">
              <Award className="size-4 text-amber-500" aria-hidden />{b.name}<Badge tone={b.tone as any} className="hidden sm:inline-flex">{b.source}</Badge>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Chưa có huy hiệu" hint="Hoàn thành vòng loại AI, đọc đối thủ tốt hoặc vào giải chính để nhận huy hiệu." />}
    </Card>
  )
}
