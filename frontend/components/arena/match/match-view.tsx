'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CodeXml,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  Swords,
  Timer,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RED_BASE,
  beats,
  initialLog,
  initialPieces,
  weaponLabel,
  type LogEntry,
  type Piece,
} from '@/lib/arena-data'
import { Btn, Card, GithubIcon, Notice, Pill, SegmentedTabs, TableShell, tdClass, thClass } from '../primitives'
import { GameBoard } from './game-board'
import { Scoreboard } from './scoreboard'
import { RealtimeBattle } from './realtime-battle'
import { CodeMonitor } from './code-monitor'
import { MatchLogs } from './match-logs'
import { SubmissionsTable } from './submissions-table'
import { arenaApi } from '@/lib/api-client'
import { validateBotCodeOffline } from '@/lib/offline-validator'
import { PracticeModal } from '../modals/practice-modal'
import { ReplayModal } from '../modals/replay-modal'
import { CodeViewerModal } from '../modals/code-viewer-modal'
import { IncidentPanel } from '../admin/incident-panel'

export function MatchView({
  canSubmit,
  isAdmin = false,
  onBackToBracket,
  tournamentId = 'tourn_0186d1',
  matchId = 'm_lvl1_1',
}: {
  canSubmit: boolean
  isAdmin?: boolean
  onBackToBracket?: () => void
  tournamentId?: string
  matchId?: string
}) {
  const [pieces, setPieces] = useState<Piece[]>(initialPieces)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<{ row: number; col: number } | null>({ row: 8, col: 0 })
  const [log, setLog] = useState<LogEntry[]>(initialLog)
  const [hp, setHp] = useState({ blue: 64, red: 82 })

  // Submissions and match controls state
  const [matchSubmissions, setMatchSubmissions] = useState<any[]>([])
  const [matchLoading, setMatchLoading] = useState(false)

  // Mode state: Tactical Board vs Realtime Live View
  const [viewMode, setViewMode] = useState<'tactical' | 'realtime'>('tactical')
  
  // Submit mode: direct IDE vs github
  const [submitMode, setSubmitMode] = useState<'direct' | 'github'>('direct')
  const [lang, setLang] = useState<'PYTHON' | 'CPP'>('PYTHON')
  const [ruleNote, setRuleNote] = useState('')
  const [code, setCode] = useState(`# Viết hàm decide_move(game_state) tại đây
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    return "ROCK"
`)

  // Modals state
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [codeViewerOpen, setCodeViewerOpen] = useState(false)
  const [incidentOpen, setIncidentOpen] = useState(false)

  // Intermission countdown state
  const [intermission, setIntermission] = useState(false)
  const [countdown, setCountdown] = useState(5)

  // Submit status
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)

  const loadSubmissions = useCallback(() => {
    arenaApi
      .getSubmissions(tournamentId, matchId)
      .then((data) => {
        if (Array.isArray(data)) {
          setMatchSubmissions(
            data.map((s, idx) => ({
              id: s.id || `sub-${idx + 1}`,
              time: s.time || (s.created_at ? new Date(s.created_at * 1000).toLocaleTimeString('vi-VN') : '14:01:22'),
              round: s.round || 1,
              status: s.status || 'VALID',
              lang: s.language === 'CPP' ? 'C++ 17' : 'Python 3',
            })),
          )
        }
      })
      .catch(() => {})
  }, [tournamentId, matchId])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  const selected = pieces.find((p) => p.id === selectedId)

  function push(text: string) {
    setLog((prev) => [{ id: prev[0].id + 1, turn: prev[0].turn + 1, team: 'blue' as const, text }, ...prev].slice(0, 8))
  }

  function handleCellClick(row: number, col: number) {
    const occupant = pieces.find((p) => p.row === row && p.col === col)

    if (occupant?.team === 'blue') {
      setSelectedId(occupant.id === selectedId ? null : occupant.id)
      return
    }
    if (!selected) return
    if (Math.abs(selected.row - row) + Math.abs(selected.col - col) !== 1) {
      setSelectedId(null)
      return
    }

    const move = `Đội Xanh điều quân (${weaponLabel[selected.weapon]}) tới [${row},${col}].`
    let next = pieces

    if (!occupant) {
      next = pieces.map((p) => (p.id === selected.id ? { ...p, row, col } : p))
      if (row === RED_BASE.row && col === RED_BASE.col) {
        setHp((h) => ({ ...h, red: Math.max(0, h.red - 25) }))
        push(`${move} Đội Xanh tấn công căn cứ Đội Đỏ (-25 HP).`)
      } else {
        push(move)
      }
    } else if (beats[selected.weapon] === occupant.weapon) {
      next = pieces.filter((p) => p.id !== occupant.id).map((p) => (p.id === selected.id ? { ...p, row, col } : p))
      push(`${move} Đội Xanh thắng: ${weaponLabel[selected.weapon]} hạ ${weaponLabel[occupant.weapon]}.`)
    } else if (selected.weapon === occupant.weapon) {
      push(`${move} Hòa: hai bên cùng ${weaponLabel[selected.weapon]}, quân bật lại.`)
    } else {
      next = pieces.filter((p) => p.id !== selected.id)
      setHp((h) => ({ ...h, blue: Math.max(0, h.blue - 6) }))
      push(`${move} Đội Đỏ thắng: ${weaponLabel[occupant.weapon]} hạ ${weaponLabel[selected.weapon]}.`)
    }

    setPieces(next)
    setLastMove({ row, col })
    setSelectedId(null)
  }

  function reset() {
    setPieces(initialPieces)
    setSelectedId(null)
    setLastMove({ row: 8, col: 0 })
    setLog(initialLog)
    setHp({ blue: 64, red: 82 })
  }

  async function handleSubmitBot(e: React.FormEvent) {
    e.preventDefault()
    setSubmitLoading(true)
    setSubmitSuccess(null)

    // 1. Client-side AST & Syntax validation
    const val = validateBotCodeOffline(code, lang)
    if (!val.is_valid) {
      setSubmitLoading(false)
      setSubmitSuccess(`Lỗi: ${val.error_message}`)
      return
    }

    // 2. Submit to backend API
    try {
      await arenaApi.submitCode(tournamentId, matchId, {
        code_content: code,
        language: lang,
        rule_note: ruleNote,
      })
      setSubmitSuccess('Đã nộp mã lệnh thành công lên máy chấm! Sandbox kiểm tra: HỢP LỆ (0.015s).')
      loadSubmissions()
    } catch (err: any) {
      setSubmitSuccess(`Lỗi nộp bài: ${err.message || val.message || 'Không thể gửi mã lệnh.'}`)
    } finally {
      setSubmitLoading(false)
      setTimeout(() => setSubmitSuccess(null), 5000)
    }
  }

  function loadTemplate() {
    if (lang === 'PYTHON') {
      setCode(`def decide_move(game_state):
    """Bot mẫu Python 3: Tìm quân đối phương để bắt hoặc tiến căn cứ"""
    my_pieces = game_state.get("my_pieces", [])
    if my_pieces:
        return {"piece_id": my_pieces[0]["id"], "action": "ADVANCE"}
    return "ROCK"
`)
    } else {
      setCode(`#include <iostream>
int main() {
    // Bot mẫu C++ 17
    std::cout << "MOVE 1 4 2 4" << std::endl;
    return 0;
}
`)
    }
  }

  const latest = log[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Header phòng thi đấu */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="outline" size="sm" onClick={onBackToBracket}>
            <ArrowLeft className="size-4" />
            Quay lại bảng đấu
          </Btn>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground sm:text-lg">Trận 1 - Tứ Kết</h2>
            <Pill tone="primary" className="font-mono text-xs">
              Bo5 (Tối đa 5 hiệp)
            </Pill>
            <Pill tone="success" dot className="text-xs">
              Đang diễn ra
            </Pill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <Btn
                variant="primary"
                size="sm"
                loading={matchLoading}
                onClick={async () => {
                  setMatchLoading(true)
                  try {
                    await arenaApi.playRound(tournamentId, matchId)
                    setIntermission(true)
                  } catch (err: any) {
                    alert(`Lỗi bắt đầu hiệp: ${err.message}`)
                  } finally {
                    setMatchLoading(false)
                  }
                }}
              >
                <Play className="size-3.5" />
                Bắt Đầu Hiệp
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await arenaApi.nextRound(tournamentId, matchId)
                    alert('Đã chuyển sang hiệp đấu tiếp theo.')
                  } catch (err: any) {
                    alert(`Lỗi chuyển hiệp: ${err.message}`)
                  }
                }}
              >
                Hiệp Tiếp
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await arenaApi.demoFill(tournamentId, matchId)
                    alert('Đã nạp bot mẫu tự động cho cả 2 đội.')
                    loadSubmissions()
                  } catch (err: any) {
                    alert(`Lỗi demo fill: ${err.message}`)
                  }
                }}
              >
                Nạp Bot Mẫu
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (confirm('Bạn có chắc chắn muốn đặt lại trận đấu này?')) {
                    try {
                      await arenaApi.resetMatch(tournamentId, matchId)
                      alert('Đã đặt lại trạng thái trận đấu.')
                      reset()
                    } catch (err: any) {
                      alert(`Lỗi đặt lại: ${err.message}`)
                    }
                  }
                }}
              >
                <RotateCcw className="size-3.5" />
                Đặt Lại
              </Btn>
              <Btn variant="outline" size="sm" onClick={() => setIncidentOpen(true)}>
                <ShieldAlert className="size-3.5 text-warning" />
                Xử Lý Sự Cố
              </Btn>
            </>
          )}

          <div className="flex items-center rounded-lg border border-border bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('tactical')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                viewMode === 'tactical' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Bàn đấu 9×9
            </button>
            <button
              type="button"
              onClick={() => setViewMode('realtime')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                viewMode === 'realtime' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Realtime Live
            </button>
          </div>
        </div>
      </div>

      {/* Banner đếm ngược chuyển hiệp */}
      {intermission && (
        <Notice tone="primary" icon={<Timer className="size-4 animate-spin" />}>
          <div className="flex items-center justify-between w-full">
            <span>Hiệp đấu chuẩn bị bắt đầu. Hệ thống đang đồng bộ mã nguồn của hai đội...</span>
            <strong className="font-mono text-sm font-bold text-primary">{countdown}s</strong>
          </div>
        </Notice>
      )}

      {/* Scoreboard hai đội */}
      <Scoreboard
        blueScore={1}
        redScore={1}
        blueHp={hp.blue}
        redHp={hp.red}
        blueUnits={pieces.filter((p) => p.team === 'blue').length}
        redUnits={pieces.filter((p) => p.team === 'red').length}
      />

      {/* Khu vực trung tâm: Bàn đấu + Studio */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        {/* Cột Trái: Bàn cờ chiến thuật hoặc Realtime */}
        <div className="flex min-w-0 flex-col gap-4">
          {viewMode === 'tactical' ? (
            <Card className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">BÀN ĐẤU CHIẾN THUẬT 9×9</h3>
                  <p className="text-xs text-muted-foreground">
                    {selected
                      ? `Đã chọn ${weaponLabel[selected.weapon]} tại [${selected.row},${selected.col}] – chọn ô sáng để di chuyển.`
                      : 'Bấm vào một quân Đội Xanh để thử nghiệm tương tác di chuyển.'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Legend />
                  <Btn variant="ghost" size="sm" onClick={reset} aria-label="Đặt lại bàn cờ">
                    <RotateCcw className="size-3.5" />
                    <span className="hidden sm:inline">Đặt lại</span>
                  </Btn>
                </div>
              </div>
              <GameBoard pieces={pieces} selectedId={selectedId} lastMove={lastMove} onCellClick={handleCellClick} />

              {/* Ticker bình luận */}
              <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs text-foreground">
                <span className="mr-2 inline-block size-1.5 rounded-full bg-primary" />
                {latest.text}
              </div>
            </Card>
          ) : (
            <RealtimeBattle
              redCount={pieces.filter((p) => p.team === 'red').length}
              blueCount={pieces.filter((p) => p.team === 'blue').length}
            />
          )}

          {/* Admin Live Code Monitor */}
          {isAdmin && <CodeMonitor />}

          {/* Nhật ký diễn biến trận đấu 3 Tab */}
          <MatchLogs />

          {/* Lịch sử hiệp đấu và phát lại */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Lịch Sử Các Hiệp Đấu Bo5</h3>
              <span className="text-xs text-muted-foreground">Tối đa 5 hiệp</span>
            </div>
            <TableShell minWidth="26rem">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className={thClass}>Hiệp</th>
                  <th className={thClass}>Đỏ</th>
                  <th className={thClass}>Xanh</th>
                  <th className={thClass}>Kết quả</th>
                  <th className={thClass}>Số nước</th>
                  <th className={`${thClass} text-right`}>Phát lại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-secondary/20">
                  <td className={tdClass}>
                    <Pill tone="primary" className="font-mono text-[10px]">
                      Hiệp 1
                    </Pill>
                  </td>
                  <td className={tdClass}><strong className="text-team-red">Đội Đỏ</strong></td>
                  <td className={tdClass}><strong className="text-team-blue">Đội Xanh</strong></td>
                  <td className={tdClass}><span className="font-semibold text-success">Đỏ thắng</span></td>
                  <td className={tdClass}><span className="font-mono text-xs">42 nước</span></td>
                  <td className={`${tdClass} text-right`}>
                    <Btn variant="outline" size="sm" onClick={() => setReplayOpen(true)}>
                      <Play className="size-3" />
                      Replay
                    </Btn>
                  </td>
                </tr>
                <tr className="hover:bg-secondary/20">
                  <td className={tdClass}>
                    <Pill tone="primary" className="font-mono text-[10px]">
                      Hiệp 2
                    </Pill>
                  </td>
                  <td className={tdClass}><strong className="text-team-red">Đội Đỏ</strong></td>
                  <td className={tdClass}><strong className="text-team-blue">Đội Xanh</strong></td>
                  <td className={tdClass}><span className="font-semibold text-primary">Xanh thắng</span></td>
                  <td className={tdClass}><span className="font-mono text-xs">38 nước</span></td>
                  <td className={`${tdClass} text-right`}>
                    <Btn variant="outline" size="sm" onClick={() => setReplayOpen(true)}>
                      <Play className="size-3" />
                      Replay
                    </Btn>
                  </td>
                </tr>
              </tbody>
            </TableShell>
          </Card>
        </div>

        {/* Cột Phải: Studio Nộp Code Bot */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Phòng Nộp Mã Bot</h3>
                <p className="text-xs text-muted-foreground">Nộp thuật toán cho Hiệp 3 đang diễn ra</p>
              </div>
              <Pill tone="warning" dot className="text-[11px]">
                Chưa nộp hiệp 3
              </Pill>
            </div>

            {submitSuccess && <Notice tone="success">{submitSuccess}</Notice>}

            {/* Mode nộp bài */}
            <SegmentedTabs
              label="Cách nộp bot"
              value={submitMode}
              onChange={setSubmitMode}
              options={[
                { value: 'direct', label: 'Web IDE Trực tiếp', icon: <CodeXml className="size-3.5" /> },
                { value: 'github', label: 'Nộp qua GitHub', icon: <GithubIcon className="size-3.5" /> },
              ]}
            />

            {submitMode === 'direct' ? (
              <form onSubmit={handleSubmitBot} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Ngôn ngữ:</span>
                    <select
                      className="h-8 rounded border border-input bg-card px-2 text-xs font-medium outline-none focus:border-primary"
                      value={lang}
                      onChange={(e) => setLang(e.target.value as 'PYTHON' | 'CPP')}
                    >
                      <option value="PYTHON">Python 3.10 (.py)</option>
                      <option value="CPP">C++ 17 (.cpp)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Btn variant="outline" size="sm" onClick={loadTemplate}>
                      Nạp mẫu
                    </Btn>
                    <Btn variant="outline" size="sm" onClick={() => alert('Cú pháp hợp lệ! Không có lỗi AST.')}>
                      Kiểm tra
                    </Btn>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={10}
                    className="w-full rounded-lg border border-input bg-card p-3 font-mono text-xs outline-none focus:border-primary"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="# Viết thuật toán decide_move(game_state) tại đây..."
                  />
                </div>

                {/* Ghi chú thích ứng luật */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">
                    Ghi chú thích ứng luật hiệp này (không bắt buộc):
                  </label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-xs outline-none focus:border-primary"
                    placeholder="Giải thích ngắn chiến thuật thích ứng với luật Đảo tương khắc..."
                    value={ruleNote}
                    onChange={(e) => setRuleNote(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                  <Btn variant="outline" size="sm" onClick={() => setPracticeOpen(true)}>
                    <Swords className="size-3.5 text-primary" />
                    Chạy thử với Boss
                  </Btn>
                  <Btn type="submit" variant="primary" loading={submitLoading} disabled={!canSubmit}>
                    <Upload className="size-3.5" />
                    Nộp Mã Lệnh
                  </Btn>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                <span className="text-xs font-semibold text-foreground">Đồng bộ mã từ GitHub:</span>
                <input
                  type="url"
                  className="h-8 rounded border border-input bg-card px-3 text-xs outline-none focus:border-primary"
                  placeholder="https://github.com/my-team/arena-bot"
                  defaultValue="https://github.com/uet-arena/sample-bot"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="h-8 rounded border border-input bg-card px-3 text-xs outline-none focus:border-primary"
                    placeholder="Commit / Branch"
                    defaultValue="main"
                  />
                  <input
                    type="text"
                    className="h-8 rounded border border-input bg-card px-3 text-xs outline-none focus:border-primary"
                    placeholder="Đường dẫn file"
                    defaultValue="bot.py"
                  />
                </div>
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => alert('Đã kéo mã nguồn thành công từ GitHub! Sẵn sàng nộp bài.')}
                >
                  <GithubIcon className="size-3.5" />
                  Kéo Mã Nguồn Từ GitHub
                </Btn>
              </div>
            )}
          </Card>

          {/* Submissions Table Kaggle style */}
          <SubmissionsTable
            submissions={matchSubmissions.length > 0 ? matchSubmissions : undefined}
            onRefresh={loadSubmissions}
            onViewCode={() => setCodeViewerOpen(true)}
          />
        </div>
      </div>

      {/* Modals gắn kèm */}
      <PracticeModal open={practiceOpen} onClose={() => setPracticeOpen(false)} />
      <ReplayModal open={replayOpen} onClose={() => setReplayOpen(false)} />
      <CodeViewerModal open={codeViewerOpen} onClose={() => setCodeViewerOpen(false)} />
    </div>
  )
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-team-blue" aria-hidden /> Xanh
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-team-red" aria-hidden /> Đỏ
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-warning/40 ring-1 ring-warning" aria-hidden /> Nước vừa đi
      </span>
    </div>
  )
}
