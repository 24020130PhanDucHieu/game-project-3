'use client'

import { useState } from 'react'
import {
  Clock,
  CodeXml,
  Download,
  GitBranch,
  Lock,
  PenLine,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { GithubIcon } from './primitives'
import { cn } from '@/lib/utils'

export function QualifierView() {
  const [mode, setMode] = useState<'github' | 'ide'>('github')
  const [repoUrl, setRepoUrl] = useState('https://github.com/ap-k69/arena-bot')
  const [branch, setBranch] = useState('main')
  const [filePath, setFilePath] = useState('bot.py')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const [code, setCode] = useState(`# BOT K69 ARENA OTTV2 - TEMPLATE
# Chiến thuật cơ bản: Đọc bàn cờ và in nước đi
import sys

def choose_move(board_state):
    # Logic chọn nước đi theo luật Đảo tương khắc
    return "ROCK"

if __name__ == "__main__":
    line = sys.stdin.readline()
    print(choose_move(line))
`)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)

  function handleDownloadTemplate() {
    setMode('ide')
    alert('Đã nạp mẫu khung bot Python vào Web IDE bên dưới!')
  }

  function handleSyncGitHub(e: React.FormEvent) {
    e.preventDefault()
    setSyncing(true)
    setSyncStatus('Đang kéo mã nguồn từ kho GitHub...')
    setTimeout(() => {
      setSyncing(false)
      setSyncStatus(`Đã nạp commit 4f98d1a mới nhất từ ${branch}. Mã nguồn đã sẵn sàng!`)
    }, 1000)
  }

  function handleSubmitBot(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setSubmitMsg('Nộp bài vòng loại thành công! Mã hash: sha256_e49b81.')
    }, 800)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header matching Image 5 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0f172a] sm:text-3xl">
            Vòng loại
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Nộp bot để thi đấu vòng tròn tính ELO. Top 8 đội có ELO cao nhất sẽ vào Tứ Kết.
          </p>
        </div>

        {/* Status badges matching Image 5 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f1f5f9] px-3.5 py-1.5 text-xs font-semibold text-[#475569]">
            <Lock className="size-3.5" />
            Bài đã khóa
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce2ff] bg-[#eff2ff] px-3.5 py-1.5 text-xs font-semibold text-[#434be6]">
            <TrendingUp className="size-3.5" />
            ELO 1184.00
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fef9ee] px-3.5 py-1.5 text-xs font-semibold text-[#b45309]">
            <Clock className="size-3.5" />
            Hạn 00:32:00 23/10/2026
          </span>
        </div>
      </div>

      {/* 3 Steps Cards Grid matching Image 5 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Step 1 */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#eff2ff] text-[#434be6]">
                <Download className="size-5" />
              </div>
              <span className="font-mono text-sm font-bold text-[#94a3b8]">01</span>
            </div>
            <h3 className="text-base font-bold text-[#0f172a]">
              Bước 1: Lấy mẫu Bot
            </h3>
            <p className="mt-1.5 text-xs text-[#64748b] leading-relaxed">
              Tải bộ khung bot Python hoặc C++ có sẵn hàm đọc trạng thái bàn cờ và in nước đi.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="mt-5 inline-flex h-9.5 items-center gap-2 self-start rounded-xl border border-[#cbd5e1] bg-white px-3.5 text-xs font-semibold text-[#1e293b] transition hover:bg-[#f8fafc] hover:border-[#94a3b8]"
          >
            <Download className="size-3.5" />
            Tải bot mẫu
          </button>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#eff2ff] text-[#434be6]">
              <PenLine className="size-5" />
            </div>
            <span className="font-mono text-sm font-bold text-[#94a3b8]">02</span>
          </div>
          <h3 className="text-base font-bold text-[#0f172a]">
            Bước 2: Viết chiến thuật
          </h3>
          <p className="mt-1.5 text-xs text-[#64748b] leading-relaxed">
            Cài đặt logic chọn nước đi theo luật Đảo tương khắc. Kiểm tra cục bộ với bộ test mẫu.
          </p>
        </div>

        {/* Step 3 */}
        <div className="flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#eff2ff] text-[#434be6]">
              <RefreshCw className="size-5" />
            </div>
            <span className="font-mono text-sm font-bold text-[#94a3b8]">03</span>
          </div>
          <h3 className="text-base font-bold text-[#0f172a]">
            Bước 3: Đồng bộ &amp; Nộp
          </h3>
          <p className="mt-1.5 text-xs text-[#64748b] leading-relaxed">
            Đẩy mã lên GitHub rồi đồng bộ, hoặc dán trực tiếp vào Web IDE bên dưới để nộp.
          </p>
        </div>
      </div>

      {/* Submission Card matching Image 5 */}
      <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 sm:p-7 shadow-sm">
        <div>
          <h2 className="text-lg font-extrabold text-[#0f172a]">
            Nộp bài vòng loại
          </h2>
          <p className="mt-0.5 text-xs text-[#64748b]">
            Bản nộp mới nhất trước hạn sẽ được dùng để tính ELO.
          </p>
        </div>

        {/* Mode Switcher Pills */}
        <div className="mt-5 inline-flex rounded-xl bg-[#f1f5f9] p-1 gap-1" role="tablist">
          <button
            type="button"
            onClick={() => setMode('github')}
            className={cn(
              'flex h-9.5 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition',
              mode === 'github'
                ? 'bg-white text-[#0f172a] shadow-sm'
                : 'text-[#64748b] hover:text-[#0f172a]',
            )}
          >
            <GithubIcon className="size-4" />
            Nộp qua GitHub (Khuyên dùng)
          </button>

          <button
            type="button"
            onClick={() => setMode('ide')}
            className={cn(
              'flex h-9.5 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition',
              mode === 'ide'
                ? 'bg-white text-[#0f172a] shadow-sm'
                : 'text-[#64748b] hover:text-[#0f172a]',
            )}
          >
            <CodeXml className="size-4" />
            Nộp trực tiếp (Web IDE / File)
          </button>
        </div>

        {/* Mode: GitHub */}
        {mode === 'github' && (
          <form onSubmit={handleSyncGitHub} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#1e293b]">
                GitHub Repository URL
              </label>
              <div className="flex h-11 items-center rounded-xl border border-[#cbd5e1] bg-white px-3.5 transition focus-within:border-[#434be6] focus-within:ring-2 focus-within:ring-[#434be6]/15">
                <span className="text-xs text-[#94a3b8] mr-2">🔗</span>
                <input
                  type="url"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/ap-k69/arena-bot"
                  className="w-full border-none bg-transparent font-mono text-xs text-[#0f172a] outline-none"
                />
              </div>
              <span className="text-[11px] text-[#64748b]">
                Repository công khai hoặc đã cấp quyền cho tài khoản arena-bot.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#1e293b]">Branch</label>
                <div className="flex h-10 items-center rounded-xl border border-[#cbd5e1] bg-white px-3.5 focus-within:border-[#434be6]">
                  <GitBranch className="size-3.5 text-[#94a3b8] mr-2" />
                  <input
                    type="text"
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full border-none bg-transparent font-mono text-xs text-[#0f172a] outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#1e293b]">
                  Đường dẫn file bot
                </label>
                <div className="flex h-10 items-center rounded-xl border border-[#cbd5e1] bg-white px-3.5 focus-within:border-[#434be6]">
                  <input
                    type="text"
                    required
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="bot.py"
                    className="w-full border-none bg-transparent font-mono text-xs text-[#0f172a] outline-none"
                  />
                </div>
              </div>
            </div>

            {syncStatus && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 font-medium">
                {syncStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={syncing}
              className="mt-2 flex h-11 w-fit items-center gap-2 rounded-xl bg-[#434be6] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#343bc8] disabled:opacity-60"
            >
              <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ GitHub & Xác nhận'}
            </button>
          </form>
        )}

        {/* Mode: Web IDE */}
        {mode === 'ide' && (
          <form onSubmit={handleSubmitBot} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#1e293b]">
                  Mã nguồn Bot (Python / C++)
                </label>
                <span className="text-[11px] text-[#64748b]">Python 3.11</span>
              </div>
              <textarea
                rows={10}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-xl border border-[#cbd5e1] bg-[#090e17] p-4 font-mono text-xs text-[#eaf1ff] outline-none focus:border-[#434be6]"
              />
            </div>

            {submitMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 font-medium">
                {submitMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex h-11 w-fit items-center gap-2 rounded-xl bg-[#434be6] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#343bc8] disabled:opacity-60"
            >
              {submitting ? 'Đang kiểm tra & nộp...' : 'Nộp bài trực tiếp'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
