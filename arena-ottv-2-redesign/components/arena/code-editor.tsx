'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export function CodeEditor({
  value,
  onChange,
  filename,
  className,
}: {
  value: string
  onChange: (value: string) => void
  filename: string
  className?: string
}) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = value.split('\n').length

  return (
    <div className={cn('overflow-hidden rounded-lg border border-[oklch(0.28_0.03_265)] bg-[oklch(0.2_0.025_265)]', className)}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-1 font-mono text-xs text-white/60">{filename}</span>
        <span className="ml-auto font-mono text-[11px] text-white/40">{lineCount} dòng</span>
      </div>
      <div className="flex h-72 font-mono text-[12.5px] leading-6">
        <div
          ref={gutterRef}
          className="select-none overflow-hidden border-r border-white/10 py-3 pl-3 pr-3 text-right text-white/30"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          spellCheck={false}
          aria-label={`Trình soạn thảo mã ${filename}`}
          className="flex-1 resize-none whitespace-pre bg-transparent px-3 py-3 text-[oklch(0.92_0.02_255)] caret-[oklch(0.75_0.15_274)] outline-none selection:bg-[oklch(0.51_0.22_274/0.4)]"
          style={{ tabSize: 4 }}
        />
      </div>
    </div>
  )
}
