import { useMemo, useState } from 'react'
import { ClipboardPlus, Copy, FolderOpen, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Input } from '../ui/primitives'
import { DataTableFrame, Pagination, SortableHeader, TableActions } from '../ui/dataTable'
import { formatMoeda, formatDataCurta } from '@shared/format'
import type { Orcamento, StatusOrcamento } from '@shared/types'

const statusInfo: Record<
  StatusOrcamento,
  { label: string; cor: 'slate' | 'green' | 'amber' | 'red' | 'blue' }
> = {
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
  const [excluir, setExcluir] = useState<Orcamento | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const orcamentos = useMemo(() => data ?? [], [data])
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return orcamentos
    return orcamentos.filter(
      (o) =>
        String(o.numero).includes(q) ||
        o.destinatario.toLowerCase().includes(q) ||
        (o.observacaoInterna ?? '').toLowerCase().includes(q) ||
        o.itensServico.some((i) => i.descricao.toLowerCase().includes(q)) ||
        String(o.valorTotal).includes(q) ||
        formatMoeda(o.valorTotal).toLowerCase().includes(q)
    )
  }, [orcamentos, busca])

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) => {
        let comparacao = 0
        if (campo === 'numero') comparacao = a.numero - b.numero
        else if (campo === 'data') comparacao = a.data.localeCompare(b.data)
        else if (campo === 'destinatario')
          comparacao = a.destinatario.localeCompare(b.destinatario, 'pt-BR')
        else if (campo === 'valorTotal') comparacao = a.valorTotal - b.valorTotal
        else comparacao = a.status.localeCompare(b.status)
        return dir === 'asc' ? comparacao : -comparacao
      }),
    [filtrados, campo, dir]
  )

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const visiveis = ordenados.slice(inicio, inicio + POR_PAGINA)
  const ordenar = (novo: Campo): void => {
    if (novo === campo) setDir((atual) => (atual === 'asc' ? 'desc' : 'asc'))
    else {
      setCampo(novo)
      setDir(['numero', 'data', 'valorTotal'].includes(novo) ? 'desc' : 'asc')
    }
    setPagina(1)
  }

  const confirmarExclusao = async (): Promise<void> => {
    if (!excluir) return
    setExcluindo(true)
    setErro(null)
    try {
      await api.orcamentos.remove(excluir.id)
      setExcluir(null)
      reload()
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <PageShell
      titulo="Orçamentos"
      descricao="Histórico de propostas"
      acoes={<Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>}
    >
      {!!orcamentos.length && (
        <div className="mb-4">
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar por número, destinatário, anotação, serviço ou valor…"
            className="max-w-md"
            aria-label="Buscar orçamentos"
          />
        </div>
      )}
      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !ordenados.length ? (
        <EmptyState
          title={orcamentos.length ? 'Nada encontrado' : 'Nenhum orçamento ainda'}
          description={orcamentos.length ? undefined : 'Crie seu primeiro orçamento.'}
          action={
            !orcamentos.length ? (
              <Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTableFrame minWidth="980px">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortableHeader
                  className="w-[9%]"
                  label="Nº"
                  active={campo === 'numero'}
                  direction={dir}
                  onSort={() => ordenar('numero')}
                />
                <SortableHeader
                  className="w-[11%]"
                  label="Data"
                  active={campo === 'data'}
                  direction={dir}
                  onSort={() => ordenar('data')}
                />
                <SortableHeader
                  className="w-[32%]"
                  label="Destinatário"
                  active={campo === 'destinatario'}
                  direction={dir}
                  onSort={() => ordenar('destinatario')}
                />
                <SortableHeader
                  className="w-[15%]"
                  label="Total"
                  active={campo === 'valorTotal'}
                  direction={dir}
                  onSort={() => ordenar('valorTotal')}
                  align="right"
                />
                <SortableHeader
                  className="w-[10%]"
                  label="Status"
                  active={campo === 'status'}
                  direction={dir}
                  onSort={() => ordenar('status')}
                />
                <th scope="col" className="w-[23%] px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map((o) => (
                <tr key={o.id} className="h-[62px] hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                    {o.numero}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDataCurta(o.data)}
                  </td>
                  <td className="min-w-0 px-4 py-3 text-slate-600">
                    <span className="block truncate" title={o.destinatario}>
                      {o.destinatario || '—'}
                    </span>
                    {o.observacaoInterna && (
                      <span
                        className="mt-0.5 block truncate text-xs text-slate-400"
                        title={o.observacaoInterna}
                      >
                        {o.observacaoInterna}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700">
                    {formatMoeda(o.valorTotal)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge color={statusInfo[o.status].cor}>{statusInfo[o.status].label}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <TableActions>
                      <IconButton
                        icon={FolderOpen}
                        label={`Abrir orçamento Nº ${o.numero}`}
                        onClick={() => navegar({ nome: 'editor', orcamentoId: o.id })}
                      />
                      <IconButton
                        icon={ClipboardPlus}
                        label={`Gerar relatório do orçamento Nº ${o.numero}`}
                        onClick={async () => {
                          const relatorio = await api.relatorios.criarDeOrcamento(o.id)
                          if (relatorio)
                            navegar({ nome: 'editorRelatorio', relatorioId: relatorio.id })
                        }}
                      />
                      <IconButton
                        icon={Copy}
                        label={`Duplicar orçamento Nº ${o.numero}`}
                        onClick={async () => {
                          const copia = await api.orcamentos.duplicate(o.id)
                          if (copia) navegar({ nome: 'editor', orcamentoId: copia.id })
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Excluir orçamento Nº ${o.numero}`}
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => setExcluir(o)}
                      />
                    </TableActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableFrame>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, ordenados.length)} de{' '}
              {ordenados.length}
            </span>
            {totalPaginas > 1 && (
              <Pagination pagina={paginaAtual} total={totalPaginas} onIr={setPagina} />
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        title="Excluir orçamento"
        description={`O orçamento Nº ${excluir?.numero ?? ''} será excluído. Se ele tiver o último número entregue, esse número ficará disponível novamente.`}
        busy={excluindo}
        onCancel={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
      />
    </PageShell>
  )
}
