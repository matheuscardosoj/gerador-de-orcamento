import { describe, expect, it } from 'vitest'
import { removerLancamentoRelatorio, removerServicoOrcamento, removerServicoRelatorio } from './edicao'
import type { Orcamento, Relatorio } from './types'

const baseOrcamento = { itensServico: [{ id: 's1' }], anexos: [{ id: 'a1', itemServicoId: 's1' }, { id: 'a2', itemServicoId: null }] } as unknown as Orcamento
const baseRelatorio = { itensServico: [{ id: 's1' }], adiantamentos: [{ id: 'l1', descricao: 'adiantamento', valor: 10 }], reembolsos: [], anexos: [{ id: 'a1', referenciaTipo: 'servico', referenciaId: 's1' }, { id: 'a2', referenciaTipo: 'adiantamento', referenciaId: 'l1' }] } as unknown as Relatorio

describe('desvinculação de anexos', () => {
  it('preserva foto ao remover serviço de orçamento', () => {
    const patch = removerServicoOrcamento(baseOrcamento, 's1')
    expect(patch.itensServico).toHaveLength(0)
    expect(patch.anexos?.[0].itemServicoId).toBeNull()
  })
  it('preserva categoria ao remover serviço ou lançamento de relatório', () => {
    const servico = removerServicoRelatorio(baseRelatorio, 's1')
    expect(servico.anexos?.[0]).toMatchObject({ referenciaTipo: 'servico', referenciaId: null })
    const lancamento = removerLancamentoRelatorio(baseRelatorio, 'adiantamento', 'l1')
    expect(lancamento.anexos?.[1]).toMatchObject({ referenciaTipo: 'adiantamento', referenciaId: null })
  })
})
