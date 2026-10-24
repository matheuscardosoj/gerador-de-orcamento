import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { type LucideIcon } from 'lucide-react'
import { cn } from './cn'
import type { ReactElement } from 'react'

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
}): ReactElement {
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
}): ReactElement {
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
  primary: 'bg-brand-teal text-white hover:bg-brand-tealHover shadow-xs',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-perigo text-white hover:bg-perigo-forte shadow-xs',
  outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 bg-surface'
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
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-teal/40 disabled:cursor-not-allowed disabled:opacity-50',
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
}): ReactElement {
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
export function DicaIconButton({
  ancora,
  id,
  label
}: {
  ancora: { readonly current: HTMLSpanElement | null }
  id: string
  label: string
}): ReactElement {
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
      className="pointer-events-none fixed z-[100] w-max max-w-[min(20rem,calc(100vw-16px))] whitespace-normal rounded-md bg-inverso px-2 py-1 text-xs font-medium text-white shadow-md"
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
