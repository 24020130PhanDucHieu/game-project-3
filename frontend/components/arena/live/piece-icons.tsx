import type { SVGProps } from 'react'

/**
 * Biểu tượng quân cờ hình bàn tay (Búa = nắm đấm, Bao = xoè tay, Kéo = tay chữ V), nét đồng bộ với bộ icon Lucide.
 * Mỗi quân là các path trên khung 24×24; dùng cho bàn 2D (SVG) và vẽ lên canvas làm texture 3D (Path2D).
 */
export type PieceType = 'ROCK' | 'PAPER' | 'SCISSORS' | 'JOKER'

export const PIECE_PATHS: Record<PieceType, string[]> = {
  // Búa: nắm đấm (Lucide hand-fist).
  ROCK: [
    'M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0',
    'M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5',
    'M9 5A2 2 0 1 0 5 5V10',
    'M9 7V4A2 2 0 1 1 13 4V7.268',
  ],
  // Bao: bàn tay xoè (Lucide hand).
  PAPER: [
    'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
    'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2',
    'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ],
  // Kéo: tay chữ V — ngón trỏ và ngón giữa giơ cao, ngón áp út và út gập (vẽ theo nét của Lucide hand-metal).
  SCISSORS: [
    // Ngón trỏ nghiêng trái, ngón giữa nghiêng phải: hai ngón xoè thành chữ V.
    'M7.4 13.6 4.2 5.1a1.9 1.9 0 0 1 3.55-1.3l3.05 7.7',
    'M10.8 11.5 13.4 3.3a1.9 1.9 0 0 1 3.6 1.15l-2.3 7.75',
    'M18.4 13v-.6a1.9 1.9 0 0 0-3.8 0v.8',
    'm7.4 15.4-1.7-1.7a2 2 0 0 0-2.8 2.85l3.55 3.55C7.9 21.55 9.6 22.3 12.3 22.3h1.6a7.7 7.7 0 0 0 7.7-7.7v-2a1.9 1.9 0 0 0-3.8 0v1.6',
  ],
  // Joker: ngôi sao.
  JOKER: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z'],
}

const UNKNOWN = ['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01']

export const PIECE_LABEL: Record<string, string> = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo', JOKER: 'Joker' }

export function PieceIcon({ type, strokeWidth = 2, ...props }: { type?: string; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  const paths = PIECE_PATHS[type as PieceType] ?? UNKNOWN
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

/** Vẽ quân lên canvas 2D (texture 3D), cùng nét với bàn 2D. */
export function drawPieceIcon(ctx: CanvasRenderingContext2D, type: string, size: number, color: string) {
  const paths = PIECE_PATHS[type as PieceType] ?? UNKNOWN
  const scale = (size * 0.56) / 24
  ctx.save()
  ctx.translate(size * 0.22, size * 0.22)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = 2.1
  for (const d of paths) ctx.stroke(new Path2D(d))
  ctx.restore()
}
