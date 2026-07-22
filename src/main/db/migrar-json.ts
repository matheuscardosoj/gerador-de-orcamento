// Importação única do banco legado em JSON (`data/banco.json`) para o SQLite.
// Executada só quando o `banco.db` acabou de ser criado.
import { readFileSync, existsSync, renameSync, copyFileSync } from 'fs'
import { join } from 'path'
import { pastaDados, tx } from './sqlite'
import { bancoInicial, configIAPadrao } from './seeds'
import {
  definirSeqOrcamento,
  empresaRepo,
  parametrosRepo,
  configIARepo,
  clientesRepo,
  servicosRepo,
  observacoesRepo,
  pagamentosRepo,
  orcamentosRepo
} from '../repositories'
import type { BancoDados, Orcamento } from '@shared/types'

/** Preenche campos novos ausentes com os defaults dos seeds (schema legado). */
function mergeDefaults(parsed: Partial<BancoDados>): BancoDados {
  const base = bancoInicial()
  return {
    ...base,
    ...parsed,
    empresa: { ...base.empresa, ...(parsed.empresa ?? {}) },
    parametros: { ...base.parametros, ...(parsed.parametros ?? {}) },
    configIA: { ...configIAPadrao, ...(parsed.configIA ?? {}) }
  }
}

/**
 * Normaliza a numeração dos orçamentos para índice inteiro sequencial.
 * Corrige registros antigos no formato string ("0001/2026") e sincroniza o
 * contador para que novos números nunca colidam nem sejam reutilizados.
 */
function migrarNumeracao(db: BancoDados): void {
  const invalidos = db.orcamentos.some(
    (o) => typeof o.numero !== 'number' || !Number.isInteger(o.numero) || o.numero < 1
  )
  if (invalidos) {
    const ordenados = [...db.orcamentos].sort((a, b) =>
      (a.criadoEm || '').localeCompare(b.criadoEm || '')
    )
    ordenados.forEach((o, i) => {
      o.numero = i + 1
    })
  }
  const maxNum = db.orcamentos.reduce((m, o) => Math.max(m, o.numero || 0), 0)
  db.seqOrcamento = Math.max(db.seqOrcamento || 0, maxNum)
}

/**
 * Se existir um `banco.json`, importa tudo para o SQLite e arquiva o arquivo.
 * Retorna true quando houve importação (o chamador então não semeia o banco).
 */
export function migrarJsonSeExistir(): boolean {
  const caminho = join(pastaDados(), 'banco.json')
  if (!existsSync(caminho)) return false

  let dados: BancoDados
  try {
    dados = mergeDefaults(JSON.parse(readFileSync(caminho, 'utf-8')) as Partial<BancoDados>)
  } catch {
    // JSON corrompido: preserva uma cópia e deixa o banco ser semeado do zero.
    try {
      copyFileSync(caminho, `${caminho}.corrompido-${Date.now()}.bak`)
    } catch {
      /* ignore */
    }
    return false
  }
  migrarNumeracao(dados)

  tx(() => {
    empresaRepo.save(dados.empresa)
    parametrosRepo.save(dados.parametros)
    configIARepo.save(dados.configIA)

    dados.clientes.forEach((c) => clientesRepo.create(c))
    dados.servicos.forEach((s) => servicosRepo.create(s))
    dados.observacoesPadrao.forEach((o) => observacoesRepo.create(o))
    dados.pagamentosPadrao.forEach((p) => pagamentosRepo.create(p))

    const clientesValidos = new Set(dados.clientes.map((c) => c.id))
    const ordenados = [...dados.orcamentos].sort((a, b) => a.numero - b.numero)
    for (const o of ordenados) {
      const legado = o as Partial<Orcamento>
      orcamentosRepo.create(
        {
          ...o,
          clienteId: o.clienteId && clientesValidos.has(o.clienteId) ? o.clienteId : null,
          anexos: legado.anexos ?? [],
          observacaoInterna: legado.observacaoInterna ?? '',
          materiais: legado.materiais ?? [],
          observacoes: legado.observacoes ?? [],
          pagamentos: legado.pagamentos ?? [],
          itensServico: legado.itensServico ?? []
        },
        { numero: o.numero, criadoEm: o.criadoEm, atualizadoEm: o.atualizadoEm }
      )
    }
    definirSeqOrcamento(dados.seqOrcamento)
  })

  renameSync(caminho, `${caminho}.migrado-${Date.now()}`)
  return true
}
