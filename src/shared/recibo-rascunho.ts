import type { Orcamento, Recibo, Relatorio } from './types'
import { resumoServicoRecibo } from './documento/recibo'
export function vincularRecibo(
  r: Recibo,
  d: Orcamento | Relatorio,
  tipo: 'orcamento' | 'relatorio'
): Recibo {
  return {
    ...r,
    origemTipo: tipo,
    origemId: d.id,
    adiantamentoId: null,
    destinatario: d.destinatario,
    clienteId: d.clienteId,
    clienteSnapshot: d.clienteSnapshot,
    empresaSnapshot: d.empresaSnapshot,
    camposCliente: d.camposCliente,
    descricao: resumoServicoRecibo(d.itensServico, d.numero, tipo),
    valor: 'totais' in d ? Math.max(0, d.totais.saldo) : d.valorTotal
  }
}
