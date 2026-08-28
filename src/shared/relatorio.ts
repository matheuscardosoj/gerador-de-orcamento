import { round2 } from './format'
import type { ItemServico, LancamentoRelatorio, TotaisRelatorio } from './types'

/** Única regra de totalização usada por UI, persistência e documentos. */
export function calcularTotaisRelatorio(
  servicos: ItemServico[],
  adiantamentos: LancamentoRelatorio[],
  reembolsos: LancamentoRelatorio[]
): TotaisRelatorio {
  const totalServicos = round2(servicos.reduce((s, i) => s + (Number(i.valorTotal) || 0), 0))
  const totalAdiantamentos = round2(adiantamentos.reduce((s, i) => s + (Number(i.valor) || 0), 0))
  const totalReembolsos = round2(reembolsos.reduce((s, i) => s + (Number(i.valor) || 0), 0))
  const saldo = round2(totalServicos - totalAdiantamentos + totalReembolsos)
  return {
    servicos: totalServicos,
    adiantamentos: totalAdiantamentos,
    reembolsos: totalReembolsos,
    saldo,
    valorFinal: Math.abs(saldo),
    tipoSaldo: saldo < 0 ? 'devolver' : 'receber'
  }
}
