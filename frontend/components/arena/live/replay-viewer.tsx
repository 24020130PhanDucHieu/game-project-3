'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, X } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { useResource } from '@/lib/cache'
import { decodeRule, stamp } from '@/lib/format'
import { Badge, Button, ErrorNote, Skeleton, SkeletonRows } from './ui'
import { useLive } from './context'
import { BoardPlayer } from './board'
import { SnapshotPanel } from './snapshot-panel'
import { RoundLog } from './round-log'
import { TaskRoundResult } from './views/ai-cup/task-round'

const CodeEditor = dynamic(() => import('./code-editor'), { ssr: false, loading: () => <Skeleton className="h-[60vh] w-full rounded-xl" /> })

/** Cửa sổ phủ toàn màn hình: Esc hoặc bấm nền để đóng, khóa cuộn trang phía sau. */
export function Overlay({ title, subtitle, onClose, children, actions }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  // Render thẳng vào <body>: nếu nằm trong thẻ có transform (hiệu ứng), `fixed` sẽ bị bó trong thẻ đó.
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-stretch justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Cửa sổ'} className="animate-fade-up flex w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-5 py-3">
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-extrabold">{title}</h2>{subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}</div>
          {actions}
          <Button variant="ghost" size="sm" aria-label="Đóng (Esc)" onClick={onClose}><X className="size-5" /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Xem mã nguồn một bài nộp, tô màu bằng cùng trình soạn CodeMirror (chỉ đọc). */
export function CodeViewer({ submission, onClose }: { submission: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Overlay
      title={`Mã nguồn · ${submission.team_name || 'Bài nộp'}`}
      subtitle={`${submission.round_number ? `Hiệp ${submission.round_number} · ` : ""}${submission.language} · ${stamp(submission.submitted_at)}`}
      onClose={onClose}
      actions={<Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(submission.code || '').then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }) }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? 'Đã chép' : 'Sao chép'}</Button>}
    >
      <div className="space-y-3">
        {submission.explanation && <p className="rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-2 text-sm"><strong>Ghi chú chiến thuật:</strong> {submission.explanation}</p>}
        {submission.error_message && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-xs text-red-700 dark:text-red-300">{submission.error_message}</p>}
        <CodeEditor value={submission.code || ''} onChange={() => undefined} language={submission.language === 'CPP' ? 'CPP' : 'PYTHON'} readOnly minHeight={Math.min(720, Math.max(320, (String(submission.code || '').split('\n').length + 2) * 22))} />
      </div>
    </Overlay>
  )
}

/** Xem lại một hiệp: bàn cờ lớn (2D/3D), camera hai đội, kết quả và nhật ký. */
export function ReplayViewer({ tournamentId, matchId, match, round, onClose, onRound }: { tournamentId: string; matchId: string; match: any; round: number; onClose: () => void; onRound?: (n: number) => void }) {
  const { scope } = useLive()
  const rounds: any[] = match.rounds_history || []
  const replay = useResource<any>(`replay:${scope}:${tournamentId}:${matchId}:${round}:${rounds.length}`, () => arenaApi.getRoundReplay(tournamentId, matchId, round), { ttl: 60_000 })
  const data = replay.data
  const logs: string[] = [...(data?.system_logs || []), ...(data?.move_logs || []).map((l: any) => l.log || l)].map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))
  return (
    <Overlay
      title={`Replay · ${match.title || matchId} · Hiệp ${round}`}
      subtitle={`${match.team_a?.team_name || 'Đội Đỏ'} vs ${match.team_b?.team_name || 'Đội Xanh'}`}
      onClose={onClose}
      actions={onRound && rounds.length > 1 ? (
        <div className="flex gap-1">{rounds.map((r, i) => { const n = Number(r.round_number || i + 1); return <Button key={n} size="sm" variant={n === round ? 'primary' : 'secondary'} onClick={() => onRound(n)}>H{n}</Button> })}</div>
      ) : undefined}
    >
      {replay.loading ? <SkeletonRows rows={6} /> : replay.error && !data ? <ErrorNote message={replay.error.message} onRetry={() => void replay.reload()} /> : data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          {data.round_kind === 'TASK'
            ? <TaskRoundResult data={data} redName={data.team_a_name || match.team_a?.team_name || 'Đội Đỏ'} blueName={data.team_b_name || match.team_b?.team_name || 'Đội Xanh'} />
            : <BoardPlayer steps={data.board_steps || []} autoPlay size="xl" redName={data.team_a_name || match.team_a?.team_name} blueName={data.team_b_name || match.team_b?.team_name} />}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">Kết quả hiệp {data.round_number}</p>
              <p className="font-display mt-1 text-xl font-extrabold">{data.winner_name}</p>
              <p className="text-sm text-muted-foreground">{data.win_reason}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{data.round_kind === 'TASK' ? <Badge tone="accent">Đề ML</Badge> : decodeRule(data.stage_rule).active.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
            </div>
            {data.round_kind !== 'TASK' && <SnapshotPanel tournamentId={tournamentId} matchId={matchId} round={round} redName={data.team_a_name || match.team_a?.team_name || 'Đội Đỏ'} blueName={data.team_b_name || match.team_b?.team_name || 'Đội Xanh'} />}
            {data.round_kind !== 'TASK' && <RoundLog logs={logs} redName={data.team_a_name || match.team_a?.team_name || 'Đội Đỏ'} blueName={data.team_b_name || match.team_b?.team_name || 'Đội Xanh'} defaultOpen maxHeight="max-h-80" />}
          </div>
        </div>
      )}
    </Overlay>
  )
}
