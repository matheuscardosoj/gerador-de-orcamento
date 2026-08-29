import type { Orcamento, Relatorio, TipoLancamentoRelatorio } from './types'

/** Remove um serviço sem perder fotos: elas passam a ficar sem item vinculado. */
export function removerServicoOrcamento(orcamento: Orcamento, itemId: string): Partial<Orcamento> {
  return {
    itensServico: orcamento.itensServico.filter((item) => item.id !== itemId),
    anexos: orcamento.anexos.map((anexo) =>
      anexo.itemServicoId === itemId ? { ...anexo, itemServicoId: null } : anexo
    )
  }
}
/** Mantém a categoria da foto do relatório e limpa somente a referência removida. */
function desvincularRelatorio(relatorio: Relatorio, referenciaId: string): Relatorio['anexos'] {
  return relatorio.anexos.map((anexo) =>
    anexo.referenciaId === referenciaId ? { ...anexo, referenciaId: null } : anexo
  )
}

export function removerServicoRelatorio(relatorio: Relatorio, itemId: string): Partial<Relatorio> {
  return {
    itensServico: relatorio.itensServico.filter((item) => item.id !== itemId),
    anexos: desvincularRelatorio(relatorio, itemId)
  }
}

export function removerLancamentoRelatorio(
  relatorio: Relatorio,
  tipo: TipoLancamentoRelatorio,
  lancamentoId: string
): Partial<Relatorio> {
  const campo = tipo === 'adiantamento' ? 'adiantamentos' : 'reembolsos'
  return {
    [campo]: relatorio[campo].filter((item) => item.id !== lancamentoId),
    anexos: desvincularRelatorio(relatorio, lancamentoId)
  }
}
