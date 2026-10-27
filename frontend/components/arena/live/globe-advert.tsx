'use client'

import { useId } from 'react'

function wrap(text: string, width: number, limit: number) {
  const words = text.trim().split(/\s+/)
  const rows: string[] = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) { rows.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) rows.push(line)
  return rows.slice(0, limit).map((row, i) => {
    const cut = row.length > width || (i === limit - 1 && rows.length > limit)
    return cut ? `${row.slice(0, width - 1).trimEnd()}…` : row
  })
}

/** Each baseline follows a latitude, so glyphs turn with the sphere's surface. */
export function GlobeAdvert({ eyebrow, title, lines, actionable }: { eyebrow: string; title: string; lines: string[]; actionable: boolean }) {
  const id = useId().replace(/:/g, '')
  const heading = wrap(title, 21, 3)
  const detail = lines.flatMap(line => wrap(line, 40, 2)).slice(0, 4)
  const height = 26 + heading.length * 32 + 14 + detail.length * 17 + (actionable ? 24 : 0)
  let y = (360 - height) / 2 + 16
  const rows: { text: string; y: number; size: number; weight: number; kind: string }[] = []
  rows.push({ text: wrap(eyebrow, 38, 1)[0] || '', y, size: 10, weight: 800, kind: 'eyebrow' })
  y += 32
  for (const text of heading) { rows.push({ text, y, size: 27, weight: 900, kind: 'title' }); y += 32 }
  y += 1
  for (const text of detail) { rows.push({ text, y, size: 11, weight: 600, kind: 'detail' }); y += 17 }
  if (actionable) rows.push({ text: 'Khám phá giải đấu →', y: y + 10, size: 11, weight: 700, kind: 'action' })
  return <svg className="orb-curved-advert" viewBox="0 0 360 360" aria-hidden="true" focusable="false">
    <defs>
      {rows.map((row, i) => {
        const curve = (180 - row.y) * .75
        return <path key={i} id={`${id}-latitude-${i}`} d={`M 28 ${row.y + curve} Q 180 ${row.y - curve} 332 ${row.y + curve}`} />
      })}
      <linearGradient id={`${id}-ink`}><stop offset="0" stopColor="#e1d6ff" /><stop offset=".45" stopColor="#fff" /><stop offset="1" stopColor="#d4d8ff" /></linearGradient>
    </defs>
    <g fill={`url(#${id}-ink)`}>
      {rows.map((row, i) => <text key={i} fontSize={row.size} fontWeight={row.weight} className={`orb-ink-${row.kind}`} textAnchor="middle">
        <textPath href={`#${id}-latitude-${i}`} startOffset="50%">{row.text}</textPath>
      </text>)}
    </g>
  </svg>
}
