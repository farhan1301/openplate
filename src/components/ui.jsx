import { useEffect } from 'react'
import { Check, ChevronRight, Search, Star, X } from 'lucide-react'
import { cx } from '../lib/cx'

// ---------- page chrome ----------

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="flex items-end justify-between gap-4 pb-4 pt-0 md:pt-10">
      <div className="min-w-0">
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.02em] text-label">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[15px] text-label-2">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2 pb-1.5">{children}</div>}
    </header>
  )
}

export function AddButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 items-center gap-1.5 rounded-full bg-tint pl-3 pr-3.5 text-[15px] font-semibold text-white shadow-card transition-transform active:scale-95"
    >
      <PlusGlyph /> <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

const PlusGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export function TextButton({ children, onClick, tone = 'tint', disabled, className }) {
  const tones = { tint: 'text-tint', red: 'text-red', muted: 'text-label-2' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx('rounded-lg px-1 text-[17px] transition-opacity hover:opacity-70 disabled:opacity-30', tones[tone], className)}
    >
      {children}
    </button>
  )
}

export function Button({ children, onClick, variant = 'primary', disabled, className, type = 'button', size = 'lg' }) {
  const variants = {
    primary: 'bg-tint text-white',
    tinted: 'bg-tint/12 text-tint',
    gray: 'bg-fill text-label',
    danger: 'bg-red/12 text-red',
    green: 'bg-green text-white',
  }
  const sizes = {
    lg: 'h-[50px] rounded-[14px] px-5 text-[17px]',
    md: 'h-9 rounded-full px-4 text-[15px]',
    sm: 'h-7 rounded-full px-3 text-[13px]',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-[0.98] active:opacity-80 disabled:opacity-40 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  )
}

// ---------- controls ----------

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('flex rounded-[9px] bg-fill p-0.5', className)} role="tablist">
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-all',
              active ? 'bg-surface text-label shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]' : 'text-label',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className={cx('ml-1 tabular-nums', active ? 'text-label-2' : 'text-label-3')}>{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="relative block">
      <Search size={17} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-2" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[10px] bg-fill pl-8 pr-8 text-[17px] text-label placeholder:text-label-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-label-3 text-surface"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </label>
  )
}

export function ChipRow({ children }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
      <div className="flex w-max gap-2 md:w-auto md:flex-wrap">{children}</div>
    </div>
  )
}

export function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-8 whitespace-nowrap rounded-full px-3.5 text-[15px] font-medium transition-colors',
        active ? 'bg-label text-canvas' : 'bg-surface text-label shadow-card hover:bg-fill',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('ml-1.5 tabular-nums', active ? 'opacity-60' : 'text-label-2')}>{count}</span>}
    </button>
  )
}

export function CheckCircle({ checked, onClick, color = 'green', label, size = 24 }) {
  const fills = { green: 'bg-green border-green', tint: 'bg-tint border-tint', orange: 'bg-orange border-orange' }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      style={{ width: size, height: size }}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all active:scale-90',
        checked ? fills[color] : 'border-label-3 bg-transparent hover:border-label-2',
      )}
    >
      {checked && <Check size={size * 0.6} strokeWidth={3.2} className="text-white" />}
    </button>
  )
}

export function Stars({ value = 0, onChange, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= value
        const star = <Star size={size} className={filled ? 'fill-orange text-orange' : 'text-label-3'} strokeWidth={filled ? 0 : 1.6} />
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} className="p-1 transition-transform active:scale-90">
            {star}
          </button>
        ) : <span key={n}>{star}</span>
      })}
    </div>
  )
}

export function Pill({ color = 'label-2', children, className }) {
  const colors = {
    green: 'bg-green/14 text-green',
    tint: 'bg-tint/14 text-tint',
    orange: 'bg-orange/14 text-orange',
    red: 'bg-red/14 text-red',
    'label-2': 'bg-fill text-label-2',
    indigo: 'bg-indigo/14 text-indigo',
  }
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold', colors[color], className)}>
      {children}
    </span>
  )
}

// ---------- lists ----------

export function Section({ title, trailing, footer, children, className }) {
  return (
    <section className={cx('mb-7', className)}>
      {(title || trailing) && (
        <div className="mb-1.5 flex items-end justify-between gap-3 px-4">
          {title && <h2 className="text-[13px] font-normal uppercase tracking-[0.02em] text-label-2">{title}</h2>}
          {trailing}
        </div>
      )}
      <div className="overflow-hidden rounded-[12px] bg-surface shadow-card">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] text-label-2">{footer}</p>}
    </section>
  )
}

export function Row({ leading, title, subtitle, trailing, onClick, chevron, className, titleClassName }) {
  const Inner = onClick ? 'button' : 'div'
  return (
    <div className={cx('group relative flex min-h-[44px] items-center gap-3 pl-4', className)}>
      {leading && <div className="relative z-[1] flex shrink-0 items-center">{leading}</div>}
      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-separator py-2.5 pr-4 group-last:border-b-0">
        <Inner
          {...(onClick ? { type: 'button', onClick } : {})}
          className={cx('min-w-0 flex-1 text-left', onClick && 'after:absolute after:inset-0 after:content-[""] hover:opacity-80')}
        >
          <p className={cx('truncate text-[17px] leading-snug text-label', titleClassName)}>{title}</p>
          {subtitle && <div className="mt-0.5 truncate text-[13px] leading-snug text-label-2">{subtitle}</div>}
        </Inner>
        {trailing && <div className="relative z-[1] flex shrink-0 items-center gap-2">{trailing}</div>}
        {chevron && <ChevronRight size={18} className="shrink-0 text-label-3" />}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-surface shadow-card">
          <Icon size={30} className="text-label-3" strokeWidth={1.6} />
        </div>
      )}
      <p className="text-[20px] font-semibold text-label">{title}</p>
      {message && <p className="mt-1 max-w-xs text-[15px] text-label-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ---------- sheets ----------

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])
}

/**
 * iOS-style sheet: slides up from the bottom on phones, centered card on
 * larger screens. `onConfirm` renders the bold right-hand nav button.
 */
export function Sheet({ open, onClose, title, confirmLabel = 'Done', onConfirm, confirmDisabled, cancelLabel = 'Cancel', children }) {
  useEscape(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="animate-fade absolute inset-0 bg-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[14px] bg-canvas shadow-float sm:max-h-[85vh] sm:max-w-lg sm:rounded-[14px] dark:bg-[#1c1c1e]"
      >
        <div className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-label-3 sm:hidden" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-2 pt-2 sm:pt-3.5">
          <div>
            <TextButton onClick={onClose}>{onConfirm ? cancelLabel : ''}</TextButton>
          </div>
          <h2 className="truncate text-center text-[17px] font-semibold text-label">{title}</h2>
          <div className="text-right">
            {onConfirm ? (
              <TextButton onClick={onConfirm} disabled={confirmDisabled} className="font-semibold">{confirmLabel}</TextButton>
            ) : (
              <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-label-2 transition-opacity hover:opacity-70">
                <X size={16} strokeWidth={2.6} />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">{children}</div>
      </div>
    </div>
  )
}

export function ActionSheet({ open, onClose, title, message, actions }) {
  useEscape(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="animate-fade absolute inset-0 bg-scrim" />
      <div role="alertdialog" aria-label={title} className="animate-sheet relative w-full max-w-sm space-y-2">
        <div className="overflow-hidden rounded-[14px] bg-elevated/95 backdrop-blur-xl">
          {(title || message) && (
            <div className="border-b border-separator px-4 py-3.5 text-center">
              {title && <p className="text-[13px] font-semibold text-label-2">{title}</p>}
              {message && <p className="mt-0.5 text-[13px] text-label-2">{message}</p>}
            </div>
          )}
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={() => { onClose(); action.onClick() }}
              className={cx('block h-14 w-full border-b border-separator text-[20px] last:border-b-0 hover:bg-fill', action.destructive ? 'text-red' : 'text-tint')}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="h-14 w-full rounded-[14px] bg-elevated text-[20px] font-semibold text-tint hover:bg-fill">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------- forms ----------

export function FormGroup({ title, footer, children }) {
  return (
    <div className="mb-6">
      {title && <p className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-label-2">{title}</p>}
      <div className="overflow-hidden rounded-[12px] bg-surface dark:bg-elevated">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] text-label-2">{footer}</p>}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, autoFocus, type = 'text', inputMode, onKeyDown, label }) {
  return (
    <label className="flex min-h-[44px] items-center gap-3 border-b border-separator px-4 last:border-b-0">
      {label && <span className="w-24 shrink-0 text-[17px] text-label">{label}</span>}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 bg-transparent text-[17px] text-label placeholder:text-label-3 focus:outline-none"
      />
    </label>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full resize-none bg-transparent px-4 py-3 text-[17px] text-label placeholder:text-label-3 focus:outline-none"
    />
  )
}

/** Wrapping grid of selectable tokens, used for picking a category. */
export function TokenPicker({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 p-3">
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-full px-3 text-[15px] transition-colors',
              active ? 'bg-tint text-white' : 'bg-fill text-label hover:bg-fill-strong',
            )}
          >
            {option.icon && <span className="text-[14px]">{option.icon}</span>}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-[12px] bg-red/12 px-4 py-3 text-[15px] text-red">
      <p>{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X size={18} />
        </button>
      )}
    </div>
  )
}
