'use client'

import type { HTMLAttributes } from 'react'
import { usePointerMotion } from '@/lib/interaction-motion'
import { cn } from '@/lib/utils'

export function MotionSurface({ children, className, tilt = false, ...props }: HTMLAttributes<HTMLDivElement> & { tilt?: boolean }) {
  const ref = usePointerMotion<HTMLDivElement>(tilt ? 'tilt' : 'light')
  return <div ref={ref} className={cn('fx-light', tilt && 'fx-tilt', className)} {...props}>{children}</div>
}
