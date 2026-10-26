'use client'

import { useEffect, useRef } from 'react'

/**
 * Khóa cuộn trang khi có hộp thoại/lớp phủ, an toàn khi nhiều lớp lồng nhau:
 * - bộ đếm dùng chung (chỉ khóa khi 0→1, chỉ mở khi về 0) nên không bao giờ kẹt ở overflow:hidden;
 * - ngăn xếp lớp: phím Esc chỉ đóng lớp trên cùng.
 */
const stack: symbol[] = []
const closers = new Map<symbol, () => void>()

function apply() {
  if (typeof document === 'undefined') return
  if (stack.length) document.body.style.overflow = 'hidden'
  else document.body.style.removeProperty('overflow')
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !stack.length) return
  closers.get(stack[stack.length - 1])?.()
}

/** Gọi trong lớp phủ đang mở: khóa cuộn và đăng ký Esc cho lớp này. */
export function useModalLayer(onClose: () => void, active = true) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!active) return
    const id = Symbol('layer')
    if (!stack.length) window.addEventListener('keydown', onKey)
    stack.push(id)
    closers.set(id, () => closeRef.current())
    apply()
    return () => {
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      closers.delete(id)
      if (!stack.length) window.removeEventListener('keydown', onKey)
      apply()
    }
  }, [active])
}

/** Gỡ khóa mồ côi (không còn lớp phủ nào mà trang vẫn bị khóa), dùng khi đổi màn hình. */
export function releaseOrphanLock() {
  if (typeof document !== 'undefined' && !stack.length && document.body.style.overflow === 'hidden') document.body.style.removeProperty('overflow')
}
