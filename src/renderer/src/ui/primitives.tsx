import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, X, type LucideIcon } from 'lucide-react'
import { mensagemErro } from '@shared/erros'
import {
  formatarEntradaNumerica,
  lerEntradaNumerica,
  mascararNumeroEditavel,
  prepararNumeroColado,
  valorNumericoCanonico
} from '@shared/entrada-numerica'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------- Ícone
/**
 * Ícone padronizado: 20 px na navegação, 18 px nas ações e 16 px nos controles
 * compactos. O traço mantém a mesma espessura visual em todos os tamanhos.
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
  className,
  size = 'md'
}: {
  icon: LucideIcon
  className?: string
  size?: 'sm' | 'md' | 'lg'
}): JSX.Element {
  const pixels = size === 'sm' ? 16 : size === 'lg' ? 20 : 18
  return (
    <Icon
      aria-hidden
      focusable="false"
      size={pixels}
      className={cn('shrink-0', className)}
      strokeWidth={2}
      absoluteStrokeWidth
    />
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
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: LucideIcon
  }
>(function Button({ className, variant = 'primary', size = 'md', icon, children, ...props }, ref) {
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
    >
      {icon && <AppIcon icon={icon} />}
      {children}
    </button>
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
  const ancora = useRef<HTMLSpanElement>(null)
  const dicaId = useId()
  const [mouse, setMouse] = useState(false)
  const [foco, setFoco] = useState(false)
  const [dispensada, setDispensada] = useState(false)
  const aberta = (mouse || foco) && !dispensada
  return (
    <span
      ref={ancora}
      className="relative inline-flex"
      onMouseEnter={() => {
        setMouse(true)
        setDispensada(false)
      }}
      onMouseLeave={() => setMouse(false)}
      onFocus={() => {
        setFoco(true)
        setDispensada(false)
      }}
      onBlur={() => setFoco(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDispensada(true)
      }}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        className={cn('h-9 w-9 px-0', className)}
        {...props}
        aria-describedby={
          [props['aria-describedby'], aberta ? dicaId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
      >
        <AppIcon icon={icon} />
      </Button>
      {aberta && <DicaIconButton ancora={ancora} id={dicaId} label={label} />}
    </span>
  )
}

/** Fora da tabela para não ser cortada por rolagem, cartões ou colunas fixas. */
function DicaIconButton({
  ancora,
  id,
  label
}: {
  ancora: { readonly current: HTMLSpanElement | null }
  id: string
  label: string
}): JSX.Element {
  const dica = useRef<HTMLSpanElement>(null)
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const posicionar = (): void => {
      if (!ancora.current || !dica.current) return
      const alvo = ancora.current.getBoundingClientRect()
      const tamanho = dica.current.getBoundingClientRect()
      const margem = 8
      const acima = alvo.top - tamanho.height - margem
      const top = acima >= margem ? acima : alvo.bottom + margem
      setPosicao({
        top: Math.max(margem, Math.min(top, innerHeight - tamanho.height - margem)),
        left: Math.max(
          margem,
          Math.min(alvo.right - tamanho.width, innerWidth - tamanho.width - margem)
        )
      })
    }
    posicionar()
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [ancora, label])
  return createPortal(
    <span
      ref={dica}
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-max max-w-[min(20rem,calc(100vw-16px))] whitespace-normal rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white shadow-md"
      style={{
        top: posicao?.top ?? 0,
        left: posicao?.left ?? 0,
        visibility: posicao ? 'visible' : 'hidden'
      }}
    >
      {label}
    </span>,
    document.body
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

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, type: _type, id, ...props }, ref) {
    const [visivel, setVisivel] = useState(false)
    const inputId = useId()
    return (
      <span className="relative block">
        <input
          ref={ref}
          id={id ?? inputId}
          className={cn(fieldBase, 'pr-11', className)}
          type={visivel ? 'text' : 'password'}
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-teal/40"
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          aria-controls={id ?? inputId}
          title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setVisivel((atual) => !atual)}
        >
          <Eye
            aria-hidden
            focusable="false"
            size={18}
            strokeWidth={2}
            className={cn(
              'absolute transition-all duration-200 ease-out motion-reduce:transition-none',
              visivel ? 'rotate-0 scale-100 opacity-100' : '-rotate-12 scale-75 opacity-0'
            )}
          />
          <EyeOff
            aria-hidden
            focusable="false"
            size={18}
            strokeWidth={2}
            className={cn(
              'absolute transition-all duration-200 ease-out motion-reduce:transition-none',
              visivel ? 'rotate-12 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'
            )}
          />
        </button>
      </span>
    )
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

/** Campo com máscara brasileira; o valor externo permanece numérico/canônico. */
export function NumericInput({
  value,
  onValueChange,
  className,
  step,
  min,
  max,
  format = 'number',
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: {
  value: number | string
  onValueChange: (textoCanonico: string) => void
  className?: string
  step?: number
  min?: number
  max?: number
  format?: 'number' | 'money'
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'max' | 'min' | 'step'
>): JSX.Element {
  const inteiro = step === 1
  const negativo = min !== undefined && min < 0
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const cursor = useRef<number | null>(null)
  const ultimo = useRef<number | string>(value === '' ? '' : Number(value))
  useEffect(() => {
    const atual = value === '' ? '' : Number(value)
    if (editando && atual !== ultimo.current) {
      setTexto(formatarEntradaNumerica(value, inteiro, format === 'money'))
      ultimo.current = atual
    }
  }, [value, editando, inteiro, format])
  useLayoutEffect(() => {
    if (cursor.current !== null && input.current && document.activeElement === input.current) {
      input.current.setSelectionRange(cursor.current, cursor.current)
      cursor.current = null
    }
  }, [texto])
  const numero = Number(value)
  const erroFaixa =
    value !== '' &&
    (min !== undefined && numero < min
      ? `Informe um número maior ou igual a ${formatarEntradaNumerica(min)}.`
      : max !== undefined && numero > max
        ? `Informe um número menor ou igual a ${formatarEntradaNumerica(max)}.`
        : '')
  useEffect(() => {
    input.current?.setCustomValidity(erroFaixa || '')
  }, [erroFaixa])
  const alterar = (entrada: string, posicao: number): void => {
    const raw = lerEntradaNumerica(entrada, { inteiro, negativo })
    if (raw === null) return
    const mascarado = mascararNumeroEditavel(raw)
    const antes = (entrada.slice(0, posicao).match(/[\d,-]/g) ?? []).length
    let novaPosicao = 0,
      vistos = 0
    while (novaPosicao < mascarado.length && vistos < antes) {
      if (/[\d,-]/.test(mascarado[novaPosicao])) vistos++
      novaPosicao++
    }
    cursor.current = novaPosicao
    const canonico = valorNumericoCanonico(raw)
    ultimo.current =
      typeof value === 'number' ? Number(canonico || 0) : canonico === '' ? '' : Number(canonico)
    setTexto(mascarado)
    onValueChange(canonico)
    if (mascarado === texto) {
      input.current?.setSelectionRange(novaPosicao, novaPosicao)
      cursor.current = null
    }
  }
  const inserir = (conteudo: string): void => {
    if (!input.current) return
    const el = input.current
    const inicio = el.selectionStart ?? 0
    const fim = el.selectionEnd ?? inicio
    alterar(el.value.slice(0, inicio) + conteudo + el.value.slice(fim), inicio + conteudo.length)
  }
  return (
    <input
      {...props}
      ref={input}
      type="text"
      data-number-input="true"
      inputMode={inteiro ? 'numeric' : 'decimal'}
      aria-invalid={props['aria-invalid'] || !!erroFaixa || undefined}
      value={editando ? texto : formatarEntradaNumerica(value, inteiro, format === 'money')}
      onChange={(e) => alterar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onFocus={(e) => {
        // Manter o mesmo texto evita perder a seleção ao focar um valor monetário.
        setTexto(formatarEntradaNumerica(value, inteiro, format === 'money'))
        cursor.current = null
        ultimo.current = value === '' ? '' : Number(value)
        setEditando(true)
        e.target.select()
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setEditando(false)
        onBlur?.(e)
      }}
      onPaste={(e) => {
        e.preventDefault()
        inserir(prepararNumeroColado(e.clipboardData.getData('text')))
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
        if (e.key === '.' && !inteiro) {
          e.preventDefault()
          inserir(',')
          return
        }
        if (
          e.key.length === 1 &&
          (!/[\d,-]/.test(e.key) || (inteiro && e.key === ',') || (!negativo && e.key === '-'))
        )
          e.preventDefault()
        const el = e.currentTarget
        const inicio = el.selectionStart ?? 0
        if (inicio === el.selectionEnd) {
          if (e.key === 'Backspace' && el.value[inicio - 1] === '.')
            el.setSelectionRange(inicio - 1, inicio - 1)
          if (e.key === 'Delete' && el.value[inicio] === '.')
            el.setSelectionRange(inicio + 1, inicio + 1)
        }
      }}
      className={cn(fieldBase, className)}
    />
  )
}

/** Adapter para os cálculos existentes; limpar emite zero sem perder a edição vazia. */
export function NumberField({
  value,
  onChange,
  ...props
}: {
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  format?: 'number' | 'money'
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'
>): JSX.Element {
  return (
    <NumericInput
      {...props}
      value={value}
      onValueChange={(texto) => onChange(Number(texto || 0))}
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
    (el) =>
      isValidElement(el) &&
      [Input, Textarea, Select, NumberField, NumericInput].includes(el.type as never)
  )
  const unico = controles.length === 1 && isValidElement(controles[0]) ? controles[0] : null
  const rotulavel =
    unico && [Input, Textarea, Select, NumberField, NumericInput].includes(unico.type as never)
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
      {tom === 'erro' && typeof children === 'string' ? mensagemErro(children) : children}
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
  size?: 'md' | 'lg' | 'xl' | '2xl' | '3xl'
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
          : size === '2xl'
            ? 'max-w-5xl'
            : 'max-w-7xl'
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
