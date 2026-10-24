'use client'

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusOf, type Tone } from '@/lib/format'

export const toneClass: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  accent: 'border-primary/25 bg-primary/10 text-primary',
}

export function Card({ children, className, title, subtitle, action, padded = true }: {
  children?: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; padded?: boolean
}) {
  return (
    <section className={cn('animate-fade-up rounded-2xl border border-border bg-card/80 text-card-foreground shadow-sm backdrop-blur-sm', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/[0.07] to-transparent px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[15px] font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-brand text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110 hover:shadow-lg hover:shadow-primary/35 active:translate-y-px',
    secondary: 'border border-border bg-card/70 text-foreground hover:border-primary/50 hover:bg-accent/50',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    danger: 'border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        styles,
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, label }: { status: unknown; label?: string }) {
  const info = statusOf(status)
  return <Badge tone={info.tone} dot>{label ?? info.label}</Badge>
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} />
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} role="status" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)} role="status" aria-label="Đang tải">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
    </div>
  )
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card-lift relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-primary/10 blur-2xl" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {icon && <span className="text-primary" aria-hidden>{icon}</span>}
      </div>
      <p className={cn('font-display mt-2 text-3xl font-extrabold tracking-tight tabular-nums', tone === 'danger' ? 'text-red-500 dark:text-red-400' : tone === 'success' ? 'text-emerald-500 dark:text-emerald-400' : 'gradient-text')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Avatar đội: màu sinh từ tên để mỗi đội luôn có nhận diện riêng. */
export function Avatar({ name, size = 'md', ring }: { name?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; ring?: 'red' | 'blue' | 'gold' }) {
  const text = (name || '?').trim()
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)!) % 360
  const initials = text.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const dim = { sm: 'size-7 text-[10px]', md: 'size-9 text-xs', lg: 'size-12 text-sm', xl: 'size-16 text-lg' }[size]
  return (
    <span
      aria-hidden
      className={cn('font-display inline-flex shrink-0 items-center justify-center rounded-xl font-extrabold text-white shadow-inner', dim,
        ring === 'red' && 'ring-2 ring-red-500/70', ring === 'blue' && 'ring-2 ring-blue-500/70', ring === 'gold' && 'ring-2 ring-amber-400')}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hash} 70% 52%), hsl(${(hash + 50) % 360} 75% 42%))` }}
    >{initials}</span>
  )
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Thử lại</Button>}
    </div>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums"><span>{label}</span><span>{percent}%</span></div>
    </div>
  )
}

const inputBase = 'block w-full min-h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/70 hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60'

export function Field({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>}
      <input id={id} className={inputBase} {...rest} />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function TextArea({ label, className, mono, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; mono?: boolean }) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>}
      <textarea id={id} className={cn(inputBase, mono && 'font-mono text-[13px] leading-relaxed')} {...rest} />
    </div>
  )
}

export { Select } from './select'

/** Thanh chuyển mục dạng viên thuốc, dùng cho sub-tab. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: { id: T; label: string; badge?: ReactNode; icon?: ReactNode }[]; value: T; onChange: (id: T) => void; className?: string
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            value === tab.id ? 'bg-brand text-primary-foreground shadow-md shadow-primary/25' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
          )}
        >
          {tab.icon}{tab.label}{tab.badge}
        </button>
      ))}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">{from.toLocaleString('vi-VN')}–{to.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft className="size-4" /></Button>
        <span className="px-2 tabular-nums">Trang {page}/{pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  )
}

export function DataTable({ head, children, className }: { head: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border', className)}>
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-3 py-2.5 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr:hover]:bg-primary/[0.04] [&>tr:nth-child(even)]:bg-muted/25">{children}</tbody>
      </table>
    </div>
  )
}

/** Hộp thoại xác nhận dùng thay cho confirm() của trình duyệt. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Xác nhận', danger, onConfirm, onCancel }: {
  open: boolean; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLButtonElement>('button[data-autofocus]')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 id="confirm-title" className="text-base font-semibold">{title}</h3>
        {message && <div className="mt-2 text-sm text-muted-foreground">{message}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Hủy</Button>
          <Button data-autofocus variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><span className="h-px w-6 bg-primary" aria-hidden />{eyebrow}</p>}
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  )
}
