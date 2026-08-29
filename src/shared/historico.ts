import type { Orcamento, Relatorio, ResumoOrcamento, ResumoRelatorio } from './types'

export function resumirOrcamento(orcamento: Orcamento): ResumoOrcamento {
  return {
    id: orcamento.id,
    numero: orcamento.numero,
    data: orcamento.data,
    destinatario: orcamento.destinatario,
    observacaoInterna: orcamento.observacaoInterna ?? '',
    valorTotal: orcamento.valorTotal,
    status: orcamento.status,
    criadoEm: orcamento.criadoEm,
    atualizadoEm: orcamento.atualizadoEm,
    servicosBusca: orcamento.itensServico.map((item) => item.descricao)
  }
}

export function resumirRelatorio(relatorio: Relatorio): ResumoRelatorio {
  return {
    id: relatorio.id,
    numero: relatorio.numero,
    data: relatorio.data,
    destinatario: relatorio.destinatario,
    observacaoInterna: relatorio.observacaoInterna ?? '',
    status: relatorio.status,
    origemOrcamento: relatorio.origemOrcamento,
    totais: relatorio.totais,
    criadoEm: relatorio.criadoEm,
    atualizadoEm: relatorio.atualizadoEm
  }
}

/** Ordena a origem como número de proposta; cliente é o desempate legível. */
export function compararOrigemRelatorio(
  a: Pick<ResumoRelatorio, 'origemOrcamento'>,
  b: Pick<ResumoRelatorio, 'origemOrcamento'>
): number {
  const numeroA = a.origemOrcamento?.numero
  const numeroB = b.origemOrcamento?.numero
  if (numeroA == null && numeroB != null) return 1
  if (numeroA != null && numeroB == null) return -1
  if (numeroA != null && numeroB != null && numeroA !== numeroB) return numeroA - numeroB
  return (a.origemOrcamento?.cliente ?? '').localeCompare(b.origemOrcamento?.cliente ?? '', 'pt-BR')
}
