import { useState } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Button, Card, Badge, EmptyState, Input } from '../ui/primitives'
import { formatMoeda, formatDataCurta } from '@shared/format'
import type { StatusOrcamento } from '@shared/types'

const statusInfo: Record<StatusOrcamento, { label: string; cor: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  rascunho: { label: 'Rascunho', cor: 'slate' },
  enviado: { label: 'Enviado', cor: 'blue' },
  aprovado: { label: 'Aprovado', cor: 'green' },
  recusado: { label: 'Recusado', cor: 'red' }
}

export function HistoricoPage(): JSX.Element {
  const { navegar } = useNav()
  const { data, loading, reload } = useAsync(() => api.orcamentos.list(), [])
  const [busca, setBusca] = useState('')

  const filtrados = (data ?? []).filter((o) => {
    const q = busca.toLowerCase().trim()
    if (!q) return true
    return o.numero.toLowerCase().includes(q) || o.destinatario.toLowerCase().includes(q)
  })

  return (
    <PageShell
      titulo="Orçamentos"
      descricao="Histórico de propostas"
      acoes={<Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>}
    >
      {data && data.length > 0 && (
        <div className="mb-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número ou destinatário…"
            className="max-w-sm"
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <EmptyState
          title={data && data.length === 0 ? 'Nenhum orçamento ainda' : 'Nada encontrado'}
          description={data && data.length === 0 ? 'Crie seu primeiro orçamento.' : undefined}
          action={
            data && data.length === 0 ? (
              <Button onClick={() => navegar({ nome: 'editor' })}>+ Novo orçamento</Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Destinatário</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{o.numero}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDataCurta(o.data)}</td>
                  <td className="px-4 py-3 text-slate-600">{o.destinatario || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{formatMoeda(o.valorTotal)}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusInfo[o.status].cor}>{statusInfo[o.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => navegar({ nome: 'editor', orcamentoId: o.id })}>
                        Abrir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const c = await api.orcamentos.duplicate(o.id)
                          if (c) navegar({ nome: 'editor', orcamentoId: c.id })
                        }}
                      >
                        Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-red-600"
                        onClick={async () => {
                          if (confirm(`Excluir o orçamento ${o.numero}?`)) {
                            await api.orcamentos.remove(o.id)
                            reload()
                          }
                        }}
                      >
                        🗑
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageShell>
  )
}
