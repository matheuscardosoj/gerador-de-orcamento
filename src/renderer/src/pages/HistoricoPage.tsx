import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Button, Card, Badge, EmptyState, Input, cn } from '../ui/primitives'
import { formatMoeda, formatDataCurta } from '@shared/format'
import type { Orcamento, StatusOrcamento } from '@shared/types'

const statusInfo: Record<StatusOrcamento, { label: string; cor: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  rascunho: { label: 'Rascunho', cor: 'slate' },
  enviado: { label: 'Enviado', cor: 'blue' },
  aprovado: { label: 'Aprovado', cor: 'green' },
  recusado: { label: 'Recusado', cor: 'red' }
}

type Campo = 'numero' | 'data' | 'destinatario' | 'valorTotal' | 'status'
const POR_PAGINA = 12

export function HistoricoPage(): JSX.Element {
  const { navegar } = useNav()
  const { data, loading, reload } = useAsync(() => api.orcamentos.list(), [])
  const [busca, setBusca] = useState('')
  const [campo, setCampo] = useState<Campo>('numero')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)

  const orcamentos = data ?? []

  // Busca: número, destinatário, serviços realizados e valor.
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return orcamentos
    return orcamentos.filter((o) => {
      const emServicos = o.itensServico.some((i) => i.descricao.toLowerCase().includes(q))
      return (
        String(o.numero).includes(q) ||
        o.destinatario.toLowerCase().includes(q) ||
        emServicos ||
        String(o.valorTotal).includes(q) ||
        formatMoeda(o.valorTotal).toLowerCase().includes(q)
      )
    })
  }, [orcamentos, busca])

  const ordenados = useMemo(() => {
    const arr = [...filtrados].sort((a, b) => {
      let cmp = 0
      switch (campo) {
        case 'numero':
          cmp = a.numero - b.numero
          break
        case 'data':
          cmp = a.data.localeCompare(b.data)
          break
        case 'destinatario':
          cmp = a.destinatario.localeCompare(b.destinatario, 'pt-BR')
          break
        case 'valorTotal':
          cmp = a.valorTotal - b.valorTotal
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtrados, campo, dir])

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const visiveis = ordenados.slice(inicio, inicio + POR_PAGINA)

  const ordenarPor = (c: Campo): void => {
    if (c === campo) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setCampo(c)
      setDir(c === 'numero' || c === 'data' || c === 'valorTotal' ? 'desc' : 'asc')
    }
    setPagina(1)
  }

  const seta = (c: Campo): string => (campo === c ? (dir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <PageShell
      titulo="Orçamentos"
      descricao="Histórico de propostas"
      acoes={<Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>}
    >
      {orcamentos.length > 0 && (
        <div className="mb-4">
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar por número, destinatário, serviço ou valor…"
            className="max-w-md"
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : ordenados.length === 0 ? (
        <EmptyState
          title={orcamentos.length === 0 ? 'Nenhum orçamento ainda' : 'Nada encontrado'}
          description={orcamentos.length === 0 ? 'Crie seu primeiro orçamento.' : undefined}
          action={
            orcamentos.length === 0 ? (
              <Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <ThOrd label={`Nº${seta('numero')}`} onClick={() => ordenarPor('numero')} />
                  <ThOrd label={`Data${seta('data')}`} onClick={() => ordenarPor('data')} />
                  <ThOrd label={`Destinatário${seta('destinatario')}`} onClick={() => ordenarPor('destinatario')} />
                  <ThOrd label={`Total${seta('valorTotal')}`} onClick={() => ordenarPor('valorTotal')} className="text-right" />
                  <ThOrd label={`Status${seta('status')}`} onClick={() => ordenarPor('status')} />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((o) => (
                  <LinhaOrcamento key={o.id} o={o} onAbrir={() => navegar({ nome: 'editor', orcamentoId: o.id })} onMudou={reload} />
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, ordenados.length)} de {ordenados.length}
            </span>
            {totalPaginas > 1 && (
              <Paginacao pagina={paginaAtual} total={totalPaginas} onIr={setPagina} />
            )}
          </div>
        </>
      )}
    </PageShell>
  )
}

function ThOrd({
  label,
  onClick,
  className
}: {
  label: string
  onClick: () => void
  className?: string
}): JSX.Element {
  return (
    <th
      className={cn('cursor-pointer select-none px-4 py-3 hover:text-slate-700', className)}
      onClick={onClick}
    >
      {label}
    </th>
  )
}

function LinhaOrcamento({
  o,
  onAbrir,
  onMudou
}: {
  o: Orcamento
  onAbrir: () => void
  onMudou: () => void
}): JSX.Element {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-800">{o.numero}</td>
      <td className="px-4 py-3 text-slate-600">{formatDataCurta(o.data)}</td>
      <td className="px-4 py-3 text-slate-600">{o.destinatario || '—'}</td>
      <td className="px-4 py-3 text-right font-medium text-slate-700">{formatMoeda(o.valorTotal)}</td>
      <td className="px-4 py-3">
        <Badge color={statusInfo[o.status].cor}>{statusInfo[o.status].label}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onAbrir}>
            Abrir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const c = await api.orcamentos.duplicate(o.id)
              if (c) onAbrir()
            }}
          >
            Duplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-400 hover:text-red-600"
            onClick={async () => {
              if (confirm(`Excluir o orçamento Nº ${o.numero}?`)) {
                await api.orcamentos.remove(o.id)
                onMudou()
              }
            }}
          >
            🗑
          </Button>
        </div>
      </td>
    </tr>
  )
}

function Paginacao({
  pagina,
  total,
  onIr
}: {
  pagina: number
  total: number
  onIr: (p: number) => void
}): JSX.Element {
  // Janela de páginas ao redor da atual.
  const paginas: number[] = []
  const de = Math.max(1, pagina - 2)
  const ate = Math.min(total, pagina + 2)
  for (let i = de; i <= ate; i++) paginas.push(i)

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" disabled={pagina === 1} onClick={() => onIr(pagina - 1)}>
        Anterior
      </Button>
      {de > 1 && (
        <>
          <BtnPag n={1} atual={pagina} onIr={onIr} />
          {de > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}
      {paginas.map((p) => (
        <BtnPag key={p} n={p} atual={pagina} onIr={onIr} />
      ))}
      {ate < total && (
        <>
          {ate < total - 1 && <span className="px-1 text-slate-400">…</span>}
          <BtnPag n={total} atual={pagina} onIr={onIr} />
        </>
      )}
      <Button size="sm" variant="outline" disabled={pagina === total} onClick={() => onIr(pagina + 1)}>
        Próxima
      </Button>
    </div>
  )
}

function BtnPag({ n, atual, onIr }: { n: number; atual: number; onIr: (p: number) => void }): JSX.Element {
  return (
    <Button size="sm" variant={n === atual ? 'primary' : 'outline'} onClick={() => onIr(n)}>
      {n}
    </Button>
  )
}
