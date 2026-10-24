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
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode
} from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  formatarEntradaNumerica,
  lerEntradaNumerica,
  mascararNumeroEditavel,
  prepararNumeroColado,
  valorNumericoCanonico
} from '@shared/entrada-numerica'
import { cn } from './cn'
import type { ReactElement } from 'react'

// ------------------------------------------------------------------- Inputs
const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/30 disabled:bg-slate-100'

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
          className="absolute bottom-[2px] right-[2px] top-[2px] inline-flex w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-brand-teal/40"
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
>): ReactElement {
  const inteiro = step === 1
  const negativo = min !== undefined && min < 0
  const casasDecimais = format === 'money' ? 2 : 10
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
    const raw = lerEntradaNumerica(entrada, { inteiro, negativo, casas: casasDecimais })
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
>): ReactElement {
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
}): ReactElement {
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
    <div className={cn('block min-w-0 pilha-y-1', className)}>
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
}): ReactElement {
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
        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-slate-300 text-brand-teal accent-brand-teal focus:outline-hidden focus:ring-2 focus:ring-brand-teal/40"
      />
      {label}
    </label>
  )
}
