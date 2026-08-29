import { useMemo, useState } from 'react'
import { FolderOpen, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, Input } from '../ui/primitives'
import { DataTableFrame, Pagination, SortableHeader, TableActions } from '../ui/dataTable'
import { formatDataCurta, formatMoeda } from '@shared/format'
import { compararOrigemRelatorio } from '@shared/historico'
import type { ResumoRelatorio, StatusRelatorio } from '@shared/types'

const status: Record<StatusRelatorio, { label: string; cor: 'slate' | 'blue' | 'green' }> = {
  rascunho: { label: 'Rascunho', cor: 'slate' },
  emitido: { label: 'Emitido', cor: 'blue' },
  pago: { label: 'Pago', cor: 'green' }
}
type Campo = 'numero' | 'data' | 'destinatario' | 'origem' | 'servicos' | 'saldo' | 'status'
const POR_PAGINA = 12

export function HistoricoRelatoriosPage(): JSX.Element {
  const { navegar } = useNav()
  const { data, loading, error: erroCarga, reload } = useAsync(() => api.relatorios.list(), [])
  const [busca, setBusca] = useState('')
  const [campo, setCampo] = useState<Campo>('numero')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)
  const [excluir, setExcluir] = useState<ResumoRelatorio | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const relatorios = useMemo(() => data ?? [], [data])
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return relatorios
    return relatorios.filter((r) =>
      `${r.numero} ${r.destinatario} ${r.observacaoInterna ?? ''} ${r.origemOrcamento?.numero ?? ''} ${r.origemOrcamento?.cliente ?? ''} ${r.totais.servicos} ${r.totais.valorFinal}`
        .toLowerCase()
        .includes(q)
    )
  }, [relatorios, busca])
  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) => {
        let comparacao = 0
        if (campo === 'numero') comparacao = a.numero - b.numero
        else if (campo === 'data') comparacao = a.data.localeCompare(b.data)
        else if (campo === 'destinatario')
          comparacao = a.destinatario.localeCompare(b.destinatario, 'pt-BR')
        else if (campo === 'origem') comparacao = compararOrigemRelatorio(a, b)
        else if (campo === 'servicos') comparacao = a.totais.servicos - b.totais.servicos
        else if (campo === 'saldo') comparacao = a.totais.saldo - b.totais.saldo
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
      setDir(['numero', 'data', 'servicos', 'saldo'].includes(novo) ? 'desc' : 'asc')
    }
    setPagina(1)
  }
  const confirmarExclusao = async (): Promise<void> => {
    if (!excluir) return
    setExcluindo(true)
    setErro(null)
    try {
      await api.relatorios.remove(excluir.id)
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
      titulo="Relatórios"
      descricao="Histórico de serviços prestados"
      acoes={<Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button>}
    >
      {!!relatorios.length && (
        <div className="mb-4">
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            placeholder="Buscar por número, cliente, anotação ou proposta…"
            className="max-w-md"
            aria-label="Buscar relatórios"
          />
        </div>
      )}
      {(erro || erroCarga) && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro ?? `Não foi possível carregar os relatórios. ${erroCarga}`}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : erroCarga && !data ? (
        <EmptyState
          title="Falha ao carregar os relatórios"
          description="Verifique o banco de dados e tente novamente."
          action={<Button onClick={reload}>Tentar novamente</Button>}
        />
      ) : !ordenados.length ? (
        <EmptyState
          title={relatorios.length ? 'Nada encontrado' : 'Nenhum relatório ainda'}
          description={
            relatorios.length ? undefined : 'Crie um relatório ou gere um a partir de uma proposta.'
          }
          action={
            !relatorios.length ? (
              <Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTableFrame minWidth="1040px">
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
                  className="w-[10%]"
                  label="Data"
                  active={campo === 'data'}
                  direction={dir}
                  onSort={() => ordenar('data')}
                />
                <SortableHeader
                  className="w-[20%]"
                  label="Cliente"
                  active={campo === 'destinatario'}
                  direction={dir}
                  onSort={() => ordenar('destinatario')}
                />
                <SortableHeader
                  className="w-[11%]"
                  label="Origem"
                  active={campo === 'origem'}
                  direction={dir}
                  onSort={() => ordenar('origem')}
                />
                <SortableHeader
                  className="w-[13%]"
                  label="Serviços"
                  active={campo === 'servicos'}
                  direction={dir}
                  onSort={() => ordenar('servicos')}
                  align="right"
                />
                <SortableHeader
                  className="w-[15%]"
                  label="Saldo"
                  active={campo === 'saldo'}
                  direction={dir}
                  onSort={() => ordenar('saldo')}
                  align="right"
                />
                <SortableHeader
                  className="w-[8%]"
                  label="Status"
                  active={campo === 'status'}
                  direction={dir}
                  onSort={() => ordenar('status')}
                />
                <th scope="col" className="w-[14%] px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map((relatorio) => {
                const origem = relatorio.origemOrcamento
                  ? `Proposta Nº ${relatorio.origemOrcamento.numero}`
                  : '—'
                const tipoSaldo = relatorio.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'
                return (
                  <tr key={relatorio.id} className="h-[62px] hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      {relatorio.numero}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDataCurta(relatorio.data)}
                    </td>
                    <td className="min-w-0 px-4 py-3 text-slate-600">
                      <span className="block truncate" title={relatorio.destinatario}>
                        {relatorio.destinatario || '—'}
                      </span>
                      {relatorio.observacaoInterna && (
                        <span
                          className="mt-0.5 block truncate text-xs text-slate-400"
                          title={relatorio.observacaoInterna}
                        >
                          {relatorio.observacaoInterna}
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 px-4 py-3 text-xs text-slate-500">
                      <span className="block truncate" title={origem}>
                        {origem}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                      {formatMoeda(relatorio.totais.servicos)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700"
                      title={`${formatMoeda(relatorio.totais.valorFinal)} a ${tipoSaldo}`}
                    >
                      {formatMoeda(relatorio.totais.valorFinal)}{' '}
                      <span className="text-xs text-slate-400">a {tipoSaldo}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge color={status[relatorio.status].cor}>
                        {status[relatorio.status].label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <TableActions>
                        <IconButton
                          icon={FolderOpen}
                          label={`Abrir relatório Nº ${relatorio.numero}`}
                          onClick={() =>
                            navegar({ nome: 'editorRelatorio', relatorioId: relatorio.id })
                          }
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Excluir relatório Nº ${relatorio.numero}`}
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => setExcluir(relatorio)}
                        />
                      </TableActions>
                    </td>
                  </tr>
                )
              })}
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
        title="Excluir relatório"
        description={`O relatório Nº ${excluir?.numero ?? ''} será excluído. Se ele tiver o último número entregue, esse número ficará disponível novamente.`}
        busy={excluindo}
        onCancel={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
      />
    </PageShell>
  )
}
