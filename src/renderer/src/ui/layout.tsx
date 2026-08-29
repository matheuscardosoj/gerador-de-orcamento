import { type ReactNode } from 'react'
import { cn } from './primitives'

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
}): JSX.Element {
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
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/80 px-8 py-5 backdrop-blur">
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
}): JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={atual === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
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
