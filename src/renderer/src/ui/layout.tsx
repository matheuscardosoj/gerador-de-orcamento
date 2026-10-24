import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './primitives'
import type { ReactElement } from 'react'

/** Cabeçalho + container com largura máxima para as páginas. */
export function PageShell({
  titulo,
  descricao,
  acoes,
  children,
  largura = 'xl'
}: {
  titulo: ReactNode
  descricao?: ReactNode
  acoes?: ReactNode
  children: ReactNode
  largura?: 'md' | 'lg' | 'xl' | 'full'
}): ReactElement {
  const max =
    largura === 'md'
      ? 'max-w-3xl'
      : largura === 'lg'
        ? 'max-w-5xl'
        : largura === 'xl'
          ? 'max-w-6xl'
          : ''
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-app/80 px-8 py-5 backdrop-blur">
        <div className={cn('mx-auto flex flex-wrap items-center justify-between gap-4', max)}>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{titulo}</h1>
            {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center justify-end gap-2">{acoes}</div>}
        </div>
      </header>
      <div className={cn('mx-auto px-8 py-6', max)}>{children}</div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  atual,
  onChange
}: {
  tabs: Array<{ id: T; label: string }>
  atual: T
  onChange: (id: T) => void
}): ReactElement {
  const botoes = useRef<Array<HTMLButtonElement | null>>([])
  const moverFoco = (evento: KeyboardEvent<HTMLButtonElement>, indice: number): void => {
    let destino = indice
    if (evento.key === 'ArrowRight') destino = (indice + 1) % tabs.length
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + tabs.length) % tabs.length
    else if (evento.key === 'Home') destino = 0
    else if (evento.key === 'End') destino = tabs.length - 1
    else return
    evento.preventDefault()
    onChange(tabs[destino].id)
    botoes.current[destino]?.focus()
  }
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
      {tabs.map((t, indice) => (
        <button
          key={t.id}
          ref={(elemento) => {
            botoes.current[indice] = elemento
          }}
          type="button"
          role="tab"
          aria-selected={atual === t.id}
          tabIndex={atual === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(evento) => moverFoco(evento, indice)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-teal/40',
            atual === t.id
              ? 'border-brand-teal text-brand-tealDark'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
