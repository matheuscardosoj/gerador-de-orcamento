import type { TipoDocumento, RevisaoRecebimentos } from '@shared/evolucao'
import { formatMoeda } from '@shared/format'
import { Button, SectionTitle, Mensagem } from '../../ui/primitives'
import { DataTableViewport } from '../../ui/dataTable'
import type { ReactElement } from 'react'

export function RecebimentosPendentes({
  tipo,
  recebimentos,
  confirmarFinanceiro,
  ocupado,
  sujo,
  onRevisar,
  onEscolher,
  onConfirmar
}: {
  tipo: TipoDocumento
  recebimentos: RevisaoRecebimentos | null
  confirmarFinanceiro: 'reaplicar' | 'arquivar' | null
  ocupado: boolean
  sujo: boolean
  onRevisar: () => void
  onEscolher: (acao: 'reaplicar' | 'arquivar' | null) => void
  onConfirmar: () => void
}): ReactElement | null {
  if (tipo !== 'recibo' && tipo !== 'relatorio') return null
  return (
    <>
      <SectionTitle
        title="Recebimentos pendentes"
        description="Revise operações que não receberam confirmação da nuvem. A conciliação de textos não altera pagamentos."
      />
      <Button variant="outline" disabled={ocupado} onClick={onRevisar}>
        Revisar recebimentos
      </Button>
      {recebimentos && (
        <>
          {recebimentos.operacoes.length ? (
            <DataTableViewport minWidth="700px">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-24 px-4 py-3">Recibo</th>
                  <th className="w-32 px-4 py-3">Operação</th>
                  <th className="w-32 px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Conferência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recebimentos.operacoes.map((o) => (
                  <tr key={o.reciboId}>
                    <td className="px-4 py-3">{o.numero}</td>
                    <td className="px-4 py-3">
                      {o.acao === 'confirmar'
                        ? 'Recebimento'
                        : o.excluir
                          ? 'Estorno e exclusão'
                          : 'Estorno'}
                    </td>
                    <td className="px-4 py-3">{formatMoeda(o.valor)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{o.cliente}</p>
                      <p className="mt-1 text-slate-500">{o.detalhe}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTableViewport>
          ) : (
            <p className="text-sm text-slate-500">Não há recebimentos pendentes neste conjunto.</p>
          )}
          {!!recebimentos.operacoes.length && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  ocupado || recebimentos.operacoes.some((o) => o.situacao === 'divergente')
                }
                onClick={() => onEscolher('reaplicar')}
              >
                Confirmar operações revisadas
              </Button>
              <Button variant="outline" disabled={ocupado} onClick={() => onEscolher('arquivar')}>
                Arquivar pendências locais
              </Button>
            </div>
          )}
          {confirmarFinanceiro && (
            <Mensagem tom="aviso">
              <p className="mb-3">
                {confirmarFinanceiro === 'reaplicar'
                  ? 'As operações serão refeitas sobre o saldo atual, com autorização e nova transação. O que a nuvem já confirmou não será contabilizado novamente.'
                  : 'As operações locais ainda não confirmadas serão arquivadas com backup, rascunhos e registro de auditoria. Os pagamentos confirmados na empresa permanecem iguais. Se houve recebimento físico divergente, prepare um novo recibo após revisar.'}{' '}
                As alterações de conteúdo locais ficarão em rascunhos para comparação separada.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={ocupado || sujo} onClick={onConfirmar}>
                  Confirmar revisão financeira
                </Button>
                <Button variant="outline" onClick={() => onEscolher(null)}>
                  Voltar
                </Button>
              </div>
            </Mensagem>
          )}
        </>
      )}
    </>
  )
}
