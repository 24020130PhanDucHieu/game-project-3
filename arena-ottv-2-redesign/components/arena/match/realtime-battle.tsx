'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { initialPieces, weaponLabel, type Piece } from '@/lib/arena-data'
import { Btn, Card, Pill, WeaponIcon } from '../primitives'

export function RealtimeBattle({
  redCount = 9,
  blueCount = 9,
  isLive = true,
}: {
  redCount?: number
  blueCount?: number
  isLive?: boolean
}) {
  const [speed, setSpeed] = useState<number>(250)
  const [step, setStep] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [commentary, setCommentary] = useState<string>('Trận đấu đang diễn ra. Các nước đi được cập nhật trực tiếp từ máy chấm.')
  const maxSteps = 38

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isPlaying) {
      timer = setInterval(() => {
        setStep((s) => {
          if (s >= maxSteps) {
            setIsPlaying(false)
            return s
          }
          const next = s + 1
          setCommentary(
            next % 2 === 1
              ? `Lượt ${next}: Đội Xanh di chuyển quân Bao tiến vào trung lộ [4, 4].`
              : `Lượt ${next}: Đội Đỏ điều quân Kéo phản kích từ ô [5, 4].`,
          )
          return next
        })
      }, speed)
    }
    return () => clearInterval(timer)
  }, [isPlaying, speed, maxSteps])

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      {/* Header Realtime */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary animate-pulse" />
          <h3 className="text-sm font-semibold text-foreground">BÀN ĐẤU REALTIME CHIẾN THUẬT</h3>
        </div>
        <Pill tone={isLive ? 'success' : 'neutral'} dot>
          {isLive ? 'Live Stream' : 'Đang chờ hiệp'}
        </Pill>
      </div>

      {/* Bàn cờ 9×9 Realtime */}
      <div className="mx-auto w-full max-w-[440px] rounded-xl border border-border bg-card p-2 shadow-inner">
        <div className="grid grid-cols-9 gap-1">
          {Array.from({ length: 81 }).map((_, idx) => {
            const r = Math.floor(idx / 9)
            const c = idx % 9
            const isBaseRed = r === 0 && c === 8
            const isBaseBlue = r === 8 && c === 0

            // Sample simulated dynamic pieces
            const isRed = (r === 7 && c === 4) || (r === 6 && c === 2) || (step > 4 && r === 4 && c === 4)
            const isBlue = (r === 1 && c === 4) || (r === 2 && c === 6) || (step > 2 && r === 3 && c === 5)

            return (
              <div
                key={idx}
                className={`relative flex aspect-square items-center justify-center rounded text-[10px] transition ${
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
                  <div className="flex size-6 items-center justify-center rounded-full bg-team-red text-white shadow animate-in zoom-in-75">
                    <WeaponIcon weapon={c % 2 === 0 ? 'rock' : 'scissors'} className="size-3.5" />
                  </div>
                )}
                {isBlue && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-team-blue text-white shadow animate-in zoom-in-75">
                    <WeaponIcon weapon={c % 2 === 0 ? 'paper' : 'rock'} className="size-3.5" />
                  </div>
                )}
                {isBaseRed && !isRed && <span className="text-[8px] font-bold text-team-red">HQ</span>}
                {isBaseBlue && !isBlue && <span className="text-[8px] font-bold text-team-blue">HQ</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Thanh tua nước đi & Tốc độ trận đấu */}
      <div className="rounded-lg border border-border bg-card p-3 sm:p-3.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">🎬 Diễn biến từng nước:</span>
            <span className="font-mono font-bold text-primary">Bước {step} / {maxSteps}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Tốc độ:</span>
            <select
              className="h-7 rounded border border-input bg-secondary px-2 text-[11px] font-semibold outline-none focus:border-primary"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={500}>0.5x (Chậm, 500ms)</option>
              <option value={250}>1.0x (Chuẩn, 250ms)</option>
              <option value={120}>2.0x (Nhanh, 120ms)</option>
              <option value={40}>4.0x (Siêu tốc, 40ms)</option>
            </select>
          </div>
        </div>

        {/* Thanh trượt slider */}
        <div className="my-2.5">
          <input
            type="range"
            min={0}
            max={maxSteps}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
        </div>

        {/* Nút điều khiển */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          <Btn variant="outline" size="sm" onClick={() => setStep(0)} title="Về đầu hiệp">
            <ChevronsLeft className="size-4" />
            <span className="hidden sm:inline">Đầu hiệp</span>
          </Btn>
          <Btn
            variant="outline"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep(Math.max(0, step - 1))}
            title="Lùi 1 nước"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Lùi 1 nước</span>
          </Btn>
          <Btn
            variant={isPlaying ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className="min-w-32"
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            <span>{isPlaying ? 'Tạm Dừng' : 'Chạy Trận Đấu'}</span>
          </Btn>
          <Btn
            variant="outline"
            size="sm"
            disabled={step >= maxSteps}
            onClick={() => setStep(Math.min(maxSteps, step + 1))}
            title="Tiến 1 nước"
          >
            <span className="hidden sm:inline">Tiến 1 nước</span>
            <ChevronRight className="size-4" />
          </Btn>
          <Btn variant="outline" size="sm" onClick={() => setStep(maxSteps)} title="Nhảy tới kết thúc">
            <span className="hidden sm:inline">Cuối hiệp</span>
            <ChevronsRight className="size-4" />
          </Btn>
        </div>
      </div>

      {/* Live Action Card */}
      <div className="rounded-lg border border-border bg-secondary/40 p-3 sm:p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-team-blue opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-team-blue" />
            </span>
            <strong className="text-xs font-semibold text-foreground">Live Action · Hiệp 1</strong>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{step} nước đã đi</span>
        </div>

        <p className="mt-2 font-mono text-xs leading-relaxed text-foreground">{commentary}</p>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-team-red">
            <span className="size-2 rounded-full bg-team-red" />
            <span>Đỏ: <strong>{redCount} quân</strong></span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-team-blue">
            <span>Xanh: <strong>{blueCount} quân</strong></span>
            <span className="size-2 rounded-full bg-team-blue" />
          </div>
        </div>
      </div>
    </Card>
  )
}
