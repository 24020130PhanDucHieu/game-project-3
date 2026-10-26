'use client'

import { useEffect, useState } from 'react'

/** Người dùng chọn giảm chuyển động trong hệ điều hành: mọi hiệu ứng chạy bằng JS phải tắt. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    try {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReduced(query.matches)
      const on = () => setReduced(query.matches)
      query.addEventListener('change', on)
      return () => query.removeEventListener('change', on)
    } catch { /* bỏ qua */ }
  }, [])
  return reduced
}

/** Số chạy từ 0 lên giá trị thật (ease-out); đổi giá trị thì chạy từ giá trị đang hiện. */
export function useCountUp(target: number, reduced: boolean, ms = 700) {
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setValue(target); return }
    let frame = 0
    const from = value
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms)
      setValue(from + (target - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced, ms])
  return value
}
