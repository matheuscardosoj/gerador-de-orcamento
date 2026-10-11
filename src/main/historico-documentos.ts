import { obterVersao } from './versoes'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import { recibosRepo } from './recibos'
import type { Documento, Recibo, Relatorio } from '@shared/types'
export function restaurarVersao(id: string, copiar: boolean): Documento {
  const v = obterVersao(id)
  const d = structuredClone(v.documento)
  const repo =
    v.tipo === 'orcamento' ? orcamentosRepo : v.tipo === 'relatorio' ? relatoriosRepo : recibosRepo
  if (copiar) {
    const dto = {
      ...d,
      status: 'rascunho',
      numero: undefined,
      computadorResponsavel: undefined,
      versao: undefined
    }
    if (v.tipo === 'recibo') {
      const r = dto as unknown as Recibo
      r.adiantamentoId = null
      r.origemId = null
      r.origemTipo = undefined
    }
    return (repo.create as (dto: unknown) => Documento)(dto)
  }
  const atual = repo.get(v.documentoId)
  if (!atual) throw new Error('O documento foi excluído. Crie uma nova cópia desta versão.')
  const patch = {
    ...d,
    versao: atual.versao,
    numero: atual.numero,
    computadorResponsavel: atual.computadorResponsavel
  }
  if (v.tipo === 'relatorio') {
    ;(patch as Relatorio).adiantamentos = (atual as Relatorio).adiantamentos
    patch.status = atual.status
  }
  return (repo.update as (id: string, d: unknown) => Documento)(atual.id, patch)
}
