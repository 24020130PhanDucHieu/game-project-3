'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, ChevronLeft, ChevronRight, Layers, ScanLine } from 'lucide-react'
import { useReducedMotion } from '@/lib/motion'
import { Board } from '../../board'
import { BOARD_THEMES } from '../../board-themes'
import { Button } from '../../ui'

const Board3D = dynamic(() => import('../../board-3d'), { ssr: false, loading: () => <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">Đang dựng bàn cờ 3D…</div> })
const theme = BOARD_THEMES[0]

export function PredictionStage({ step, index, total, side, truth, prediction, error, onIndex }: {
  step: any; index: number; total: number; side: number; truth: string; prediction: string; error?: number; onIndex: (index: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const reduced = useReducedMotion()
  // Người bật "giảm chuyển động" mặc định xem 2D nhưng vẫn tự chọn 3D được.
  const [mode, setMode] = useState<'2d' | '3d'>(reduced ? '2d' : '3d')
  const [unsupported, setUnsupported] = useState(false)
  useEffect(() => { if (reduced) setMode('2d') }, [reduced])
  const fallback = useCallback(() => { setUnsupported(true); setMode('2d') }, [])
  useEffect(() => {
    const el = host.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' })
    observer.observe(el)
    const visibility = () => setTabVisible(document.visibilityState !== 'hidden')
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  const is3d = mode === '3d' && !unsupported
  const matched = truth === prediction
  return <section ref={host} className="overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg" data-testid="prediction-stage">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
      <div><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><ScanLine className="size-4" />Phòng quan sát mô hình</p><h3 className="mt-1 font-display text-lg font-extrabold">Một thế cờ · Hai góc nhìn</h3></div>
      <div className="flex gap-2"><Button size="sm" variant={is3d ? 'secondary' : 'primary'} onClick={() => setMode('2d')} aria-pressed={!is3d}><Layers className="size-3.5" />2D</Button><Button size="sm" variant={is3d ? 'primary' : 'secondary'} onClick={() => { setUnsupported(false); setMode('3d') }} aria-pressed={is3d}><Box className="size-3.5" />3D</Button></div>
    </header>
    <div className="grid items-center gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
      <div className="min-w-0 rounded-2xl border border-border bg-background/60 p-2">
        <div className="flex justify-between gap-2 px-2 pb-2 text-xs text-muted-foreground"><span>Mẫu kiểm tra {index + 1}/{total}</span><span className={side === 0 ? 'text-rose-400' : 'text-sky-400'}>Bên {side === 0 ? 'Đỏ' : 'Xanh'} đang đi</span></div>
        {is3d ? <div className="min-h-80">{visible && tabVisible ? <Board3D step={step} animate={false} theme={theme} camera="free" quality="low" onUnsupported={fallback} /> : <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">Bàn cờ sẽ hiển thị khi bạn xem mục này.</div>}</div> : <div className="mx-auto max-w-lg"><Board step={step} theme={theme} size="md" /></div>}
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">{is3d ? 'Kéo để xoay · Cuộn để phóng to · Bấm quân để quan sát' : 'R: Búa · P: Bao · S: Kéo · J: Joker · ?: quân bị che'}{unsupported ? ' · Máy này dùng chế độ 2D.' : ''}</p>
      </div>
      <div className="space-y-4" aria-live="polite">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">ĐÁP ÁN THẬT</p><p className="mt-2 break-words text-2xl font-extrabold" data-testid="stage-truth">{truth}</p></div>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><p className="text-xs font-semibold text-primary">MÔ HÌNH CỦA BẠN DỰ ĐOÁN</p><p className="mt-2 break-words text-2xl font-extrabold" data-testid="stage-prediction">{prediction}</p></div>
        <p className="rounded-xl bg-background/60 p-3 text-sm">{error !== undefined ? <>Sai số tuyệt đối: <strong>{error.toFixed(3)}</strong>. Càng gần 0 càng tốt.</> : matched ? 'Dự đoán khớp đáp án ở mẫu này.' : 'Dự đoán chưa khớp. Hãy đối chiếu với loại quân, bên đi và luật của đề.'}</p>
        <div className="flex justify-between gap-2"><Button size="sm" variant="secondary" disabled={index <= 0} onClick={() => onIndex(index - 1)}><ChevronLeft className="size-4" />Mẫu trước</Button><Button size="sm" variant="secondary" disabled={index >= total - 1} onClick={() => onIndex(index + 1)}>Mẫu tiếp<ChevronRight className="size-4" /></Button></div>
        <p className="text-xs leading-relaxed text-muted-foreground">Mỗi mẫu là một thế cờ kiểm tra riêng, không phải các bước liên tiếp của một ván. Màu quân thể hiện Đỏ/Xanh; không dùng màu quân để suy ra dự đoán đúng hay sai.</p>
      </div>
    </div>
  </section>
}
