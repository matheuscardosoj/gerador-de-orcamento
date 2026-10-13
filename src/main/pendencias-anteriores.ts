import { createHash, randomUUID } from 'crypto'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { all, get, run, tx, texto, pastaDados } from './db/sqlite'
import { exportarDadosPara } from './dados'
import type { AtualizacaoNumeracaoPendente } from '@shared/evolucao'
import { filaAtiva, marcarGrupo } from './fila-nuvem'

export function conteudoEquivalente(a: unknown, b: unknown): boolean {
  const normalizar = (v: unknown, campo = ''): unknown => {
    if (typeof v === 'string' && ['dados_json', 'valor'].includes(campo)) {
      try {
        return normalizar(JSON.parse(v))
      } catch {
        return v
      }
    }
    if (Array.isArray(v)) return v.map((x) => normalizar(x))
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, normalizar(x, k)])
      )
    return v
  }
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}

const cadastros = new Set([
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'imagens',
  'configuracoes'
])
const nomes: Record<string, string> = {
  clientes: 'Cliente',
  servicos: 'Serviço',
  observacoes_padrao: 'Observação padrão',
  pagamentos_padrao: 'Forma de pagamento',
  imagens: 'Imagem',
  configuracoes: 'Configuração da empresa',
  orcamento: 'Orçamento',
  relatorio: 'Relatório',
  recibo: 'Recibo'
}
export const filaAnterior = filaAtiva
export const revisaoFilaAnterior = (): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        fila: filaAnterior(),
        conflitos: all('SELECT * FROM conflitos_nuvem ORDER BY rowid')
      })
    )
    .digest('hex')
export type EntidadeConferencia = {
  entidade: string
  payload: {
    tabela?: string
    id: string
    row?: Record<string, unknown> | null
    tipo?: string
    rows?: Record<string, unknown[]>
  }
}
export function analisarPendenciasAnteriores(
  remotos: EntidadeConferencia[]
): AtualizacaoNumeracaoPendente {
  const filas = filaAnterior(),
    mapa = new Map(remotos.map((r) => [r.entidade, r.payload]))
  const registros = filas.map((l) => {
    let p: EntidadeConferencia['payload'] | null = null
    try {
      p = JSON.parse(texto(l.payload))
    } catch {
      /* Conteúdo ilegível permanece preservado. */
    }
    const remoto = mapa.get(texto(l.entidade)),
      t = p?.tabela ?? p?.tipo ?? ''
    let equivalente = false
    if (
      p?.tabela &&
      cadastros.has(p.tabela) &&
      p.id &&
      p.row &&
      (!['configuracoes'].includes(p.tabela) ||
        ['empresa', 'parametros', 'camposClientePadrao'].includes(p.id))
    ) {
      const coluna = p.tabela === 'configuracoes' ? 'chave' : p.tabela === 'imagens' ? 'hash' : 'id'
      const local = get(`SELECT * FROM ${p.tabela} WHERE ${coluna}=?`, [p.id])
      equivalente = !!remoto && conteudoEquivalente(p, remoto) && conteudoEquivalente(local, p.row)
    }
    return {
      id: texto(l.id),
      entidade: texto(l.entidade),
      rotulo: `${nomes[t] ?? 'Registro'}${typeof p?.row?.nome === 'string' ? `: ${p.row.nome}` : ''}`,
      situacao: equivalente
        ? ('equivalente' as const)
        : remoto
          ? ('divergente' as const)
          : ('ausente' as const),
      grupo: texto(l.grupo) || texto(l.id)
    }
  })
  // Uma operação de documento ou financeira impede a retirada automática de todo o grupo.
  for (const r of registros)
    if (registros.some((x) => x.grupo === r.grupo && x.situacao !== 'equivalente'))
      if (r.situacao === 'equivalente') r.situacao = 'divergente'
  for (const c of all('SELECT * FROM conflitos_nuvem ORDER BY rowid'))
    registros.push({
      id: texto(c.id),
      entidade: texto(c.entidade),
      rotulo: 'Conflito da versão anterior',
      situacao: 'divergente',
      grupo: texto(c.id)
    })
  return {
    revisao: revisaoFilaAnterior(),
    total: registros.length,
    equivalentes: registros.filter((r) => r.situacao === 'equivalente').length,
    divergentes: registros.filter((r) => r.situacao !== 'equivalente').length,
    registros: registros.map(({ grupo: _, ...r }) => r)
  }
}

export function suspenderPendenciasAnteriores(revisao: string): void {
  if (revisaoFilaAnterior() !== revisao)
    throw new Error(
      'As pendências mudaram durante a conferência. Revise novamente antes de atualizar a base.'
    )
  if (get('SELECT 1 FROM conflitos_nuvem LIMIT 1'))
    throw new Error(
      'Há conflitos de documentos que precisam de comparação. As alterações antigas continuam preservadas.'
    )
  const fila = filaAnterior()
  if (
    fila.some((l) => {
      try {
        const p = JSON.parse(texto(l.payload))
        return !cadastros.has(p.tabela)
      } catch {
        return true
      }
    })
  )
    throw new Error(
      'Há alterações de documentos ou pagamentos que precisam de comparação. Elas foram mantidas para revisão, sem envio automático.'
    )
  // As operações permanecem intactas na fila e no arquivo de auditoria. Somente
  // a publicação automática fica suspensa; não apaga nem reaplica pagamentos.
  marcarGrupo(fila, 'preservada')
}

export function preservarPendenciasAnteriores(empresa: string, usuario: string): string {
  const id = randomUUID(),
    dados = JSON.stringify({
      empresa,
      usuario,
      fila: filaAnterior(),
      conflitos: all('SELECT * FROM conflitos_nuvem ORDER BY rowid')
    })
  tx(() =>
    run('INSERT INTO auditoria_colaboracao VALUES (?,?,?,?,?,?,?)', [
      id,
      new Date().toISOString(),
      usuario,
      null,
      'numeracao:pendencias-anteriores',
      null,
      dados
    ])
  )
  const backup = join(pastaDados(), `antes-recuperacao-numeracao-${Date.now()}-${id}.gdo-backup`)
  exportarDadosPara(backup)
  const copia = new Database(backup)
  try {
    const preservado = copia.get('SELECT dados FROM auditoria_colaboracao WHERE id=?', [id]) as {
      dados?: string
    } | null
    if (preservado?.dados !== dados)
      throw new Error(
        'Não foi possível verificar as alterações antigas no backup. As pendências foram mantidas.'
      )
  } finally {
    copia.close()
  }
  return backup
}

export function retirarPendenciasAnteriores(revisao: string, ids: string[]): void {
  if (revisaoFilaAnterior() !== revisao)
    throw new Error(
      'As pendências mudaram durante a conferência. Revise novamente antes de atualizar a base.'
    )
  tx(() => {
    for (const id of ids) run('DELETE FROM fila_nuvem WHERE id=?', [id])
  })
}
