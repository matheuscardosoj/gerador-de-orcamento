import { semRastreamento, nuvemConfigurada, registrarVersao } from './versoes'
import { recibosRepo } from './recibos'
import { aplicarMigracoes, VERSAO_BANCO } from './db/schema'
import { app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { createHash, randomUUID } from 'crypto'
import { abrirBanco, caminhoBanco, fecharBanco, get, run, tx, type Linha } from './db/sqlite'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import type { ResultadoImportacaoDados } from '@shared/api'

import { type Resumo } from './dados-comuns'
import {
  criarContextoMescla,
  mesclarCadastros,
  mesclarOrcamentosERelatorios,
  mesclarRecibos,
  mesclarVersoes,
  mesclarEmissoesEAutoria,
  mesclarRascunhos
} from './dados-mesclagem'
import { resumo, linhas, temTabela } from './dados-auxiliares'

type Modo = 'restaurar' | 'mesclar'

const agoraNome = (): string => new Date().toISOString().replace(/[:.]/g, '-')

function pastaBackups(): string {
  const dir = join(app.getPath('userData'), 'data', 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function validar(caminho: string): void {
  const fonte = new Database(caminho)
  try {
    const integridade = String(
      (fonte.get('PRAGMA integrity_check') as { integrity_check?: string } | null)
        ?.integrity_check ?? ''
    )
    if (integridade.toLowerCase() !== 'ok')
      throw new Error(`Arquivo inválido: integridade SQLite = ${integridade || 'sem resposta'}.`)
    const versao = Number(
      (fonte.get('PRAGMA user_version') as { user_version?: number } | null)?.user_version ?? 0
    )
    if (versao < 1 || versao > VERSAO_BANCO)
      throw new Error(`Este backup usa uma versão de banco não suportada (${versao}).`)
    const obrigatorias = [
      'configuracoes',
      'clientes',
      'servicos',
      'observacoes_padrao',
      'pagamentos_padrao',
      'orcamentos',
      'itens_servico',
      'materiais',
      'orcamento_textos',
      'anexos'
    ]
    if (versao >= 2)
      obrigatorias.push(
        'relatorios',
        'relatorio_itens_servico',
        'relatorio_lancamentos',
        'relatorio_textos',
        'relatorio_anexos'
      )
    if (versao >= 7)
      obrigatorias.push(
        'imagens',
        'documento_meta',
        'versoes',
        'recibos',
        'recebimentos',
        'numeros_usados',
        'reservas',
        'sincronizacao',
        'fila_nuvem',
        'conflitos_nuvem'
      )
    if (versao >= 9)
      obrigatorias.push(
        versao >= 10 ? 'autoria_documentos' : 'identificadores_documento',
        'numeros_emitidos',
        'bases_documento',
        'edicoes_documento',
        'rascunhos_compartilhados',
        'auditoria_colaboracao'
      )
    if (versao >= 10) obrigatorias.push('numeros_atribuidos')
    if (versao >= 13) obrigatorias.push('rascunhos_cadastros')
    const faltantes = obrigatorias.filter(
      (nome) =>
        !fonte.get("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?", [
          nome
        ] as never)
    )
    if (faltantes.length)
      throw new Error(`Arquivo incompatível: faltam as tabelas ${faltantes.join(', ')}.`)
    const referenciasInvalidas = fonte.all('PRAGMA foreign_key_check') as unknown[]
    if (referenciasInvalidas.length)
      throw new Error(
        `Arquivo inválido: ${referenciasInvalidas.length} referência(s) interna(s) inconsistente(s).`
      )
  } finally {
    fonte.close()
  }
}

function comBancoFechado<T>(acao: () => T): T {
  fecharBanco()
  try {
    return acao()
  } finally {
    abrirBanco()
  }
}

function copiarEValidar(origem: string, destino: string): void {
  const temporario = `${destino}.temporario-${Date.now()}`
  try {
    copyFileSync(origem, temporario)
    validar(temporario)
    copyFileSync(temporario, destino)
    validar(destino)
  } finally {
    if (existsSync(temporario)) rmSync(temporario, { force: true })
  }
}

function idOrigemAtual(): string {
  const existente = get('SELECT valor FROM configuracoes WHERE chave = ?', ['idOrigemDados'])
  if (existente?.valor) {
    try {
      return String(JSON.parse(String(existente.valor)))
    } catch {
      return String(existente.valor)
    }
  }
  const id = randomUUID()
  run('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)', [
    'idOrigemDados',
    JSON.stringify(id)
  ])
  return id
}

function idOrigemFonte(fonte: Database): { id: string; legado: boolean } {
  const linha = fonte.get('SELECT valor FROM configuracoes WHERE chave = ?', [
    'idOrigemDados'
  ] as never) as { valor?: unknown } | null
  if (linha?.valor) {
    try {
      return { id: String(JSON.parse(String(linha.valor))), legado: false }
    } catch {
      return { id: String(linha.valor), legado: false }
    }
  }
  const primeiro =
    (fonte.get('SELECT id FROM orcamentos ORDER BY criado_em, id LIMIT 1') as {
      id?: unknown
    } | null) ??
    (temTabela(fonte, 'relatorios')
      ? (fonte.get('SELECT id FROM relatorios ORDER BY criado_em, id LIMIT 1') as {
          id?: unknown
        } | null)
      : null) ??
    (fonte.get('SELECT id FROM clientes ORDER BY criado_em, id LIMIT 1') as { id?: unknown } | null)
  return { id: `legado-${String(primeiro?.id ?? 'vazio')}`, legado: true }
}

function limparAutorizacoesDaCopia(destino: string): void {
  const copia = new Database(destino)
  try {
    // Somente a cópia é migrada. A fila original permanece intacta no banco em uso.
    aplicarMigracoes(copia)
    copia.exec('BEGIN')
    for (const evento of auditoriaOperacoesNaoConfirmadas(copia))
      copia.run('INSERT OR IGNORE INTO auditoria_colaboracao VALUES (?,?,?,?,?,?,?)', [
        evento.id,
        evento.criado_em,
        evento.usuario,
        evento.computador,
        evento.acao,
        evento.entidade,
        evento.dados
      ] as never)
    copia.exec(
      "DELETE FROM configuracoes WHERE chave IN ('computadorId','sessaoNuvem','nuvem','usuarioNuvem','contextoNuvem','empresaNuvem','cursorNuvem','ultimaNuvem','erroNuvem','bytesNuvem','membrosCache','pedidosEdicaoCache','atualizacaoNumeracaoPendente','operacoesAnterioresSuspensas','backupAtualizacaoNumeracao','renumeracaoPendente') OR chave LIKE 'estado:%' OR chave LIKE 'transferencia:%' OR chave LIKE 'computadorUsuario:%' OR chave LIKE 'numeracaoNuvem:%';"
    )
    if (temTabela(copia, 'reservas'))
      copia.exec(
        'DELETE FROM reservas;DELETE FROM fila_nuvem;DELETE FROM sincronizacao;DELETE FROM conflitos_nuvem;'
      )
    if (temTabela(copia, 'edicoes_documento')) copia.exec('DELETE FROM edicoes_documento')
    copia.run("INSERT OR REPLACE INTO configuracoes VALUES ('restauracaoLocal','true')")
    copia.exec('COMMIT')
  } catch (erro) {
    try {
      copia.exec('ROLLBACK')
    } catch {
      // Uma falha de migração anterior ao BEGIN já foi revertida pela própria migração.
    }
    throw erro
  } finally {
    copia.close()
  }
  validar(destino)
}

/** Evidência histórica; nunca é reintroduzida na fila de publicação. */
function auditoriaOperacoesNaoConfirmadas(fonte: Database): Linha[] {
  if (!temTabela(fonte, 'fila_nuvem')) return []
  const origem = idOrigemFonte(fonte).id
  const conflitos = temTabela(fonte, 'conflitos_nuvem')
    ? linhas(fonte, 'SELECT * FROM conflitos_nuvem ORDER BY id')
    : []
  const operacoes = linhas(fonte, 'SELECT * FROM fila_nuvem ORDER BY criado_em,id')
  const idsOperacoes = new Set(operacoes.map((op) => String(op.id)))
  const evento = (acao: string, entidade: unknown, conteudo: unknown, criadoEm: unknown): Linha => {
    const dados = JSON.stringify({ origemDados: origem, ...(conteudo as object) })
    const hash = createHash('sha256').update(`${acao}\n${dados}`).digest('hex')
    return {
      id: `backup-fila-${hash}`,
      criado_em: String(criadoEm || '1970-01-01T00:00:00.000Z'),
      usuario: null,
      computador: null,
      acao,
      entidade: entidade == null ? null : String(entidade),
      dados
    }
  }
  return [
    ...operacoes.map((op) =>
      evento(
        'backup:operacao-nao-confirmada',
        op.entidade,
        {
          operacao: {
            ...op,
            opid: op.id,
            grupo: op.grupo ?? '',
            geracao: op.geracao ?? null,
            estado: op.estado ?? 'pendente',
            erro: op.erro ?? null
          },
          conflitos: conflitos.filter((conflito) => conflito.id === op.id)
        },
        op.criado_em
      )
    ),
    ...conflitos
      .filter((conflito) => !idsOperacoes.has(String(conflito.id)))
      .map((conflito) =>
        evento('backup:conflito-nao-confirmado', conflito.entidade, { conflito }, null)
      )
  ]
}

function mesclarAuditoriaPreservada(fonte: Database): void {
  const registros = [
    ...(temTabela(fonte, 'auditoria_colaboracao')
      ? linhas(fonte, 'SELECT * FROM auditoria_colaboracao ORDER BY criado_em,id')
      : []),
    ...auditoriaOperacoesNaoConfirmadas(fonte)
  ]
  for (const registro of registros) {
    let id = String(registro.id)
    const existente = get('SELECT * FROM auditoria_colaboracao WHERE id=?', [id])
    if (existente) {
      if (
        ['criado_em', 'usuario', 'computador', 'acao', 'entidade', 'dados'].every(
          (campo) => existente[campo] === registro[campo]
        )
      )
        continue
      // Preserve também um evento diferente que reutilize um identificador antigo.
      id = `backup-evento-${createHash('sha256').update(JSON.stringify(registro)).digest('hex')}`
    }
    run('INSERT OR IGNORE INTO auditoria_colaboracao VALUES (?,?,?,?,?,?,?)', [
      id,
      registro.criado_em,
      registro.usuario,
      registro.computador,
      registro.acao,
      registro.entidade,
      registro.dados
    ])
  }
}

function backupAntesImportar(): string {
  const destino = join(pastaBackups(), `banco-antes-importacao-${agoraNome()}.gdo-backup`)
  comBancoFechado(() => copiarEValidar(caminhoBanco(), destino))
  limparAutorizacoesDaCopia(destino)
  return destino
}

export async function exportarDados(): Promise<{ caminho: string | null }> {
  const nome = `Backup Gerador de Orçamentos - ${new Date().toISOString().slice(0, 10).split('-').reverse().join('.')}.gdo-backup`
  const escolha = await dialog.showSaveDialog({
    title: 'Exportar cópia de segurança',
    defaultPath: nome,
    filters: [{ name: 'Backup do Gerador', extensions: ['gdo-backup'] }]
  })
  if (escolha.canceled || !escolha.filePath) return { caminho: null }
  exportarDadosPara(escolha.filePath)
  return { caminho: escolha.filePath }
}

/** Exportação sem diálogo, usada pela interface e pelos testes de integridade. */
export function exportarDadosPara(destino: string): void {
  const normalizarCaminho = (p: string): string =>
    process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p)
  if (normalizarCaminho(destino) === normalizarCaminho(caminhoBanco()))
    throw new Error('Escolha outro arquivo para a cópia. O banco em uso não pode ser sobrescrito.')
  idOrigemAtual()
  comBancoFechado(() => copiarEValidar(caminhoBanco(), destino))
  limparAutorizacoesDaCopia(destino)
}

function mesclar(fonte: Database): Resumo {
  const r = resumo()
  mesclarAuditoriaPreservada(fonte)
  const origem = idOrigemFonte(fonte)
  const mesmaOrigem = !origem.legado && origem.id === idOrigemAtual()
  const contexto = criarContextoMescla(fonte, r, origem, mesmaOrigem)
  mesclarCadastros(contexto)
  mesclarOrcamentosERelatorios(contexto)
  mesclarRecibos(contexto)
  mesclarVersoes(contexto)
  mesclarEmissoesEAutoria(contexto)
  mesclarRascunhos(contexto)
  if (get('PRAGMA foreign_key_check'))
    throw new Error('A mesclagem produziria referências internas inválidas e foi cancelada.')
  return r
}

export function importarDadosDe(origem: string, modo: Modo): ResultadoImportacaoDados {
  if (nuvemConfigurada())
    throw new Error(
      'Restaure ou mescle o backup em um perfil local separado. A importação não publica nem substitui a base da empresa na nuvem.'
    )
  validar(origem)
  // A identidade pertence ao perfil de destino; nunca vem do arquivo importado.
  const computadorDestino = get("SELECT valor FROM configuracoes WHERE chave='computadorId'")?.valor
  const backupAntes = backupAntesImportar()
  if (modo === 'mesclar') {
    const fonte = new Database(origem)
    try {
      const r = semRastreamento(() =>
        tx(() => {
          const resultado = mesclar(fonte)
          inicializarVersoesImportadas()
          return resultado
        })
      )
      return { modo, backupAntes, ...r, reiniciarNecessario: false }
    } finally {
      fonte.close()
    }
  }
  const temporario = `${caminhoBanco()}.importando-${Date.now()}`
  try {
    copyFileSync(origem, temporario)
    validar(temporario)
    limparAutorizacoesDaCopia(temporario)
    if (computadorDestino) {
      const copia = new Database(temporario)
      try {
        copia.run('INSERT OR REPLACE INTO configuracoes VALUES (?,?)', [
          'computadorId',
          computadorDestino
        ] as never)
      } finally {
        copia.close()
      }
    }
    fecharBanco()
    copyFileSync(temporario, caminhoBanco())
    abrirBanco()
    inicializarVersoesImportadas()
    validar(caminhoBanco())
    return { modo, backupAntes, ...resumo(), reiniciarNecessario: true }
  } catch (e) {
    fecharBanco()
    copyFileSync(backupAntes, caminhoBanco())
    abrirBanco()
    if (computadorDestino)
      run('INSERT OR REPLACE INTO configuracoes VALUES (?,?)', ['computadorId', computadorDestino])
    throw e
  } finally {
    if (existsSync(temporario)) rmSync(temporario, { force: true })
  }
}

function inicializarVersoesImportadas(): void {
  tx(() => {
    for (const tipo of ['orcamento', 'relatorio', 'recibo'] as const) {
      const repo =
        tipo === 'orcamento' ? orcamentosRepo : tipo === 'relatorio' ? relatoriosRepo : recibosRepo
      for (const resumo of repo.list()) {
        const documento = repo.get(resumo.id)
        if (documento && !documento.versao)
          registrarVersao(tipo, documento, 'Versão inicial após importação')
      }
    }
  })
}

export async function importarDados(modo: Modo): Promise<ResultadoImportacaoDados | null> {
  const escolha = await dialog.showOpenDialog({
    title: 'Selecionar cópia de segurança',
    properties: ['openFile'],
    filters: [{ name: 'Backup do Gerador', extensions: ['gdo-backup', 'db'] }]
  })
  if (escolha.canceled || !escolha.filePaths[0]) return null
  return importarDadosDe(escolha.filePaths[0], modo)
}
