'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Check, Copy, Hand, HandFist, Inbox, Loader2, Scissors, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Weapon } from '@/lib/arena-data'

export type Tone = 'neutral' | 'primary' | 'blue' | 'red' | 'success' | 'warning'

const toneClass: Record<Tone, string> = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  primary: 'border-primary/20 bg-accent text-accent-foreground',
  blue: 'border-team-blue/20 bg-team-blue/10 text-team-blue',
  red: 'border-team-red/20 bg-team-red/10 text-team-red',
  success: 'border-success/25 bg-success/10 text-[oklch(0.45_0.12_160)]',
  warning: 'border-warning/30 bg-warning/10 text-[oklch(0.48_0.13_60)]',
}

export function Pill({
  tone = 'neutral',
  dot,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)]', className)}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  titleId,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  titleId?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="text-sm font-semibold text-foreground sm:text-base">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-pretty text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline'

const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  outline: 'border border-input bg-card text-foreground hover:bg-secondary',
  ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
  danger: 'bg-destructive text-primary-foreground shadow-sm hover:bg-destructive/90',
  dangerOutline: 'border border-destructive/30 bg-card text-destructive hover:bg-destructive/5',
}

export function Btn({
  variant = 'outline',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        buttonVariant[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

const inputBase =
  'w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-[inset_0_1px_1px_rgb(15_23_42/0.03)] outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-3 focus:ring-primary/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70'

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  icon,
  trailing,
  className,
  id: idProp,
  ...inputProps
}: ComponentProps<'input'> & {
  label: string
  hint?: ReactNode
  error?: string | null
  icon?: ReactNode
  trailing?: ReactNode
}) {
  const generated = useId()
  const id = idProp ?? generated
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={inputProps.required} className={className}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(inputBase, 'h-10', icon && 'pl-9', trailing && 'pr-10', inputProps.readOnly && 'bg-secondary')}
          {...inputProps}
        />
        {trailing && <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>}
      </div>
    </FieldShell>
  )
}

export function TextArea({
  label,
  hint,
  error,
  className,
  id: idProp,
  ...props
}: ComponentProps<'textarea'> & { label: string; hint?: ReactNode; error?: string | null }) {
  const generated = useId()
  const id = idProp ?? generated
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={props.required} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, 'min-h-20 resize-y py-2')}
        {...props}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  hint,
  error,
  className,
  id: idProp,
  children,
  ...props
}: ComponentProps<'select'> & { label: string; hint?: ReactNode; error?: string | null }) {
  const generated = useId()
  const id = idProp ?? generated
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={props.required} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(inputBase, 'h-10 appearance-auto')}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

/* ---------------------------------------------------------------- */
/* Tabs – role="tablist" với phím mũi tên, Home, End                  */
/* ---------------------------------------------------------------- */

export type TabOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  id?: string
  controls?: string
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  idPrefix,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: TabOption<T>[]
  label: string
  idPrefix?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const tabId = (o: TabOption<T>) => o.id ?? (idPrefix ? `${idPrefix}-tab-${o.value}` : undefined)
  const panelId = (o: TabOption<T>) => o.controls ?? (idPrefix ? `${idPrefix}-panel-${o.value}` : undefined)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex((o) => o.value === value)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].value)
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('grid w-full gap-1 rounded-lg border border-border bg-secondary p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            id={tabId(option)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId(option)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-center text-sm leading-tight font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-ring/35 [&_svg]:size-4 [&_svg]:shrink-0',
              active
                ? 'bg-card text-foreground shadow-[0_1px_3px_rgb(15_23_42/0.1)] ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            <span className="text-balance">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Modal – dùng <dialog> gốc để dễ chuyển về Go template              */
/* ---------------------------------------------------------------- */

export function Modal({
  id,
  open,
  onClose,
  title,
  titleId,
  description,
  size = 'md',
  footer,
  children,
  closeId,
}: {
  id?: string
  open: boolean
  onClose: () => void
  title: ReactNode
  titleId?: string
  description?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  children: ReactNode
  closeId?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const generated = useId()
  const headingId = titleId ?? `${generated}-title`

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-[0_24px_64px_-16px_rgb(15_23_42/0.35)] backdrop:bg-[oklch(0.21_0.03_265/0.45)] backdrop:backdrop-blur-[2px] open:flex open:flex-col',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-xl',
        size === 'lg' && 'max-w-3xl',
        size === 'xl' && 'max-w-5xl',
      )}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={headingId} className="text-base font-semibold text-foreground">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-pretty text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              id={closeId}
              type="button"
              onClick={onClose}
              className="-mr-1.5 rounded-md p-1.5 text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35"
              aria-label="Đóng"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-secondary/40 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Btn onClick={onClose} disabled={loading}>
            Hủy
          </Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {loading ? 'Đang xử lý…' : confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="text-pretty text-sm leading-relaxed text-muted-foreground">{body}</div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- */

export function Notice({
  tone = 'neutral',
  icon,
  title,
  children,
  className,
  role,
  id,
}: {
  tone?: Tone
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  className?: string
  role?: 'status' | 'alert'
  id?: string
}) {
  return (
    <div
      id={id}
      role={role}
      className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', toneClass[tone], className)}
    >
      {icon}
      <div className="min-w-0">
        {title && <p className="text-[13px] font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  id,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div id={id} className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {body && <p className="max-w-sm text-pretty text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Progress({
  value,
  max = 100,
  label,
  className,
  tone = 'primary',
  id,
}: {
  value: number
  max?: number
  label: string
  className?: string
  tone?: 'primary' | 'success' | 'warning' | 'red'
  id?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      id={id}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-2 overflow-hidden rounded-full bg-secondary', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
          tone === 'primary' && 'bg-primary',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'red' && 'bg-destructive',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function CopyButton({ text, label = 'Sao chép' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {}
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/70 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? 'Đã chép' : label}
    </button>
  )
}

export function CodeBlock({ code, title, className, id }: { code: string; title?: string; className?: string; id?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-[oklch(0.28_0.03_265)] bg-[oklch(0.2_0.025_265)]', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-white/55">{title ?? 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre id={id} className="max-h-80 overflow-auto px-3 py-2.5 font-mono text-[12px] leading-5 text-[oklch(0.92_0.02_255)]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function Stat({ label, value, sub, id }: { label: string; value: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p id={id} className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function WeaponIcon({ weapon, className }: { weapon: Weapon; className?: string }) {
  if (weapon === 'rock') return <HandFist className={className} aria-hidden />
  if (weapon === 'paper') return <Hand className={className} aria-hidden />
  return <Scissors className={className} aria-hidden />
}

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.870-1.37-3.870-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.030 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.240-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  )
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function TableShell({ children, minWidth = '40rem', id }: { children: ReactNode; minWidth?: string; id?: string }) {
  return (
    <div className="overflow-x-auto">
      <table id={id} className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export const thClass = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
export const tdClass = 'px-4 py-3 align-middle'
