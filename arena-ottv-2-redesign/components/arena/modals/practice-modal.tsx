'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Play, RotateCcw, Square, Swords } from 'lucide-react'
import { RED_BASE, beats, weaponLabel, type Piece, type Weapon } from '@/lib/arena-data'
import { Btn, Modal, Notice, Pill, SelectField, WeaponIcon } from '../primitives'

export type BossType = 'RANDOM' | 'AGGRESSIVE' | 'ADAPTIVE'

const initialPracticePieces: Piece[] = [
  // Đội Đỏ (Thí sinh) - Hàng 7
  { id: 'p-red-1', team: 'red', weapon: 'rock', row: 7, col: 1 },
  { id: 'p-red-2', team: 'red', weapon: 'paper', row: 7, col: 4 },
  { id: 'p-red-3', team: 'red', weapon: 'scissors', row: 7, col: 7 },
  // Đội Xanh (Boss BTC) - Hàng 1
  { id: 'p-blue-1', team: 'blue', weapon: 'rock', row: 1, col: 1 },
  { id: 'p-blue-2', team: 'blue', weapon: 'paper', row: 1, col: 4 },
  { id: 'p-blue-3', team: 'blue', weapon: 'scissors', row: 1, col: 7 },
]

export function PracticeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [boss, setBoss] = useState<BossType>('RANDOM')
  const [pieces, setPieces] = useState<Piece[]>(initialPracticePieces)
  const [running, setRunning] = useState(false)
  const [turn, setTurn] = useState(0)
  const [commentary, setCommentary] = useState('Sẵn sàng kiểm thử thuật toán với Boss BTC trên bàn cờ 9×9.')
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  function resetBoard() {
    if (timerRef.current) clearInterval(timerRef.current)
    setRunning(false)
    setPieces(initialPracticePieces)
    setTurn(0)
    setCommentary('Đã đặt lại bàn cờ thử nghiệm về trạng thái ban đầu.')
  }

  function simulateStep() {
    setPieces((prev) => {
      // Pick random red piece and move forward
      const redPieces = prev.filter((p) => p.team === 'red')
      const bluePieces = prev.filter((p) => p.team === 'blue')
      if (redPieces.length === 0 || bluePieces.length === 0) {
        setRunning(false)
        setCommentary(
          redPieces.length > 0
            ? '🎉 Bot của bạn đã tiêu diệt toàn bộ quân Boss BTC!'
            : '💀 Boss BTC đã tiêu diệt toàn bộ quân của bạn!',
        )
        return prev
      }

      const pRed = redPieces[Math.floor(Math.random() * redPieces.length)]
      const targetRow = Math.max(0, pRed.row - 1)
      const targetCol = pRed.col

      // Check collision
      const enemy = bluePieces.find((b) => b.row === targetRow && b.col === targetCol)
      if (enemy) {
        if (beats[pRed.weapon] === enemy.weapon) {
          setCommentary(`Nước ${turn + 1}: Bot của bạn (${weaponLabel[pRed.weapon]}) tiêu diệt ${weaponLabel[enemy.weapon]} của Boss!`)
          return prev.filter((p) => p.id !== enemy.id).map((p) => (p.id === pRed.id ? { ...p, row: targetRow } : p))
        } else {
          setCommentary(`Nước ${turn + 1}: Boss (${weaponLabel[enemy.weapon]}) phản đòn hạ ${weaponLabel[pRed.weapon]} của bạn!`)
          return prev.filter((p) => p.id !== pRed.id)
        }
      }

      setCommentary(`Nước ${turn + 1}: Bot của bạn điều quân ${weaponLabel[pRed.weapon]} tiến lên [${targetRow}, ${targetCol}].`)
      return prev.map((p) => (p.id === pRed.id ? { ...p, row: targetRow } : p))
    })
    setTurn((t) => t + 1)
  }

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(simulateStep, 700)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [running, turn])

  return (
    <Modal
      open={open}
      onClose={() => {
        resetBoard()
        onClose()
      }}
      title="Đấu Thử Nghiệm Với Bot BTC"
      description="Kiểm tra chiến thuật di chuyển và ăn quân trên bàn cờ 9×9 trong môi trường sandbox biệt lập."
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Thanh điều khiển Boss */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Chọn đối thủ Boss:</span>
            <select
              className="h-8 rounded-md border border-input bg-card px-2.5 text-xs font-medium outline-none focus:border-primary"
              value={boss}
              onChange={(e) => setBoss(e.target.value as BossType)}
              disabled={running}
            >
              <option value="RANDOM">Boss 1: Random Bot (Đi ngẫu nhiên)</option>
              <option value="AGGRESSIVE">Boss 2: Aggressive Bot (Tấn công dồn dập)</option>
              <option value="ADAPTIVE">Boss 3: Adaptive Counter (Khắc chế theo lịch sử)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Btn
              variant={running ? 'outline' : 'primary'}
              size="sm"
              onClick={() => setRunning(!running)}
            >
              {running ? <Square className="size-3.5 text-destructive" /> : <Play className="size-3.5" />}
              {running ? 'Tạm Dừng' : 'Chạy Mô Phỏng'}
            </Btn>
            <Btn variant="outline" size="sm" onClick={resetBoard}>
              <RotateCcw className="size-3.5" />
              Đặt Lại Bàn
            </Btn>
          </div>
        </div>

        {/* Thanh trạng thái 2 đội */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-team-red" />
            <strong className="text-team-red">Bot của bạn (Đỏ)</strong>
            <span className="font-mono text-muted-foreground">({pieces.filter((p) => p.team === 'red').length} quân)</span>
          </div>
          <Pill tone="neutral" className="font-mono text-[11px]">
            BƯỚC #{turn}
          </Pill>
          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground">({pieces.filter((p) => p.team === 'blue').length} quân)</span>
            <strong className="text-team-blue">Boss BTC (Xanh)</strong>
            <span className="size-2.5 rounded-full bg-team-blue" />
          </div>
        </div>

        {/* Bàn cờ 9×9 thu gọn */}
        <div className="mx-auto w-full max-w-[420px] rounded-xl border border-border bg-card p-2 shadow-inner">
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: 81 }).map((_, idx) => {
              const r = Math.floor(idx / 9)
              const c = idx % 9
              const piece = pieces.find((p) => p.row === r && p.col === c)
              const isBaseRed = r === 0 && c === 8
              const isBaseBlue = r === 8 && c === 0

              return (
                <div
                  key={idx}
                  className={`relative flex aspect-square items-center justify-center rounded transition text-[10px] ${
                    isBaseRed
                      ? 'border border-dashed border-team-red bg-team-red/10'
                      : isBaseBlue
                        ? 'border border-dashed border-team-blue bg-team-blue/10'
                        : (r + c) % 2 === 0
                          ? 'bg-secondary/40'
                          : 'bg-card'
                  }`}
                >
                  {piece && (
                    <div
                      className={`flex size-6 items-center justify-center rounded-full text-white shadow-sm ${
                        piece.team === 'red' ? 'bg-team-red' : 'bg-team-blue'
                      }`}
                      title={`${piece.team === 'red' ? 'Đỏ' : 'Xanh'} - ${weaponLabel[piece.weapon]}`}
                    >
                      <WeaponIcon weapon={piece.weapon} className="size-3.5" />
                    </div>
                  )}
                  {isBaseRed && !piece && <span className="text-[8px] font-bold text-team-red">HQ</span>}
                  {isBaseBlue && !piece && <span className="text-[8px] font-bold text-team-blue">HQ</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Live Commentary */}
        <div className="rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5 font-mono text-xs text-foreground">
          <span className="mr-2 inline-block size-2 animate-ping rounded-full bg-primary" />
          {commentary}
        </div>

        <Notice tone="neutral">
          Chạy thử không làm thay đổi điểm ELO, không nộp bài lên máy chủ chính thức. Hãy thử nghiệm để kiểm tra tính ổn định của bot!
        </Notice>
      </div>
    </Modal>
  )
}
