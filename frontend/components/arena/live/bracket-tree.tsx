'use client'

import { useMemo } from 'react'
import { MatchCard, winnerSide } from './shared'

const CARD_W = 240
const CARD_H = 108
const GAP_Y = 20
const GAP_X = 64
const HEAD = 34

type Node = { id: string; match: any; level: number; x: number; y: number }

/**
 * Sơ đồ loại trực tiếp có đường nối: vòng sau nằm giữa hai trận nguồn, đường của đội thắng được tô sáng.
 * Dùng next_match_id/next_slot do engine tạo khi xếp nhánh.
 */
export function BracketTree({ matches, onOpen, selected, scale = 1 }: { matches: Record<string, any>; onOpen?: (id: string) => void; selected?: string; scale?: number }) {
  const layout = useMemo(() => {
    const entries = Object.entries(matches || {}) as [string, any][]
    const levels = [...new Set(entries.map(([, m]) => Number(m.round_level) || 1))].sort((a, b) => a - b)
    const byLevel = new Map<number, [string, any][]>()
    for (const lv of levels) byLevel.set(lv, entries.filter(([, m]) => (Number(m.round_level) || 1) === lv).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })))
    const nodes = new Map<string, Node>()
    // Vòng đầu xếp đều; mỗi vòng sau lấy tâm trung bình của các trận dẫn vào.
    levels.forEach((lv, col) => {
      const list = byLevel.get(lv)!
      list.forEach(([id, m], i) => {
        let y = HEAD + i * (CARD_H + GAP_Y)
        if (col > 0) {
          const feeders = [...nodes.values()].filter((n) => n.match.next_match_id === id)
          if (feeders.length) y = feeders.reduce((sum, n) => sum + n.y, 0) / feeders.length
          else y = HEAD + i * (CARD_H + GAP_Y) * 2 ** col + ((CARD_H + GAP_Y) * (2 ** col - 1)) / 2
        }
        nodes.set(id, { id, match: m, level: lv, x: col * (CARD_W + GAP_X), y })
      })
    })
    const all = [...nodes.values()]
    const width = levels.length * CARD_W + (levels.length - 1) * GAP_X
    const height = Math.max(...all.map((n) => n.y + CARD_H), HEAD + CARD_H) + 8
    const titles = levels.map((lv, col) => ({ x: col * (CARD_W + GAP_X), name: byLevel.get(lv)![0][1].round_name || `Vòng ${lv}`, count: byLevel.get(lv)!.length }))
    const links = all.flatMap((n) => {
      const target = n.match.next_match_id ? nodes.get(n.match.next_match_id) : undefined
      if (!target) return []
      const won = winnerSide(n.match)
      // Đường sáng khi đội thắng của trận này đã được đưa vào đúng ô trận sau.
      const advanced = !!won && target.match[n.match.next_slot || 'team_a']?.student_id && target.match[n.match.next_slot || 'team_a']?.student_id === n.match[won]?.student_id
      const x1 = n.x + CARD_W
      const y1 = n.y + CARD_H / 2
      const x2 = target.x
      const y2 = target.y + (n.match.next_slot === 'team_b' ? CARD_H * 0.7 : CARD_H * 0.42)
      const mid = x1 + GAP_X / 2
      return [{ key: `${n.id}-${target.id}`, d: `M${x1},${y1} H${mid} V${y2} H${x2}`, advanced }]
    })
    return { all, width, height, titles, links }
  }, [matches])

  if (!layout.all.length) return null
  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
            {layout.links.map((l) => (
              <path key={l.key} d={l.d} fill="none" strokeWidth={l.advanced ? 3 : 2} strokeLinejoin="round"
                stroke={l.advanced ? 'var(--gold)' : 'color-mix(in oklab, var(--foreground) 22%, transparent)'}
                style={l.advanced ? { filter: 'drop-shadow(0 0 4px var(--gold))' } : undefined} />
            ))}
          </svg>
          {layout.titles.map((t) => (
            <div key={t.x} className="absolute flex items-center justify-between text-sm font-bold" style={{ left: t.x, top: 0, width: CARD_W }}>
              <span className="font-display">{t.name}</span><span className="text-[11px] font-medium text-muted-foreground">{t.count} trận</span>
            </div>
          ))}
          {layout.all.map((n) => (
            <div key={n.id} className="absolute" style={{ left: n.x, top: n.y, width: CARD_W }}>
              <MatchCard id={n.id} match={n.match} selected={n.id === selected} onOpen={onOpen} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
