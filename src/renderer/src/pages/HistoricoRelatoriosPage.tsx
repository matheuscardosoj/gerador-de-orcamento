import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Badge, Button, Card, EmptyState, Input, cn } from '../ui/primitives'
import { formatDataCurta, formatMoeda } from '@shared/format'
import type { Relatorio, StatusRelatorio } from '@shared/types'

const status: Record<StatusRelatorio, { label: string; cor: 'slate' | 'blue' | 'green' }> = { rascunho: { label: 'Rascunho', cor: 'slate' }, emitido: { label: 'Emitido', cor: 'blue' }, pago: { label: 'Pago', cor: 'green' } }
type Campo = 'numero' | 'data' | 'destinatario' | 'origem' | 'servicos' | 'saldo' | 'status'
const POR_PAGINA = 12

export function HistoricoRelatoriosPage(): JSX.Element {
  const { navegar } = useNav()
  const { data, loading, reload } = useAsync(() => api.relatorios.list(), [])
  const [busca, setBusca] = useState(''); const [campo, setCampo] = useState<Campo>('numero'); const [dir, setDir] = useState<'asc' | 'desc'>('desc'); const [pagina, setPagina] = useState(1)
  const relatorios = data ?? []
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return relatorios
    return relatorios.filter((r) => `${r.numero} ${r.destinatario} ${r.observacaoInterna ?? ''} ${r.origemOrcamento?.numero ?? ''} ${r.origemOrcamento?.cliente ?? ''} ${r.totais.servicos} ${r.totais.valorFinal}`.toLowerCase().includes(q))
  }, [relatorios, busca])
  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let comparacao = 0
    switch (campo) {
      case 'numero': comparacao = a.numero - b.numero; break
      case 'data': comparacao = a.data.localeCompare(b.data); break
      case 'destinatario': comparacao = a.destinatario.localeCompare(b.destinatario, 'pt-BR'); break
      case 'origem': comparacao = `${a.origemOrcamento?.numero ?? ''} ${a.origemOrcamento?.cliente ?? ''}`.localeCompare(`${b.origemOrcamento?.numero ?? ''} ${b.origemOrcamento?.cliente ?? ''}`, 'pt-BR'); break
      case 'servicos': comparacao = a.totais.servicos - b.totais.servicos; break
      case 'saldo': comparacao = a.totais.valorFinal - b.totais.valorFinal; break
      case 'status': comparacao = a.status.localeCompare(b.status); break
    }
    return dir === 'asc' ? comparacao : -comparacao
  }), [filtrados, campo, dir])
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA)); const paginaAtual = Math.min(pagina, totalPaginas); const inicio = (paginaAtual - 1) * POR_PAGINA; const visiveis = ordenados.slice(inicio, inicio + POR_PAGINA)
  const ordenar = (novo: Campo): void => { if (novo === campo) setDir((atual) => atual === 'asc' ? 'desc' : 'asc'); else { setCampo(novo); setDir(['numero', 'data', 'servicos', 'saldo'].includes(novo) ? 'desc' : 'asc') }; setPagina(1) }
  const seta = (item: Campo): string => campo === item ? dir === 'asc' ? ' ▲' : ' ▼' : ''
  return <PageShell titulo="Relatórios" descricao="Histórico de serviços prestados" acoes={<Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button>}>
    {!!relatorios.length && <div className="mb-4"><Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} placeholder="Buscar por número, cliente, anotação ou proposta…" className="max-w-md" /></div>}
    {loading ? <p className="text-sm text-slate-500">Carregando…</p> : !ordenados.length ? <EmptyState title={relatorios.length ? 'Nada encontrado' : 'Nenhum relatório ainda'} description={relatorios.length ? undefined : 'Crie um relatório ou gere um a partir de uma proposta.'} action={!relatorios.length ? <Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button> : undefined} /> : <>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[1000px] w-full table-fixed text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
        <ThOrd className="w-12" label={`Nº${seta('numero')}`} onClick={() => ordenar('numero')} /><ThOrd className="w-28" label={`Data${seta('data')}`} onClick={() => ordenar('data')} /><ThOrd className="w-[28%]" label={`Cliente${seta('destinatario')}`} onClick={() => ordenar('destinatario')} /><ThOrd className="w-28" label={`Origem${seta('origem')}`} onClick={() => ordenar('origem')} /><ThOrd className="w-32 text-right" label={`Serviços${seta('servicos')}`} onClick={() => ordenar('servicos')} /><ThOrd className="w-40 text-right" label={`Saldo${seta('saldo')}`} onClick={() => ordenar('saldo')} /><ThOrd className="w-24" label={`Status${seta('status')}`} onClick={() => ordenar('status')} /><th className="w-32 px-4 py-3" />
      </tr></thead><tbody className="divide-y divide-slate-100">{visiveis.map((relatorio) => <LinhaRelatorio key={relatorio.id} relatorio={relatorio} onAbrir={() => navegar({ nome: 'editorRelatorio', relatorioId: relatorio.id })} onExcluir={async () => { if (confirm(`Excluir o relatório Nº ${relatorio.numero}?`)) { await api.relatorios.remove(relatorio.id); reload() } }} />)}</tbody></table></div></Card>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, ordenados.length)} de {ordenados.length}</span>{totalPaginas > 1 && <Paginacao pagina={paginaAtual} total={totalPaginas} onIr={setPagina} />}</div>
    </>}
  </PageShell>
}

function ThOrd({ label, onClick, className }: { label: string; onClick: () => void; className?: string }): JSX.Element { return <th className={cn('cursor-pointer select-none whitespace-nowrap px-4 py-3 hover:text-slate-700', className)} onClick={onClick}>{label}</th> }
function LinhaRelatorio({ relatorio, onAbrir, onExcluir }: { relatorio: Relatorio; onAbrir: () => void; onExcluir: () => Promise<void> }): JSX.Element { const origem = relatorio.origemOrcamento ? `Proposta Nº ${relatorio.origemOrcamento.numero}` : '—'; const saldo = `${formatMoeda(relatorio.totais.valorFinal)} a ${relatorio.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}`; return <tr className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{relatorio.numero}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDataCurta(relatorio.data)}</td><td className="px-4 py-3 text-slate-600"><span className="block truncate" title={relatorio.destinatario}>{relatorio.destinatario || '—'}</span>{relatorio.observacaoInterna && <span className="mt-0.5 block truncate text-xs text-slate-400" title={relatorio.observacaoInterna}>{relatorio.observacaoInterna}</span>}</td><td className="px-4 py-3 text-xs text-slate-500"><span className="block truncate" title={origem}>{origem}</span></td><td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoeda(relatorio.totais.servicos)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700" title={saldo}>{formatMoeda(relatorio.totais.valorFinal)} <span className="text-xs text-slate-400">a {relatorio.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}</span></td><td className="whitespace-nowrap px-4 py-3"><Badge color={status[relatorio.status].cor}>{status[relatorio.status].label}</Badge></td><td className="whitespace-nowrap px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={onAbrir}>Abrir</Button><Button size="sm" variant="ghost" className="text-slate-400 hover:text-red-600" onClick={() => void onExcluir()}>Excluir</Button></div></td></tr> }
function Paginacao({ pagina, total, onIr }: { pagina: number; total: number; onIr: (pagina: number) => void }): JSX.Element { return <div className="flex items-center gap-1"><Button size="sm" variant="outline" disabled={pagina === 1} onClick={() => onIr(pagina - 1)}>Anterior</Button><span className="px-2 text-xs text-slate-500">Página {pagina} de {total}</span><Button size="sm" variant="outline" disabled={pagina === total} onClick={() => onIr(pagina + 1)}>Próxima</Button></div> }
