import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Badge, Button, Card, EmptyState, Input } from '../ui/primitives'
import { formatDataCurta, formatMoeda } from '@shared/format'
import type { StatusRelatorio } from '@shared/types'

const status: Record<StatusRelatorio, { label: string; cor: 'slate' | 'blue' | 'green' }> = { rascunho: { label: 'Rascunho', cor: 'slate' }, emitido: { label: 'Emitido', cor: 'blue' }, pago: { label: 'Pago', cor: 'green' } }

export function HistoricoRelatoriosPage(): JSX.Element {
  const { navegar } = useNav(); const { data, loading, reload } = useAsync(() => api.relatorios.list(), [])
  const [busca, setBusca] = useState('')
  const relatorios = useMemo(() => (data ?? []).filter(r => `${r.numero} ${r.destinatario} ${r.observacaoInterna ?? ''} ${r.origemOrcamento?.numero ?? ''}`.toLowerCase().includes(busca.toLowerCase().trim())).sort((a,b) => b.numero-a.numero), [data,busca])
  return <PageShell titulo="Relatórios" descricao="Histórico de serviços prestados" acoes={<Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button>}>
    {(data?.length ?? 0) > 0 && <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, cliente, anotação ou proposta…" className="mb-4 max-w-md" />}
    {loading ? <p className="text-sm text-slate-500">Carregando…</p> : relatorios.length === 0 ? <EmptyState title={data?.length ? 'Nada encontrado' : 'Nenhum relatório ainda'} description={data?.length ? undefined : 'Crie um relatório ou gere um a partir de uma proposta.'} action={!data?.length ? <Button onClick={() => navegar({ nome: 'editorRelatorio' })}>+ Novo relatório</Button> : undefined} /> :
    <Card className="overflow-hidden"><table className="w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Nº</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Serviços</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Status</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{relatorios.map(r => <tr key={r.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium">{r.numero}</td><td className="px-4 py-3">{formatDataCurta(r.data)}</td><td className="px-4 py-3"><span className="block truncate">{r.destinatario || '—'}</span>{r.observacaoInterna && <span className="mt-0.5 block truncate text-xs text-slate-400" title={r.observacaoInterna}>{r.observacaoInterna}</span>}</td><td className="px-4 py-3 text-xs text-slate-500">{r.origemOrcamento ? `Proposta Nº ${r.origemOrcamento.numero}` : '—'}</td><td className="px-4 py-3 text-right">{formatMoeda(r.totais.servicos)}</td><td className="px-4 py-3 text-right font-medium">{formatMoeda(r.totais.valorFinal)}<span className="ml-1 text-xs text-slate-400">a {r.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}</span></td><td className="px-4 py-3"><Badge color={status[r.status].cor}>{status[r.status].label}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => navegar({ nome: 'editorRelatorio', relatorioId: r.id })}>Abrir</Button><Button size="sm" variant="ghost" className="text-slate-400 hover:text-red-600" onClick={async () => { if(confirm(`Excluir o relatório Nº ${r.numero}?`)){ await api.relatorios.remove(r.id); reload() } }}>Excluir</Button></td></tr>)}</tbody></table></Card>}
  </PageShell>
}
