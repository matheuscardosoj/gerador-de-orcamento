// Aplicação, no banco local, dos pacotes recebidos da nuvem (cadastros, documentos, controle de
// edição, numeração e autoria). Não faz rede: recebe o pacote já baixado.
import { linhaImagemValida } from '@shared/imagem-segura'
import type { TipoDocumento } from '@shared/types'
import { all, get, run, texto } from './db/sqlite'
import { tabelaNumerosUsados } from './numeros'
import { registrarCodigoRemoto } from './codigos-cadastros'
import { tabelasFilhos } from './versoes'
import { temOperacaoAtiva } from './fila-nuvem'
import { config, permitido, protocoloNuvem, salvar, tabelas, tipos } from './nuvem-config'

function upsert(t: string, row: Record<string, unknown>): void {
  if (!permitido.has(t)) throw new Error('Tabela remota desconhecida.')
  const cols = new Set(all(`PRAGMA table_info(${t})`).map((l) => texto(l.name)))
  const chaves = Object.keys(row)
  if (!chaves.length || chaves.some((k) => !cols.has(k)))
    throw new Error('Estrutura remota incompatível. Atualize o aplicativo.')
  const pk = new Set(
    all(`PRAGMA table_info(${t})`)
      .filter((l) => Number(l.pk) > 0)
      .map((l) => texto(l.name))
  )
  const atualizaveis = chaves.filter((k) => !pk.has(k))
  run(
    `INSERT INTO ${t} (${chaves.join(',')}) VALUES (${chaves.map(() => '?').join(',')}) ON CONFLICT DO UPDATE SET ${atualizaveis.map((k) => `${k}=excluded.${k}`).join(',')}`,
    chaves.map((k) => row[k])
  )
  if (tabelas.includes(t)) {
    const id = texto(row.id ?? row.hash ?? row.chave)
    salvar(`estado:${t}:${id}`, JSON.stringify({ tabela: t, id, row }))
  }
}
export type Remoto = {
  emissao?: { tipo: TipoDocumento; documento_id: string; numero: number; criado_em: string } | null
  controle?: {
    tipo: TipoDocumento
    documento_id: string
    usuario_id: string
    dispositivo: string
    geracao: number
    expira_em: string | null
    offline: boolean
    revisao: number
  } | null
  autoria?: {
    tipo: TipoDocumento
    documento_id: string
    usuario_criador: string | null
    alterado_por: string | null
  } | null
  identificador?: {
    tipo: TipoDocumento
    documento_id: string
    id_interno: number
    usuario_criador: string | null
    alterado_por: string | null
  } | null
  entidade: string
  revisao: number
  sequencia: number
  payload: {
    tabela?: string
    id: string
    row?: Record<string, unknown>
    rows?: Record<string, Array<Record<string, unknown>>>
    tipo?: TipoDocumento
    excluido?: boolean
  }
}
export function ordenarDependencias(dados: Remoto[]): Remoto[] {
  const ordem = (e: Remoto): number =>
    e.payload.tabela
      ? 0
      : e.payload.tipo === 'orcamento'
        ? 1
        : e.payload.tipo === 'relatorio'
          ? 2
          : 3
  return dados.sort((a, b) => ordem(a) - ordem(b) || a.sequencia - b.sequencia)
}
export function aplicar(e: Remoto): void {
  aplicarIdentificador(e)
  const p = e.payload
  if (p.tabela) {
    if (!tabelas.includes(p.tabela)) throw new Error('Entidade remota inválida.')
    if (
      p.tabela === 'configuracoes' &&
      !['empresa', 'parametros', 'camposClientePadrao'].includes(p.id)
    )
      throw new Error('Configuração não compartilhável.')
    if (p.row) {
      // Imagem malformada vinda da nuvem é ignorada (não grava nem trava a sincronização
      // dos demais): o conteúdo vai parar em atributos `src` dos documentos.
      if (p.tabela === 'imagens' && !linhaImagemValida(p.row))
        console.warn(`[nuvem] imagem remota inválida ignorada: ${String(p.id).slice(0, 16)}`)
      else upsert(p.tabela, p.row)
      if (p.tabela === 'clientes') {
        let dados: { codigo?: number } = {}
        try {
          dados = JSON.parse(texto(p.row.dados_json) || '{}')
        } catch {
          // Dados do cliente malformados não impedem a sincronização dos demais registros.
        }
        registrarCodigoRemoto('cliente', dados.codigo, p.id)
      } else if (p.tabela === 'servicos') registrarCodigoRemoto('servico', p.row.codigo, p.id)
    } else
      run(
        `DELETE FROM ${p.tabela} WHERE ${{ configuracoes: 'chave', imagens: 'hash' }[p.tabela] ?? 'id'}=?`,
        [p.id]
      )
  } else if (p.tipo && tipos.includes(p.tipo) && p.rows) {
    const t = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[p.tipo]
    // UPSERT evita REPLACE no pai, que dispararia cascata antes de repor os filhos.
    for (const filho of tabelasFilhos[p.tipo])
      run(`DELETE FROM ${filho} WHERE ${p.tipo}_id=?`, [p.id])
    if (p.excluido) run(`DELETE FROM ${t} WHERE id=?`, [p.id])
    else {
      const pai = p.rows[t]?.[0]
      if (!pai || pai.id !== p.id) throw new Error('Documento remoto inválido.')
      if (
        p.tipo === 'relatorio' &&
        pai.origem_orcamento_id &&
        !get('SELECT 1 FROM orcamentos WHERE id=?', [pai.origem_orcamento_id])
      )
        pai.origem_orcamento_id = null
      const cols = Object.keys(pai)
      const permitidas = new Set(all(`PRAGMA table_info(${t})`).map((l) => texto(l.name)))
      if (cols.some((c) => !permitidas.has(c))) throw new Error('Versão remota incompatível.')
      run(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols
          .filter((c) => c !== 'id')
          .map((c) => `${c}=excluded.${c}`)
          .join(',')}`,
        cols.map((c) => pai[c])
      )
      for (const filho of tabelasFilhos[p.tipo])
        for (const row of p.rows[filho] ?? []) upsert(filho, row)
      if (Number(pai.numero) > 0) {
        run(`INSERT OR IGNORE INTO ${tabelaNumerosUsados()} VALUES (?,?)`, [p.tipo, pai.numero])
        if (protocoloNuvem() >= 3) {
          const chave = {
            orcamento: 'seqOrcamento',
            relatorio: 'seqRelatorio',
            recibo: 'seqRecibo'
          }[p.tipo]
          salvar(chave, Math.max(config<number>(chave) ?? 0, Number(pai.numero)))
        }
      }
    }
    for (const nome of [
      'documento_meta',
      'versoes',
      ...(p.tipo === 'recibo' ? ['recebimentos'] : [])
    ])
      for (const row of p.rows[nome] ?? []) {
        upsert(nome, row)
        if (nome === 'versoes') {
          // Uma exclusão pode chegar antes de o outro PC ter recebido o documento.
          let numero = Number.NaN
          try {
            numero = Number(JSON.parse(String(row.documento)).numero)
          } catch {
            // Versão ilegível: o número fica sem reserva, mas o lote continua.
          }
          if (protocoloNuvem() < 3 && Number.isSafeInteger(numero) && numero > 0)
            run(`INSERT OR IGNORE INTO ${tabelaNumerosUsados()} VALUES (?,?)`, [p.tipo, numero])
        }
      }
  } else throw new Error('Pacote remoto inválido.')
  run(
    'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
    [e.entidade, e.revisao]
  )
}
export function aplicarIdentificador(e: Remoto): void {
  if (e.emissao) {
    if (
      e.emissao.tipo !== e.payload.tipo ||
      e.emissao.documento_id !== e.payload.id ||
      e.emissao.numero <= 0
    )
      throw new Error('Numeração de emissão remota inválida.')
    run(
      'INSERT INTO numeros_emitidos VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET numero=excluded.numero,criado_em=excluded.criado_em',
      [e.emissao.tipo, e.emissao.documento_id, e.emissao.numero, e.emissao.criado_em]
    )
  }
  if (e.payload.tipo && !e.payload.excluido && !temOperacaoAtiva(e.entidade)) {
    const versoes = e.payload.rows?.versoes ?? []
    const ultima = [...versoes].sort((a, b) => Number(b.numero) - Number(a.numero))[0]
    if (ultima && typeof ultima.documento === 'string') {
      const d = JSON.parse(ultima.documento)
      if (d.id !== e.payload.id) throw new Error('Snapshot remoto não corresponde ao documento.')
      run(
        'INSERT INTO bases_documento VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET revisao=excluded.revisao,documento=excluded.documento',
        [e.payload.tipo, e.payload.id, e.revisao, ultima.documento]
      )
    }
  }
  const c = e.controle
  if (c) {
    if (
      c.tipo !== e.payload.tipo ||
      c.documento_id !== e.payload.id ||
      !Number.isSafeInteger(c.geracao) ||
      c.geracao < 1
    )
      throw new Error('Controle de edição remoto inválido.')
    run(
      'INSERT INTO edicoes_documento VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET usuario=excluded.usuario,computador=excluded.computador,geracao=excluded.geracao,expira_em=excluded.expira_em,offline=excluded.offline,base_revisao=excluded.base_revisao WHERE excluded.geracao>=edicoes_documento.geracao',
      [
        c.tipo,
        c.documento_id,
        c.usuario_id,
        c.dispositivo,
        c.geracao,
        c.expira_em,
        c.offline ? 1 : 0,
        c.revisao
      ]
    )
  }
  const i = e.autoria ?? e.identificador
  if (!i) return
  if (i.documento_id !== e.payload.id || i.tipo !== e.payload.tipo)
    throw new Error('Autoria remota inválida.')
  run(
    'INSERT INTO autoria_documentos VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET usuario_criador=excluded.usuario_criador,alterado_por=excluded.alterado_por',
    [i.tipo, i.documento_id, i.usuario_criador, i.alterado_por]
  )
}
