import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode
} from 'react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------ Button
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-teal text-white hover:bg-brand-tealDark shadow-sm',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ className, variant = 'primary', size = 'md', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal/40 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  )
})

// ------------------------------------------------------------------- Inputs
const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:bg-slate-100'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...props} />
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-[80px] resize-y', className)} {...props} />
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, 'pr-8', className)} {...props}>
        {children}
      </select>
    )
  }
)

/** Input numérico controlado que emite number (ou 0). */
export function NumberField({
  value,
  onChange,
  className,
  step,
  min,
  ...props
}: {
  value: number
  onChange: (n: number) => void
  className?: string
  step?: number
  min?: number
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>): JSX.Element {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      min={min}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cn(fieldBase, className)}
      {...props}
    />
  )
}

// -------------------------------------------------------------------- Field
export function Field({
  label,
  hint,
  children,
  className
}: {
  label?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  // Usa <div> (não <label>) de propósito: envolver múltiplos controles num <label>
  // faz o clique redirecionar o foco para o primeiro controle, travando a digitação.
  return (
    <div className={cn('block space-y-1', className)}>
      {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </div>
  )
}

// ---------------------------------------------------------------- Checkbox
export function Checkbox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
}): JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-teal focus:ring-brand-teal/40"
      />
      {label}
    </label>
  )
}

// -------------------------------------------------------------------- Card
export function Card({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  description,
  action
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  color = 'slate'
}: {
  children: ReactNode
  color?: 'slate' | 'green' | 'amber' | 'red' | 'blue'
}): JSX.Element {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700'
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colors[color])}>
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ------------------------------------------------------------------- Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg'
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}): JSX.Element | null {
  if (!open) return null
  const width = size === 'md' ? 'max-w-lg' : size === 'lg' ? 'max-w-2xl' : 'max-w-4xl'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-8">
      <div
        className={cn('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl', width)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}
