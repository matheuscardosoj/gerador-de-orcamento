import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------- Ícone
/**
 * Ícone padronizado da interface. Mantém todos os ícones no mesmo tamanho
 * e com caixa fixa, para alinhamento consistente entre telas.
 */
export function Icone({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center text-[19px] leading-none',
        className
      )}
    >
      {children}
    </span>
  )
}

export function AppIcon({
  icon: Icon,
  className
}: {
  icon: LucideIcon
  className?: string
}): JSX.Element {
  return (
    <Icon aria-hidden className={cn('h-[18px] w-[18px] shrink-0', className)} strokeWidth={1.9} />
  )
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

export function IconButton({
  icon,
  label,
  className,
  variant = 'ghost',
  size = 'sm',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
}): JSX.Element {
  return (
    <span className="group/icon-button relative inline-flex">
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        className={cn('h-9 w-9 px-0', className)}
        {...props}
      >
        <AppIcon icon={icon} />
      </Button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 bottom-full z-40 mb-1.5 w-max max-w-xs whitespace-normal rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover/icon-button:visible group-hover/icon-button:opacity-100 group-focus-within/icon-button:visible group-focus-within/icon-button:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

// ------------------------------------------------------------------- Inputs
const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:bg-slate-100'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...props} />
  }
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-[80px] resize-y', className)} {...props} />
  )
})

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
  error,
  children,
  className
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  const gerado = useId()
  const hintId = hint ? `${gerado}-hint` : undefined
  const errorId = error ? `${gerado}-error` : undefined
  const elementos = Children.toArray(children)
  const controles = elementos.filter(
    (el) => isValidElement(el) && [Input, Textarea, Select, NumberField].includes(el.type as never)
  )
  const unico = controles.length === 1 && isValidElement(controles[0]) ? controles[0] : null
  const rotulavel = unico && [Input, Textarea, Select, NumberField].includes(unico.type as never)
  const idControle = rotulavel ? String((unico.props as { id?: string }).id ?? gerado) : undefined
  const descricoes = [
    String(
      (unico?.props as { 'aria-describedby'?: string } | undefined)?.['aria-describedby'] ?? ''
    ),
    hintId,
    errorId
  ]
    .filter(Boolean)
    .join(' ')
  const conteudo = rotulavel
    ? elementos.map((el) =>
        el === unico
          ? cloneElement(unico, {
              id: idControle,
              'aria-describedby': descricoes || undefined,
              'aria-invalid': error ? true : undefined
            } as never)
          : el
      )
    : children
  return (
    <div className={cn('block min-w-0 space-y-1', className)}>
      {label &&
        (idControle ? (
          <label htmlFor={idControle} className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        ) : (
          <span className="block text-sm font-medium text-slate-700">{label}</span>
        ))}
      {conteudo}
      {hint && (
        <span id={hintId} className="block text-xs text-slate-500">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Checkbox
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <label
      className={cn(
        'inline-flex items-start gap-2 text-sm leading-5 text-slate-700',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-teal accent-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
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
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 break-words">
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
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colors[color]
      )}
    >
      {children}
    </span>
  )
}

/** Mensagens de página e de modal compartilham espaçamento e contraste. */
export function Mensagem({
  children,
  tom = 'erro',
  className
}: {
  children: ReactNode
  tom?: 'erro' | 'aviso' | 'info' | 'sucesso'
  className?: string
}): JSX.Element {
  const cores = {
    erro: 'bg-red-50 text-red-700',
    aviso: 'bg-amber-50 text-amber-800',
    info: 'bg-slate-50 text-slate-600',
    sucesso: 'bg-emerald-50 text-emerald-700'
  }
  return (
    <div
      role={tom === 'erro' || tom === 'aviso' ? 'alert' : 'status'}
      className={cn('rounded-lg px-4 py-3 text-sm leading-6', cores[tom], className)}
    >
      {children}
    </div>
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
const pilhaModais: symbol[] = []
let ariaRaizAntes: string | null = null
let raizEraInerte = false
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  busy = false
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl' | '2xl'
  busy?: boolean
}): JSX.Element | null {
  const tituloId = useId()
  const caixaRef = useRef<HTMLDivElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const modalId = useRef(Symbol('modal'))
  const fecharAtual = useRef(onClose)
  const ocupadoAtual = useRef(busy)
  useEffect(() => {
    fecharAtual.current = onClose
    ocupadoAtual.current = busy
  }, [onClose, busy])
  useEffect(() => {
    if (!open) return
    const id = modalId.current
    const raiz = document.getElementById('root')
    if (!pilhaModais.length) {
      ariaRaizAntes = raiz?.getAttribute('aria-hidden') ?? null
      raizEraInerte = raiz?.hasAttribute('inert') ?? false
    }
    pilhaModais.push(id)
    focoAnterior.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(
      () =>
        caixaRef.current
          ?.querySelector<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          ?.focus(),
      0
    )
    raiz?.setAttribute('inert', '')
    raiz?.setAttribute('aria-hidden', 'true')
    const teclado = (evento: KeyboardEvent): void => {
      if (pilhaModais.at(-1) !== id) return
      if (
        evento.key === 'Escape' &&
        !ocupadoAtual.current &&
        !document.querySelector('[data-arrastando="true"]')
      )
        fecharAtual.current()
      if (evento.key !== 'Tab' || !caixaRef.current) return
      const focaveis = [
        ...caixaRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ]
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', teclado)
      const eraTopo = pilhaModais.at(-1) === id
      const indice = pilhaModais.indexOf(id)
      if (indice >= 0) pilhaModais.splice(indice, 1)
      if (!pilhaModais.length) {
        if (!raizEraInerte) raiz?.removeAttribute('inert')
        if (ariaRaizAntes === null) raiz?.removeAttribute('aria-hidden')
        else raiz?.setAttribute('aria-hidden', ariaRaizAntes)
      }
      if (eraTopo && focoAnterior.current?.isConnected) focoAnterior.current.focus()
    }
  }, [open])
  if (!open) return null
  const width =
    size === 'md'
      ? 'max-w-lg'
      : size === 'lg'
        ? 'max-w-2xl'
        : size === 'xl'
          ? 'max-w-4xl'
          : 'max-w-5xl'
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? tituloId : undefined}
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
          width
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 id={tituloId} className="text-base font-semibold text-slate-800">
              {title}
            </h3>
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              aria-label="Fechar"
            >
              <AppIcon icon={X} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  onCancel,
  onConfirm
}: {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}): JSX.Element | null {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{description}</p>
    </Modal>
  )
}
