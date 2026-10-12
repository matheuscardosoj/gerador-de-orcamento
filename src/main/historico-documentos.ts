import { obterVersao } from './versoes'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import { recibosRepo } from './recibos'
import type { Documento, Recibo, Relatorio } from '@shared/types'
import { randomUUID } from 'crypto'
import { calcularTotaisRelatorio } from '@shared/relatorio'
export function restaurarVersao(id: string, copiar: boolean): Documento {
  const v = obterVersao(id)
  const d = structuredClone(v.documento)
  const repo =
    v.tipo === 'orcamento' ? orcamentosRepo : v.tipo === 'relatorio' ? relatoriosRepo : recibosRepo
  if (copiar) {
    if ('anexos' in d) d.anexos = d.anexos.map((a) => ({ ...a, id: randomUUID() }))
    const dto = {
      ...d,
      status: 'rascunho',
      numero: undefined,
      computadorResponsavel: undefined,
      versao: undefined,
      usuarioCriador: undefined,
      alteradoPor: undefined,
      autorNome: undefined
    }
    if (v.tipo === 'recibo') {
      const r = dto as unknown as Recibo
      r.adiantamentoId = null
      r.origemId = null
      r.origemTipo = undefined
    }
    if (v.tipo === 'relatorio') {
      const r = dto as unknown as Relatorio
      r.adiantamentos = []
      r.reembolsos = []
      r.totais = calcularTotaisRelatorio(r.itensServico, [], [])
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
    ;(patch as Relatorio).reembolsos = (atual as Relatorio).reembolsos
    patch.status = atual.status
  }
  return (repo.update as (id: string, d: unknown) => Documento)(atual.id, patch)
}
