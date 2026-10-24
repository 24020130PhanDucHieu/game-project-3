'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, ShieldCheck } from 'lucide-react'
import { arenaApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export type HumanProof = { human_challenge: string; human_solution: string }

function zeroBits(bytes: Uint8Array) {
  let n = 0
  for (const b of bytes) {
    if (b === 0) { n += 8; continue }
    return n + Math.clz32(b) - 24
  }
  return n
}

/** Tìm số sao cho SHA-256(thử thách:số) có đủ bit 0 đầu; chạy theo lô để không đơ giao diện. */
async function solve(challenge: string, bits: number, cancelled: () => boolean) {
  const enc = new TextEncoder()
  for (let start = 0; start < 50_000_000; start += 512) {
    if (cancelled()) return null
    const batch = await Promise.all(Array.from({ length: 512 }, (_, i) =>
      crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${start + i}`)).then((d) => zeroBits(new Uint8Array(d)) >= bits)))
    const hit = batch.indexOf(true)
    if (hit >= 0) return String(start + hit)
  }
  return null
}

/**
 * Ô “Tôi không phải robot”: tích vào thì trình duyệt giải một bài toán nhỏ do máy chủ phát (dưới 1 giây).
 * Mỗi lời giải chỉ dùng một lần — đổi `resetKey` sau mỗi lần gửi form để tích lại.
 */
export function HumanCheck({ value, onChange, resetKey }: { value: HumanProof | null; onChange: (proof: HumanProof | null) => void; resetKey: number }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const run = useRef(0)
  const expire = useRef<number | undefined>(undefined)

  useEffect(() => {
    run.current++
    window.clearTimeout(expire.current)
    setState('idle')
    onChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])
  useEffect(() => () => { run.current++; window.clearTimeout(expire.current) }, [])
  useEffect(() => { if (!value && state === 'done') setState('idle') }, [value, state])

  async function start() {
    if (state === 'working') return
    if (state === 'done') { onChange(null); setState('idle'); return }
    const mine = ++run.current
    setState('working')
    setError('')
    try {
      const { challenge, difficulty } = await arenaApi.humanChallenge()
      const answer = await solve(challenge, difficulty, () => run.current !== mine)
      if (run.current !== mine) return
      if (!answer) throw new Error('Không xác minh được, hãy thử lại.')
      onChange({ human_challenge: challenge, human_solution: answer })
      setState('done')
      // Thử thách hết hạn sau 3 phút trên máy chủ: tự bỏ tích trước đó.
      expire.current = window.setTimeout(() => { onChange(null); setState('idle') }, 150_000)
    } catch (e) {
      if (run.current !== mine) return
      setState('error')
      setError(e instanceof Error ? e.message : 'Không xác minh được, hãy thử lại.')
    }
  }

  const done = state === 'done' && !!value
  return (
    <div>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label="Tôi không phải robot"
        onClick={() => void start()}
        className={cn('flex h-14 w-full items-center gap-3 rounded-xl border bg-muted/40 px-3.5 text-left transition hover:border-ring', done ? 'border-emerald-500/60' : 'border-input', state === 'error' && 'border-red-500/60')}
      >
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-md border-2 bg-card transition', done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/50')}>
          {state === 'working' ? <Loader2 className="size-4 animate-spin text-primary" /> : done ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        <span className="flex-1 text-[13.5px] font-semibold text-foreground">{state === 'working' ? 'Đang xác minh…' : done ? 'Đã xác minh bạn không phải robot' : 'Tôi không phải robot'}</span>
        <ShieldCheck className={cn('size-5', done ? 'text-emerald-500' : 'text-muted-foreground')} aria-hidden />
      </button>
      {state === 'error' && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
