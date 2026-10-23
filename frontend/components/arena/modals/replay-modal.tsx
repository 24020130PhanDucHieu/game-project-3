'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { initialPieces, weaponLabel, type Piece } from '@/lib/arena-data'
import { Btn, Modal, Pill, WeaponIcon } from '../primitives'

export function ReplayModal({
  open,
  onClose,
  matchTitle = 'Trận 1 - Tứ Kết · Hiệp 1',
  teamRed = 'Đội Đỏ',
  teamBlue = 'Đội Xanh',
}: {
  open: boolean
  onClose: () => void
  matchTitle?: string
  teamRed?: string
  teamBlue?: string
}) {
  const [step, setStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const maxSteps = 42

  const [commentary, setCommentary] = useState('Trận đấu bắt đầu tại lượt đi của Đội Xanh.')

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isPlaying) {
      timer = setInterval(() => {
        setStep((curr) => {
          if (curr >= maxSteps) {
            setIsPlaying(false)
            return curr
          }
          const next = curr + 1
          setCommentary(
            next % 2 === 1
              ? `Bước ${next}: Đội Xanh điều quân Kéo áp sát sườn phải căn cứ Đỏ.`
              : `Bước ${next}: Đội Đỏ tung Búa phòng thủ chặn đứng mũi đột kích.`,
          )
          return next
        })
      }, 500)
    }
    return () => clearInterval(timer)
  }, [isPlaying, maxSteps])

  function handleSliderChange(val: number) {
    setStep(val)
    setCommentary(`Đã chuyển tới nước đi thứ ${val} của hiệp đấu.`)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setIsPlaying(false)
        onClose()
      }}
      title={`Xem Lại Diễn Biến Trận Đấu (Replay)`}
      description={`${matchTitle} · Tái hiện toàn bộ nước đi và tương tác quân cờ từ dữ liệu máy chấm.`}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Thanh trạng thái 2 đội */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-team-red" />
            <strong className="text-team-red">{teamRed}</strong>
            <span className="font-mono text-muted-foreground">(9/9 quân)</span>
          </div>

          <Pill tone="primary" className="font-mono text-[11px]">
            BƯỚC {step} / {maxSteps}
          </Pill>

          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground">(9/9 quân)</span>
            <strong className="text-team-blue">{teamBlue}</strong>
            <span className="size-2.5 rounded-full bg-team-blue" />
          </div>
        </div>

        {/* Bàn cờ 9×9 replay */}
        <div className="mx-auto w-full max-w-[420px] rounded-xl border border-border bg-card p-2 shadow-inner">
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: 81 }).map((_, idx) => {
              const r = Math.floor(idx / 9)
              const c = idx % 9
              const isBaseRed = r === 0 && c === 8
              const isBaseBlue = r === 8 && c === 0

              // Sample piece display
              const isRed = (r === 7 && (c === 1 || c === 4 || c === 7)) || (step > 5 && r === 5 && c === 4)
              const isBlue = (r === 1 && (c === 1 || c === 4 || c === 7)) || (step > 3 && r === 3 && c === 1)

              return (
                <div
                  key={idx}
                  className={`relative flex aspect-square items-center justify-center rounded text-[10px] ${
                    isBaseRed
                      ? 'border border-dashed border-team-red bg-team-red/10'
                      : isBaseBlue
                        ? 'border border-dashed border-team-blue bg-team-blue/10'
                        : (r + c) % 2 === 0
                          ? 'bg-secondary/40'
                          : 'bg-card'
                  }`}
                >
                  {isRed && (
                    <div className="flex size-6 items-center justify-center rounded-full bg-team-red text-white shadow">
                      <WeaponIcon weapon={c === 1 ? 'rock' : c === 4 ? 'paper' : 'scissors'} className="size-3.5" />
                    </div>
                  )}
                  {isBlue && (
                    <div className="flex size-6 items-center justify-center rounded-full bg-team-blue text-white shadow">
                      <WeaponIcon weapon={c === 1 ? 'scissors' : c === 4 ? 'rock' : 'paper'} className="size-3.5" />
                    </div>
                  )}
                  {isBaseRed && !isRed && <span className="text-[8px] font-bold text-team-red">HQ</span>}
                  {isBaseBlue && !isBlue && <span className="text-[8px] font-bold text-team-blue">HQ</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Live Commentary Ticker */}
        <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2 font-mono text-xs text-foreground">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-primary" />
          {commentary}
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">Tua bước:</span>
            <input
              type="range"
              min={0}
              max={maxSteps}
              value={step}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
            />
            <span className="font-mono text-xs font-semibold text-foreground">
              {step}/{maxSteps}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            <Btn
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => handleSliderChange(Math.max(0, step - 1))}
            >
              <ChevronLeft className="size-4" />
              Nước Trước
            </Btn>
            <Btn
              variant={isPlaying ? 'outline' : 'primary'}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              className="min-w-32"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? 'Tạm Dừng' : 'Tự Động Chạy'}
            </Btn>
            <Btn
              variant="outline"
              size="sm"
              disabled={step >= maxSteps}
              onClick={() => handleSliderChange(Math.min(maxSteps, step + 1))}
            >
              Nước Kế
              <ChevronRight className="size-4" />
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => handleSliderChange(0)}
              title="Về đầu hiệp"
            >
              <RotateCcw className="size-3.5" />
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
