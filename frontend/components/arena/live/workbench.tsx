'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Bot, CloudOff, Download, FileCode2, GitBranch, HardDrive, ShieldCheck, Swords } from 'lucide-react'
import { isBusyError, isNetworkError, offlineEngine } from '@/lib/offline-engine'
import { useOnline } from '@/lib/use-online'
import { arenaApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Badge, Button, Field, Select, Skeleton, TextArea } from './ui'
import { BoardPlayer } from './board'
import { DebugPanel } from './bot-insights'
import { useLive } from './context'

export const PY_TEMPLATE = `def decide_move(game_state: dict) -> str:
    """Trả về 'ROCK', 'PAPER' hoặc 'SCISSORS'."""
    cards = game_state.get("remaining_cards", {})
    for card in ("ROCK", "PAPER", "SCISSORS"):
        if cards.get(card, 0) > 0:
            return card
    return "ROCK"
`

export const CPP_TEMPLATE = `#include <iostream>
#include <string>

int main() {
    std::string state;
    std::getline(std::cin, state);  // JSON trạng thái trận
    std::cout << "ROCK" << std::endl;
    return 0;
}
`

const CodeEditor = dynamic(() => import('./code-editor'), {
  ssr: false,
  loading: () => <Skeleton className="h-[340px] w-full rounded-xl" />,
})

const MAX_BYTES = 64 * 1024

export type WorkbenchValue = { code: string; language: 'PYTHON' | 'CPP'; explanation: string; commit?: { url: string; sha: string } }

/**
 * Khung soạn bot dùng chung cho nộp bài trận, nộp bài vòng loại và đấu thử boss.
 * Bản nháp lưu trong localStorage theo draftKey để không mất khi tải lại trang.
 */
const PRACTICE_RULES: [string, string][] = [['STAGE_1_STANDARD', 'Luật chuẩn'], ['COMBO_1', 'Trộn quân'], ['COMBO_2', 'Đảo tương khắc'], ['COMBO_4', 'Sương mù'], ['COMBO_16', 'Chướng ngại ngẫu nhiên'], ['COMBO_7', 'Cả ba luật']]

export function Workbench({ draftKey, ruleId, withExplanation, submitLabel, onSubmit, submitting, submitDisabledReason, extra, practice = true, renderActions }: {
  draftKey: string
  ruleId?: string
  withExplanation?: boolean
  submitLabel?: string
  onSubmit?: (value: WorkbenchValue) => void | Promise<void>
  submitting?: boolean
  submitDisabledReason?: string
  extra?: ReactNode
  practice?: boolean
  /** Nút bổ sung dùng mã đang soạn (giao hữu, thử thách...). */
  renderActions?: (value: WorkbenchValue) => ReactNode
}) {
  const { run, capabilities, toast, role } = useLive()
  const storageKey = `arena.draft.${draftKey}`
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<'PYTHON' | 'CPP'>('PYTHON')
  const [explanation, setExplanation] = useState('')
  const [commit, setCommit] = useState<{ url: string; sha: string } | undefined>()
  const [repo, setRepo] = useState({ url: '', branch: 'main', file: 'bot.py' })
  const [gitOpen, setGitOpen] = useState(false)
  const [boss, setBoss] = useState<'RANDOM' | 'AGGRESSIVE' | 'ADAPTIVE'>('RANDOM')
  const [practiceRule, setPracticeRule] = useState(ruleId || 'STAGE_1_STANDARD')
  useEffect(() => { if (ruleId) setPracticeRule(ruleId) }, [ruleId])
  const [validation, setValidation] = useState<{ ok: boolean; message: string } | null>(null)
  const [practiceResult, setPracticeResult] = useState<any>(null)
  const [working, setWorking] = useState<'validate' | 'practice' | 'fetch' | null>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      setCode(saved?.code || '')
      setLanguage(saved?.language === 'CPP' ? 'CPP' : 'PYTHON')
      setExplanation(saved?.explanation || '')
    } catch {
      setCode('')
    }
    setValidation(null)
    setPracticeResult(null)
    setCommit(undefined)
  }, [storageKey])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ code, language, explanation })) } catch { /* bỏ qua */ }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [storageKey, code, language, explanation])

  const languages = capabilities.data?.languages?.length ? capabilities.data.languages : ['PYTHON', 'CPP']
  const bytes = useMemo(() => new Blob([code]).size, [code])
  const tooLarge = bytes > MAX_BYTES
  const lineCount = code ? code.split('\n').length : 0
  const online = useOnline()
  const offline = useSyncExternalStore(offlineEngine.subscribe, offlineEngine.get, offlineEngine.server)
  // Chạy trên máy không cần đăng nhập; khi mất mạng phiên có thể chưa tải được.
  const canUse = role !== 'GUEST' || !online

  async function validate() {
    setWorking('validate')
    const show = (result: any) => {
      const ok = result?.is_valid !== false && result?.valid !== false && !result?.error_message
      const where = result?.is_offline ? ' (chạy trên máy, offline)' : ''
      setValidation({ ok, message: ok ? `Mã hợp lệ${where}${result?.execution_time_ms !== undefined ? ` · ${result.execution_time_ms} ms` : ''}${result?.test_move ? ` · nước thử: ${result.test_move}` : ''}.` : `${result?.error_message || 'Mã không hợp lệ.'}${where}` })
    }
    try {
      show(online ? await arenaApi.validateCode(code, language, ruleId) : await offlineEngine.validate(code, language, ruleId))
    } catch (e) {
      if (online && (isNetworkError(e) || (isBusyError(e) && language === 'PYTHON'))) {
        if (isBusyError(e)) toast('info', 'Máy chấm đang bận — chạy thử ngay trên máy của bạn (kết quả giống máy chủ, không tính vào giải).')
        try { show(await offlineEngine.validate(code, language, ruleId)) } catch (inner) { setValidation({ ok: false, message: inner instanceof Error ? inner.message : 'Không kiểm tra được mã.' }) }
      } else setValidation({ ok: false, message: e instanceof Error ? e.message : 'Không kiểm tra được mã.' })
    } finally { setWorking(null) }
  }

  async function runPractice() {
    setWorking('practice')
    setPracticeResult(null)
    try {
      setPracticeResult(online ? await arenaApi.practiceBot({ code_content: code, language, boss, side: 'team_a', rule_id: practiceRule }) : await offlineEngine.practice(code, language, boss, practiceRule))
    } catch (e) {
      if (online && (isNetworkError(e) || (isBusyError(e) && language === 'PYTHON'))) {
        if (isBusyError(e)) toast('info', 'Máy chấm đang bận — chạy thử ngay trên máy của bạn (kết quả giống máy chủ, không tính vào giải).')
        try { setPracticeResult(await offlineEngine.practice(code, language, boss, practiceRule)); return } catch (inner) { e = inner }
      }
      toast('error', e instanceof Error ? e.message : 'Không chạy thử được')
    } finally { setWorking(null) }
  }

  async function fetchGit() {
    setWorking('fetch')
    try {
      const result: any = await arenaApi.fetchGitHub(repo.url, repo.branch, repo.file)
      setCode(result.code || '')
      setLanguage(result.language === 'CPP' ? 'CPP' : 'PYTHON')
      setCommit(result.commit_sha ? { url: result.repo_url || repo.url, sha: result.commit_sha } : undefined)
      toast('success', `Đã tải mã từ GitHub${result.commit_sha ? ` (commit ${result.commit_sha})` : ''}`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Không tải được GitHub')
    } finally { setWorking(null) }
  }

  const steps = practiceResult?.board_steps as any[] | undefined

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
        <Select label="Ngôn ngữ" value={language} onChange={(e) => setLanguage(e.target.value as 'PYTHON' | 'CPP')}>
          {languages.includes('PYTHON') && <option value="PYTHON">Python</option>}
          {languages.includes('CPP') && <option value="CPP">C++ (WASI)</option>}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setCode(language === 'CPP' ? CPP_TEMPLATE : PY_TEMPLATE); setCommit(undefined) }}><FileCode2 className="size-3.5" />Nạp mã mẫu</Button>
          <Button size="sm" variant="secondary" onClick={() => setGitOpen((v) => !v)} aria-expanded={gitOpen}><GitBranch className="size-3.5" />Lấy từ GitHub</Button>
        </div>
      </div>

      {gitOpen && (
        <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="Repository" placeholder="https://github.com/user/repo" value={repo.url} onChange={(e) => setRepo({ ...repo, url: e.target.value })} />
          <Field label="Nhánh" value={repo.branch} onChange={(e) => setRepo({ ...repo, branch: e.target.value })} />
          <Field label="File" value={repo.file} onChange={(e) => setRepo({ ...repo, file: e.target.value })} />
          <Button size="md" variant="secondary" loading={working === 'fetch'} disabled={!repo.url || !canUse} onClick={() => void fetchGit()}>Tải</Button>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground">Mã nguồn bot</label>
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400/80" /><span className="size-2.5 rounded-full bg-amber-400/80" /><span className="size-2.5 rounded-full bg-emerald-400/80" />
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-2"><FileCode2 className="size-3.5 text-primary" />{language === 'CPP' ? 'bot.cpp' : 'bot.py'}</span>
            <span className="tabular-nums">Dòng {cursor.line}, cột {cursor.col}</span>
          </div>
          <CodeEditor
            value={code}
            language={language}
            invalid={tooLarge}
            placeholder={language === 'CPP' ? '// Viết mã bot C++ ở đây — bấm “Nạp mã mẫu” để bắt đầu' : '# Viết mã bot Python ở đây — bấm “Nạp mã mẫu” để bắt đầu'}
            onCursor={(line, col) => setCursor({ line, col })}
            onChange={(next) => { setCode(next); setValidation(null); if (commit) setCommit(undefined) }}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{lineCount} dòng · {(bytes / 1024).toFixed(1)} / 64 KB · bản nháp tự lưu trên thiết bị</span>
          {commit && <Badge tone="info">GitHub · {commit.sha}</Badge>}
          {tooLarge && <Badge tone="danger">Vượt giới hạn 64 KB</Badge>}
        </div>
      </div>

      {withExplanation && (
        <TextArea label="Giải thích thay đổi chiến thuật (tùy chọn, tối đa 2.000 ký tự)" rows={3} maxLength={2000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      )}

      {validation && (
        <div role="status" className={cn('rounded-xl border px-3 py-2 text-sm', validation.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300')}>
          {validation.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onSubmit && (
          <Button
            loading={submitting}
            disabled={!code.trim() || tooLarge || !!submitDisabledReason}
            title={submitDisabledReason}
            onClick={() => void onSubmit({ code, language, explanation, commit })}
          ><Swords className="size-4" />{submitLabel || 'Nộp bài'}</Button>
        )}
        <Button variant="secondary" loading={working === 'validate'} disabled={!canUse || !code.trim() || tooLarge} onClick={() => void validate()}><ShieldCheck className="size-4" />Kiểm tra mã</Button>
        {practice && (
          <>
            <Select value={boss} onChange={(e) => setBoss(e.target.value as typeof boss)} aria-label="Chọn boss" className="w-40">
              <option value="RANDOM">Boss ngẫu nhiên</option>
              <option value="AGGRESSIVE">Boss tấn công</option>
              <option value="ADAPTIVE">Boss thích ứng</option>
            </Select>
            <Select value={practiceRule} onChange={(e) => setPracticeRule(e.target.value)} aria-label="Luật đấu thử" className="w-40">
              {PRACTICE_RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {ruleId && !PRACTICE_RULES.some(([v]) => v === ruleId) && <option value={ruleId}>Luật vòng hiện tại</option>}
            </Select>
            <Button variant="secondary" loading={working === 'practice'} disabled={!canUse || !code.trim() || tooLarge} onClick={() => void runPractice()}><Bot className="size-4" />Đấu thử</Button>
          </>
        )}
        {renderActions?.({ code, language, explanation, commit })}
      </div>
      {!canUse && <p className="text-xs text-muted-foreground">Đăng nhập để kiểm tra mã và đấu thử boss.</p>}
      <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', online ? 'border-border bg-muted/30 text-muted-foreground' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200')}>
        {online ? <HardDrive className="size-3.5" /> : <CloudOff className="size-3.5" />}
        <span className="min-w-0 flex-1">
          {!online ? (offline.status === 'ready' ? 'Đang mất mạng — “Kiểm tra mã” và “Đấu thử” chạy ngay trên máy bằng engine offline (chỉ Python).' : 'Đang mất mạng và chưa tải gói offline — hãy tải khi có mạng để luyện tập offline.')
            : offline.status === 'ready' ? `Gói chạy offline đã sẵn sàng${offline.version ? ` (engine ${offline.version})` : ''}: mất mạng vẫn kiểm tra mã và đấu thử boss được.`
            : offline.status === 'loading' ? 'Đang tải gói chạy offline (~10 MB, chỉ tải một lần)…'
            : offline.status === 'error' ? `Chưa tải được gói offline: ${offline.error}`
            : 'Tải trước gói chạy offline để vẫn kiểm tra mã và đấu thử boss khi mất mạng.'}
        </span>
        {online && offline.status !== 'ready' && <Button size="sm" variant="secondary" loading={offline.status === 'loading'} onClick={() => void offlineEngine.prepare()}><Download className="size-3.5" />Tải gói offline</Button>}
      </div>
      {submitDisabledReason && <p className="text-xs text-amber-700 dark:text-amber-300">{submitDisabledReason}</p>}
      {extra}

      {practiceResult && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Kết quả đấu thử (không tính vào giải){practiceResult.is_offline && <Badge tone="warning" className="ml-2">Chạy trên máy · offline</Badge>}</h3>
            <Badge tone={practiceResult.winner === 'team_a' ? 'success' : 'warning'}>{practiceResult.winner === 'team_a' ? 'Bot của bạn thắng' : practiceResult.winner === 'team_b' ? 'Boss thắng' : 'Hòa'}</Badge>
          </div>
          {practiceResult.win_reason && <p className="text-sm text-muted-foreground">{practiceResult.win_reason}</p>}
          {steps?.length ? <BoardPlayer steps={steps} autoPlay redName="Bot của bạn" blueName="Boss" /> : null}
          <DebugPanel steps={steps || []} ruleId={practiceResult.rule_id || practiceRule} botError={practiceResult.bot_errors?.team_a ?? practiceResult.simulation?.bot_errors?.team_a} />
        </div>
      )}
    </div>
  )
}
