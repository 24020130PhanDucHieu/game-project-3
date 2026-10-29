'use client'

import type { ComponentPropsWithoutRef } from 'react'
import { usePointerMotion } from '@/lib/interaction-motion'
import { useFx } from '@/lib/fx'
import { useReducedMotion } from '@/lib/motion'
import './motion-banner.css'

/** Move decorative layers, keeping selectors and action buttons stationary. */
export function MotionBanner({ children, className = '', ...props }: ComponentPropsWithoutRef<'section'>) {
  const [fx] = useFx()
  const reduced = useReducedMotion()
  const enabled = fx === 'full' && !reduced
  const ref = usePointerMotion<HTMLElement>(enabled ? 'tilt' : 'none')
  return <section {...props} ref={ref} className={`motion-banner ${className}`} data-motion={enabled ? 'on' : 'off'}>
    {children}
  </section>
}
