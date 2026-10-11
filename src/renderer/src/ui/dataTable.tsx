import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AppIcon, Button, Card, cn } from './primitives'

export function DataTableFrame({
  children,
  minWidth = '1000px'
}: {
  children: ReactNode
  minWidth?: string
}): JSX.Element {
  return (
    <Card className="overflow-hidden">
      <DataTableViewport minWidth={minWidth}>{children}</DataTableViewport>
    </Card>
  )
}

/**
 * Estrutura compartilhada para tabelas que vivem dentro de um Card existente.
 * Mantém o mesmo layout fixo e comportamento responsivo das tabelas de histórico
 * sem criar um Card aninhado.
 */
export function DataTableViewport({
  children,
  minWidth = '1000px',
  className
}: {
  children: ReactNode
  minWidth?: string
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn('data-table-viewport relative overflow-x-auto', className)}
      tabIndex={0}
      aria-label="Tabela com rolagem horizontal"
    >
      <table
        className="data-table w-full table-fixed text-sm"
        style={{ '--data-table-min-width': minWidth } as CSSProperties}
      >
        {children}
      </table>
    </div>
  )
}

export function SortableHeader({
  label,
  active,
  direction,
  onSort,
  className,
  align = 'left'
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onSort: () => void
  className?: string
  align?: 'left' | 'right'
}): JSX.Element {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-3', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex w-full items-center gap-1 whitespace-nowrap rounded-sm font-semibold hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal/40',
          align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
        )}
      >
        {label}
        {active && (
          <AppIcon icon={direction === 'asc' ? ChevronUp : ChevronDown} className="h-3.5 w-3.5" />
        )}
      </button>
    </th>
  )
}

export function TableActions({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex items-center justify-end gap-1">{children}</div>
}

export function Pagination({
  pagina,
  total,
  onIr
}: {
  pagina: number
  total: number
  onIr: (pagina: number) => void
}): JSX.Element {
  const paginas: number[] = []
  const de = Math.max(1, pagina - 2)
  const ate = Math.min(total, pagina + 2)
  for (let atual = de; atual <= ate; atual++) paginas.push(atual)
  return (
    <nav className="flex items-center gap-1" aria-label="Paginação">
      <Button size="sm" variant="outline" disabled={pagina === 1} onClick={() => onIr(pagina - 1)}>
        Anterior
      </Button>
      {de > 1 && (
        <>
          <Pagina numero={1} atual={pagina} onIr={onIr} />
          {de > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}
      {paginas.map((numero) => (
        <Pagina key={numero} numero={numero} atual={pagina} onIr={onIr} />
      ))}
      {ate < total && (
        <>
          {ate < total - 1 && <span className="px-1 text-slate-400">…</span>}
          <Pagina numero={total} atual={pagina} onIr={onIr} />
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pagina === total}
        onClick={() => onIr(pagina + 1)}
      >
        Próxima
      </Button>
    </nav>
  )
}

function Pagina({
  numero,
  atual,
  onIr
}: {
  numero: number
  atual: number
  onIr: (pagina: number) => void
}): JSX.Element {
  return (
    <Button
      size="sm"
      variant={numero === atual ? 'primary' : 'outline'}
      aria-current={numero === atual ? 'page' : undefined}
      onClick={() => onIr(numero)}
    >
      {numero}
    </Button>
  )
}
