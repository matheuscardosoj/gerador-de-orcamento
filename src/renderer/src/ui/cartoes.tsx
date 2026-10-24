import { Children, useEffect, useState, type ReactNode } from 'react'
import { mensagemErro } from '@shared/erros'
import { notificar } from '../lib/notificacoes'
import { cn } from './cn'
import type { ReactElement } from 'react'

// -------------------------------------------------------------------- Card
export function Card({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-surface shadow-sm', className)}>
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
}): ReactElement {
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
}): ReactElement {
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
  className,
  temporaria = false
}: {
  children: ReactNode
  tom?: 'erro' | 'aviso' | 'info' | 'sucesso'
  className?: string
  temporaria?: boolean
}): ReactElement | null {
  const [visivel, setVisivel] = useState(true)
  const conteudo = Children.toArray(children)
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
    .join('')
  useEffect(() => {
    setVisivel(true)
    if (!temporaria) return
    notificar(tom === 'erro' ? mensagemErro(conteudo) : conteudo, tom)
    setVisivel(false)
  }, [conteudo, temporaria, tom])
  if (temporaria) return null
  if (!visivel) return null
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
}): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
