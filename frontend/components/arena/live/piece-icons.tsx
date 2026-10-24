import type { SVGProps } from 'react'

/**
 * Biểu tượng quân cờ vẽ riêng (thay emoji ✊✋✌️): hiển thị giống nhau trên mọi máy.
 * Mỗi quân gồm các path trên khung 24×24; dùng cho bàn 2D (SVG) và vẽ lên canvas làm texture 3D (Path2D).
 */
export type PieceType = 'ROCK' | 'PAPER' | 'SCISSORS' | 'JOKER'

type Shape = { fill?: string[]; stroke?: string[] }

export const PIECE_SHAPES: Record<PieceType, Shape> = {
  // Búa: khối đá cắt mặt.
  ROCK: {
    fill: ['M7.2 4.6 15.8 3.4 20.6 9.2 19.4 17.4 12.6 20.8 5 18.2 3.2 10.4Z'],
    stroke: ['M7.2 4.6 11 10.2 15.8 3.4', 'M11 10.2 20.6 9.2', 'M11 10.2 12.6 20.8', 'M11 10.2 3.2 10.4', 'M11 10.2 5 18.2'],
  },
  // Bao: tờ giấy có góc gấp và dòng chữ.
  PAPER: {
    fill: ['M6 2.8h8.6L19 7.2v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z'],
    stroke: ['M14.6 2.8v4.4H19', 'M8 11.2h8', 'M8 14.4h8', 'M8 17.6h5.2'],
  },
  // Kéo: hai vòng tay cầm và hai lưỡi bắt chéo.
  SCISSORS: {
    stroke: ['M6.4 8.6a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z', 'M6.4 21a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z', 'M8.6 7.4 20.4 18.2', 'M8.6 16.6 20.4 5.8', 'M13.2 12l1.2-1.1'],
  },
  // Joker: ngôi sao năm cánh.
  JOKER: {
    fill: ['M12 2.6l2.75 5.9 6.45.75-4.8 4.4 1.3 6.35L12 16.8 6.3 20l1.3-6.35-4.8-4.4 6.45-.75Z'],
  },
}

export const PIECE_LABEL: Record<string, string> = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo', JOKER: 'Joker' }

export function PieceIcon({ type, ...props }: { type?: string } & SVGProps<SVGSVGElement>) {
  const shape = PIECE_SHAPES[(type as PieceType)] as Shape | undefined
  if (!shape) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden {...props}>
        <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.2-1.5 2.3" /><path d="M12 18h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {shape.fill?.map((d) => <path key={d} d={d} fill="currentColor" fillOpacity={0.9} stroke="currentColor" strokeWidth={1.4} />)}
      {shape.stroke?.map((d) => <path key={d} d={d} fill="none" stroke={shape.fill ? 'rgba(0,0,0,.35)' : 'currentColor'} strokeWidth={shape.fill ? 1.1 : 2} />)}
    </svg>
  )
}

/** Vẽ quân lên canvas 2D (texture 3D): huy hiệu tròn + biểu tượng. */
export function drawPieceIcon(ctx: CanvasRenderingContext2D, type: string, size: number, color: string) {
  const shape = PIECE_SHAPES[type as PieceType]
  const scale = (size * 0.62) / 24
  ctx.save()
  ctx.translate(size * 0.19, size * 0.19)
  ctx.scale(scale, scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (!shape) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    ctx.stroke(new Path2D('M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.2-1.5 2.3'))
    ctx.stroke(new Path2D('M12 18h.01'))
  } else {
    for (const d of shape.fill || []) {
      const p = new Path2D(d)
      ctx.fillStyle = color
      ctx.fill(p)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.4
      ctx.stroke(p)
    }
    for (const d of shape.stroke || []) {
      ctx.strokeStyle = shape.fill ? 'rgba(0,0,0,.35)' : color
      ctx.lineWidth = shape.fill ? 1.1 : 2.2
      ctx.stroke(new Path2D(d))
    }
  }
  ctx.restore()
}
