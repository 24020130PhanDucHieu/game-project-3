'use client'

import { Castle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BLUE_BASE,
  BOARD_SIZE,
  RED_BASE,
  teamLabel,
  weaponLabel,
  type Piece,
} from '@/lib/arena-data'
import { WeaponIcon } from '../primitives'

export function GameBoard({
  pieces,
  selectedId,
  lastMove,
  onCellClick,
}: {
  pieces: Piece[]
  selectedId: string | null
  lastMove: { row: number; col: number } | null
  onCellClick: (row: number, col: number) => void
}) {
  const selected = pieces.find((p) => p.id === selectedId) ?? null
  const isTarget = (row: number, col: number) =>
    !!selected &&
    Math.abs(selected.row - row) + Math.abs(selected.col - col) === 1 &&
    !pieces.some((p) => p.row === row && p.col === col && p.team === selected.team)

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div className="flex gap-1.5">
        <div className="grid shrink-0 grid-rows-9 gap-1 pt-0 font-mono text-[10px] text-muted-foreground" aria-hidden>
          {Array.from({ length: BOARD_SIZE }, (_, i) => (
            <span key={i} className="flex w-3 items-center justify-end">
              {i}
            </span>
          ))}
        </div>
        <div
          role="grid"
          aria-label="Bàn cờ 9x9"
          className="grid aspect-square flex-1 grid-cols-9 gap-1 rounded-xl border border-border bg-secondary/70 p-1.5"
        >
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
            const row = Math.floor(index / BOARD_SIZE)
            const col = index % BOARD_SIZE
            const piece = pieces.find((p) => p.row === row && p.col === col)
            const blueBase = row === BLUE_BASE.row && col === BLUE_BASE.col
            const redBase = row === RED_BASE.row && col === RED_BASE.col
            const target = isTarget(row, col)
            const isLast = lastMove?.row === row && lastMove?.col === col
            const isSelected = piece && piece.id === selectedId
            const label = piece
              ? `[${row},${col}] ${teamLabel[piece.team]} – ${weaponLabel[piece.weapon]}`
              : `[${row},${col}] trống${blueBase ? ', căn cứ Đội Xanh' : ''}${redBase ? ', căn cứ Đội Đỏ' : ''}`

            return (
              <button
                key={index}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={!!isSelected}
                onClick={() => onCellClick(row, col)}
                className={cn(
                  'relative flex items-center justify-center rounded-md bg-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  blueBase && 'bg-team-blue/10 ring-1 ring-inset ring-team-blue/30',
                  redBase && 'bg-team-red/10 ring-1 ring-inset ring-team-red/30',
                  isLast && 'bg-warning/15 ring-2 ring-inset ring-warning/60',
                  target && 'cursor-pointer bg-primary/10 ring-2 ring-inset ring-primary/50 hover:bg-primary/20',
                  !piece && !target && 'hover:bg-secondary',
                )}
              >
                {(blueBase || redBase) && !piece && (
                  <Castle
                    className={cn('size-1/2', blueBase ? 'text-team-blue/50' : 'text-team-red/50')}
                    aria-hidden
                  />
                )}
                {target && !piece && <span className="size-2 rounded-full bg-primary/60" aria-hidden />}
                {piece && (
                  <span
                    className={cn(
                      'flex size-[78%] items-center justify-center rounded-full text-primary-foreground shadow-sm transition-transform',
                      piece.team === 'blue' ? 'bg-team-blue' : 'bg-team-red',
                      isSelected && 'scale-110 ring-[3px] ring-foreground/80 ring-offset-1 ring-offset-card',
                      target && 'ring-2 ring-primary ring-offset-1',
                    )}
                  >
                    <WeaponIcon weapon={piece.weapon} className="size-[55%]" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="ml-[1.125rem] mt-1 grid grid-cols-9 gap-1 px-1.5 font-mono text-[10px] text-muted-foreground" aria-hidden>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <span key={i} className="text-center">
            {i}
          </span>
        ))}
      </div>
    </div>
  )
}
