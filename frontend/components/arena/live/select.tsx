'use client'

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = { value: string; label: ReactNode; text: string; disabled?: boolean; group?: string }

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/** Đọc các <option>/<optgroup> con giống thẻ <select> gốc. */
function collect(children: ReactNode, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<any>
    if (el.type === 'optgroup') collect(el.props.children, el.props.label, out)
    else if (el.type === 'option') out.push({ value: String(el.props.value ?? textOf(el.props.children)), label: el.props.children, text: textOf(el.props.children), disabled: el.props.disabled, group })
    else if (el.props?.children) collect(el.props.children, group, out)
  })
  return out
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  label?: string
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  /** Kiểu nhỏ cho thanh công cụ. */
  compact?: boolean
}

/**
 * Hộp chọn tự vẽ (thay <select> gốc của hệ điều hành): nút bo tròn có mũi tên, menu nổi có tô sáng,
 * dấu ✓ mục đang chọn, nhóm, ô tìm khi nhiều mục; điều khiển bằng bàn phím và có ARIA đầy đủ.
 * Giữ nguyên API của <select> (value, onChange(e.target.value), <option>, <optgroup>).
 */
export function Select({ label, className, children, value, defaultValue, onChange, disabled, id: idProp, name, compact, ...rest }: Props) {
  const autoId = useId()
  const id = idProp || autoId
  const listId = `${id}-list`
  const items = useMemo(() => collect(children), [children])
  const [inner, setInner] = useState(String(defaultValue ?? items[0]?.value ?? ''))
  const current = value !== undefined ? String(value) : inner
  const selected = items.find((i) => i.value === current)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxWidth: number }>({ left: 0, top: 0, width: 0, maxWidth: 360 })
  const typed = useRef({ text: '', at: 0 })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((i) => i.text.toLowerCase().includes(q)) : items
  }, [items, query])

  const place = () => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 260 && r.top > below
    // Menu rộng tối thiểu bằng nút, giãn theo chữ dài nhất (tối đa 420px) để không cắt chữ.
    const width = Math.max(r.width, 180)
    const maxWidth = Math.max(width, Math.min(420, window.innerWidth - 16))
    const left = Math.max(8, Math.min(r.left, window.innerWidth - maxWidth - 8))
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width, maxWidth } : { left, top: r.bottom + 6, width, maxWidth })
  }
  useLayoutEffect(() => { if (open) place() }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false)
    }
    const onMove = () => place()
    // Cuộn trang thì đặt lại vị trí menu nhưng gộp vào một lần mỗi khung hình (không dựng lại theo từng sự kiện cuộn).
    let frame = 0
    const onScroll = (e: Event) => {
      if (menu.current && e.target instanceof Node && menu.current.contains(e.target)) return
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; place() })
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onScroll, true)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onScroll, true) }
  }, [open])
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(Math.max(0, items.findIndex((i) => i.value === current)))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  const choose = (item?: Item) => {
    if (!item || item.disabled) return
    if (value === undefined) setInner(item.value)
    onChange?.({ target: { value: item.value, name }, currentTarget: { value: item.value, name } } as unknown as ChangeEvent<HTMLSelectElement>)
    setOpen(false)
    button.current?.focus()
  }
  const move = (delta: number) => {
    if (!visible.length) return
    let next = active
    for (let n = 0; n < visible.length; n++) {
      next = (next + delta + visible.length) % visible.length
      if (!visible[next].disabled) break
    }
    setActive(next)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(visible[active]) }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false) }
    else if (e.key.length === 1 && items.length <= 10) {
      // Gõ chữ để nhảy tới mục bắt đầu bằng chữ đó.
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const hit = visible.findIndex((i) => i.text.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) setActive(hit)
    }
  }

  const searchable = items.length > 10
  let lastGroup: string | undefined
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>}
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest['aria-label'] ?? label}
        title={rest.title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
        className={cn(
          'group flex w-full items-center gap-2 border border-input bg-background text-left text-foreground shadow-sm transition',
          compact ? 'h-8 rounded-lg px-2.5 text-xs font-medium' : 'h-10 rounded-xl px-3 text-sm',
          'hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          open && 'border-primary ring-2 ring-primary/25', disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : 'Chọn…'}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180 text-primary')} aria-hidden />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menu}
          className="animate-fade-up fixed z-[90] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxWidth: pos.maxWidth, width: 'max-content' }}
          onKeyDown={onKey}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} placeholder="Tìm…" aria-label="Tìm trong danh sách" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
          )}
          <div id={listId} role="listbox" aria-label={rest['aria-label'] ?? label} className="max-h-72 overflow-y-auto p-1">
            {visible.length ? visible.map((item, index) => {
              const header = item.group !== lastGroup && item.group ? item.group : null
              lastGroup = item.group
              const isSel = item.value === current
              return (
                <div key={`${item.group ?? ''}:${item.value}:${index}`}>
                  {header && <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{header}</div>}
                  <div
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={item.disabled || undefined}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      index === active && 'bg-primary/10 text-foreground',
                      isSel && 'font-semibold text-primary',
                      item.disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {isSel && <Check className="size-4 shrink-0" aria-hidden />}
                  </div>
                </div>
              )
            }) : <p className="px-3 py-4 text-center text-xs text-muted-foreground">Không có mục phù hợp</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
