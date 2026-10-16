import { registrarImagem } from './imagens'
import { semRastreamento, nuvemConfigurada, registrarVersao } from './versoes'
import { recibosRepo } from './recibos'
import { randomUUID as novoId } from 'crypto'
import { aplicarMigracoes, VERSAO_BANCO } from './db/schema'
import { app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { createHash, randomUUID } from 'crypto'
import { abrirBanco, caminhoBanco, fecharBanco, get, run, tx, type Linha } from './db/sqlite'
import {
  clientesRepo,
  orcamentosRepo,
  relatoriosRepo,
  servicosRepo,
  observacoesRepo,
  pagamentosRepo
} from './repositories'
import type { ResultadoImportacaoDados } from '@shared/api'
import type {
  FormaPagamentoPadrao,
  ItemMaterial,
  ItemServico,
  ItemTexto,
  LancamentoRelatorio,
  ObservacaoPadrao
} from '@shared/types'

type Modo = 'restaurar' | 'mesclar'
type Resumo = Pick<ResultadoImportacaoDados, 'importados' | 'ignorados' | 'renumerados'>

const tabelas = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'orcamentos',
  'relatorios',
  'anexos',
  'relatorio_anexos'
]
const agoraNome = (): string => new Date().toISOString().replace(/[:.]/g, '-')
const normal = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')

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

function resumo(): Resumo {
  return {
    importados: Object.fromEntries(tabelas.map((t) => [t, 0])),
    ignorados: Object.fromEntries(tabelas.map((t) => [t, 0])),
    renumerados: { orcamentos: 0, relatorios: 0 }
  }
}
function contar(
  r: Resumo,
  grupo: keyof Resumo['importados'],
  tipo: 'importados' | 'ignorados'
): void {
  r[tipo][grupo] = (r[tipo][grupo] ?? 0) + 1
}
function linha(l: Linha): Record<string, unknown> {
  return l as Record<string, unknown>
}
function linhas(fonte: Database, sql: string, valores: unknown[] = []): Linha[] {
  return fonte.all(sql, valores as never) as Linha[]
}
function temTabela(fonte: Database, nome: string): boolean {
  return Boolean(
    fonte.get("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?", [
      nome
    ] as never)
  )
}

function imagemImportada(_fonte: Database, x: Record<string, unknown>): string | null {
  if (!x.imagem) return null
  if (typeof x.imagem === 'string') return x.imagem
  const mime = String(x.mime || 'image/jpeg')
  return registrarImagem(
    `data:${mime};base64,${Buffer.from(x.imagem as Uint8Array).toString('base64')}`,
    x.miniatura
      ? `data:${mime};base64,${Buffer.from(x.miniatura as Uint8Array).toString('base64')}`
      : null,
    Number(x.largura),
    Number(x.altura),
    true
  )
}
function copiarAnexosOrcamento(
  fonte: Database,
  origemId: string,
  destinoId: string,
  itens: Map<string, string>
): number {
  if (!temTabela(fonte, 'anexos')) return 0
  let total = 0
  for (const a of linhas(fonte, 'SELECT * FROM anexos WHERE orcamento_id = ? ORDER BY ordem', [
    origemId
  ])) {
    const x = linha(a)
    run(
      `INSERT INTO anexos (id, orcamento_id, item_servico_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        destinoId,
        x.item_servico_id ? (itens.get(String(x.item_servico_id)) ?? null) : null,
        x.ordem,
        x.titulo,
        x.descricao,
        x.mime,
        x.largura,
        x.altura,
        imagemImportada(fonte, x),
        null
      ]
    )
    total++
  }
  return total
}

function copiarAnexosRelatorio(
  fonte: Database,
  origemId: string,
  destinoId: string,
  referencias: Map<string, string>
): number {
  if (!temTabela(fonte, 'relatorio_anexos')) return 0
  let total = 0
  for (const a of linhas(
    fonte,
    'SELECT * FROM relatorio_anexos WHERE relatorio_id = ? ORDER BY ordem',
    [origemId]
  )) {
    const x = linha(a)
    run(
      `INSERT INTO relatorio_anexos (id, relatorio_id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        destinoId,
        x.referencia_tipo,
        x.referencia_id ? (referencias.get(String(x.referencia_id)) ?? null) : null,
        x.ordem,
        x.titulo,
        x.descricao,
        x.mime,
        x.largura,
        x.altura,
        imagemImportada(fonte, x),
        null
      ]
    )
    total++
  }
  return total
}

function itensOrcamento(
  fonte: Database,
  id: string,
  servicos: Map<string, string>,
  observacoes: Map<string, string>,
  pagamentos: Map<string, string>
): {
  itensServico: ItemServico[]
  materiais: ItemMaterial[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
} {
  const itensServico = linhas(
    fonte,
    'SELECT * FROM itens_servico WHERE orcamento_id = ? ORDER BY ordem',
    [id]
  ).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      servicoId: x.servico_id ? (servicos.get(String(x.servico_id)) ?? null) : null,
      descricao: String(x.descricao ?? ''),
      unidade: String(x.unidade ?? ''),
      quantidade: Number(x.quantidade ?? 0),
      valorUnitario: Number(x.valor_unitario ?? 0),
      valorTotal: Number(x.valor_total ?? 0),
      calculo: x.calculo_json ? JSON.parse(String(x.calculo_json)) : null
    }
  })
  const materiais = linhas(fonte, 'SELECT * FROM materiais WHERE orcamento_id = ? ORDER BY ordem', [
    id
  ]).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      quantidade: Number(x.quantidade ?? 0),
      unidade: String(x.unidade ?? ''),
      especificacao: String(x.especificacao ?? '')
    }
  })
  const textosDoTipo = (tipo: string, mapa: Map<string, string>): ItemTexto[] =>
    linhas(
      fonte,
      'SELECT * FROM orcamento_textos WHERE orcamento_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      const origem = x.origem_padrao_id ? (mapa.get(String(x.origem_padrao_id)) ?? null) : null
      return { id: String(x.id), texto: String(x.texto ?? ''), origemPadraoId: origem }
    })
  return {
    itensServico,
    materiais,
    observacoes: textosDoTipo('observacao', observacoes),
    pagamentos: textosDoTipo('pagamento', pagamentos)
  }
}

function itensRelatorio(
  fonte: Database,
  id: string,
  servicos: Map<string, string>,
  observacoes: Map<string, string>,
  pagamentos: Map<string, string>
): {
  itensServico: ItemServico[]
  adiantamentos: LancamentoRelatorio[]
  reembolsos: LancamentoRelatorio[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
} {
  const itensServico = linhas(
    fonte,
    'SELECT * FROM relatorio_itens_servico WHERE relatorio_id = ? ORDER BY ordem',
    [id]
  ).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      servicoId: x.servico_id ? (servicos.get(String(x.servico_id)) ?? null) : null,
      descricao: String(x.descricao ?? ''),
      unidade: String(x.unidade ?? ''),
      quantidade: Number(x.quantidade ?? 0),
      valorUnitario: Number(x.valor_unitario ?? 0),
      valorTotal: Number(x.valor_total ?? 0),
      calculo: x.calculo_json ? JSON.parse(String(x.calculo_json)) : null
    }
  })
  const lancamentos = (tipo: string): LancamentoRelatorio[] =>
    linhas(
      fonte,
      'SELECT * FROM relatorio_lancamentos WHERE relatorio_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      return { id: String(x.id), descricao: String(x.descricao ?? ''), valor: Number(x.valor ?? 0) }
    })
  const textosDoTipo = (tipo: string, mapa: Map<string, string>): ItemTexto[] =>
    linhas(
      fonte,
      'SELECT * FROM relatorio_textos WHERE relatorio_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      return {
        id: String(x.id),
        texto: String(x.texto ?? ''),
        origemPadraoId: x.origem_padrao_id ? (mapa.get(String(x.origem_padrao_id)) ?? null) : null
      }
    })
  return {
    itensServico,
    adiantamentos: lancamentos('adiantamento'),
    reembolsos: lancamentos('reembolso'),
    observacoes: textosDoTipo('observacao', observacoes),
    pagamentos: textosDoTipo('pagamento', pagamentos)
  }
}

function novosIdsOrcamento(filhos: ReturnType<typeof itensOrcamento>): {
  filhos: ReturnType<typeof itensOrcamento>
  referencias: Map<string, string>
} {
  const referencias = new Map<string, string>()
  const itensServico = filhos.itensServico.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  return {
    filhos: {
      ...filhos,
      itensServico,
      materiais: filhos.materiais.map((item) => ({ ...item, id: randomUUID() })),
      observacoes: filhos.observacoes.map((item) => ({ ...item, id: randomUUID() })),
      pagamentos: filhos.pagamentos.map((item) => ({ ...item, id: randomUUID() }))
    },
    referencias
  }
}

function novosIdsRelatorio(filhos: ReturnType<typeof itensRelatorio>): {
  filhos: ReturnType<typeof itensRelatorio>
  referencias: Map<string, string>
} {
  const referencias = new Map<string, string>()
  const itensServico = filhos.itensServico.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  const adiantamentos = filhos.adiantamentos.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  const reembolsos = filhos.reembolsos.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  return {
    filhos: {
      ...filhos,
      itensServico,
      adiantamentos,
      reembolsos,
      observacoes: filhos.observacoes.map((item) => ({ ...item, id: randomUUID() })),
      pagamentos: filhos.pagamentos.map((item) => ({ ...item, id: randomUUID() }))
    },
    referencias
  }
}

function idLivre(
  tabela: 'clientes' | 'servicos' | 'observacoes_padrao' | 'pagamentos_padrao',
  desejado: string
): string {
  return get(`SELECT 1 AS existe FROM ${tabela} WHERE id = ?`, [desejado]) ? randomUUID() : desejado
}

function mesclar(fonte: Database): Resumo {
  const r = resumo()
  mesclarAuditoriaPreservada(fonte)
  const origem = idOrigemFonte(fonte)
  const mesmaOrigem = !origem.legado && origem.id === idOrigemAtual()
  const clientes = new Map<string, string>()
  const servicos = new Map<string, string>()
  const observacoes = new Map<string, string>()
  const pagamentos = new Map<string, string>()
  const chaveCliente = (nome: unknown, documento?: string): string =>
    documento?.replace(/[^a-z0-9]/gi, '').toUpperCase() || `nome:${normal(nome)}`
  const clientesExistentes = new Map(
    clientesRepo
      .list()
      .map((cliente) => [chaveCliente(cliente.nome, cliente.documento), cliente] as const)
  )
  const chaveServico = (nome: unknown, unidade: unknown): string =>
    `${normal(nome)}\u0000${normal(unidade)}`
  const servicosExistentes = new Map(
    servicosRepo
      .list()
      .map((servico) => [chaveServico(servico.nome, servico.unidade), servico] as const)
  )
  const chaveTexto = (texto: unknown, aplicacao: unknown): string =>
    `${normal(texto)}\u0000${String(aplicacao)}`
  const observacoesExistentes = new Map(
    observacoesRepo.list().map((item) => [chaveTexto(item.texto, item.aplicacao), item] as const)
  )
  const pagamentosExistentes = new Map(
    pagamentosRepo.list().map((item) => [chaveTexto(item.texto, item.aplicacao), item] as const)
  )
  if (temTabela(fonte, 'imagens'))
    for (const x of linhas(fonte, 'SELECT * FROM imagens'))
      run('INSERT OR IGNORE INTO imagens VALUES (?,?,?,?,?,?,?)', [
        x.hash,
        x.mime,
        x.base64,
        x.miniatura_base64,
        x.bytes,
        x.largura,
        x.altura
      ])
  const idsAntes = new Set(
    [
      ...linhas(fonte, "SELECT 'orcamento' AS tipo,id FROM orcamentos"),
      ...(temTabela(fonte, 'relatorios')
        ? linhas(fonte, "SELECT 'relatorio' AS tipo,id FROM relatorios")
        : []),
      ...(temTabela(fonte, 'recibos')
        ? linhas(fonte, "SELECT 'recibo' AS tipo,id FROM recibos")
        : [])
    ]
      .filter((x) =>
        get('SELECT 1 FROM importacoes_documentos WHERE tipo=? AND origem_id=?', [
          x.tipo,
          `${origem.id}:${x.id}`
        ])
      )
      .map((x) => `${x.tipo}:${x.id}`)
  )
  const referenciasRelatorio = new Map<string, Map<string, string>>()
  const referenciasOrcamento = new Map<string, Map<string, string>>()
  const chaveDocumento = (id: unknown): string => `${origem.id}:${String(id)}`
  const documentoLocalDaMesmaOrigem = (tipo: 'orcamento' | 'relatorio', id: unknown): boolean => {
    if (!mesmaOrigem) return false
    const tabela = tipo === 'orcamento' ? 'orcamentos' : 'relatorios'
    return Boolean(get(`SELECT 1 FROM ${tabela} WHERE id = ?`, [String(id)]))
  }
  const jaImportado = (tipo: 'orcamento' | 'relatorio', id: unknown): boolean =>
    Boolean(
      get('SELECT 1 FROM importacoes_documentos WHERE tipo = ? AND origem_id = ?', [
        tipo,
        chaveDocumento(id)
      ]) ||
      documentoLocalDaMesmaOrigem(tipo, id) ||
      (origem.legado &&
        get('SELECT 1 FROM importacoes_documentos WHERE tipo = ? AND origem_id = ?', [tipo, id]))
    )

  for (const registro of linhas(fonte, 'SELECT * FROM clientes')) {
    const x = linha(registro)
    const origemId = String(x.id)
    const extrasCliente = JSON.parse(String(x.dados_json || '{}'))
    const equivalente = clientesExistentes.get(chaveCliente(x.nome, extrasCliente.documento))
    if (equivalente) {
      clientes.set(origemId, equivalente.id)
      contar(r, 'clientes', 'ignorados')
      continue
    }
    const novo = clientesRepo.create({
      ...extrasCliente,
      id: idLivre('clientes', origemId),
      criadoEm: String(x.criado_em),
      nome: String(x.nome),
      tratamento: String(x.tratamento ?? ''),
      contato: x.contato ? String(x.contato) : '',
      observacao: x.observacao ? String(x.observacao) : '',
      ativo: x.ativo == null || Number(x.ativo) === 1
    })
    clientes.set(origemId, novo.id)
    clientesExistentes.set(chaveCliente(novo.nome, novo.documento), novo)
    contar(r, 'clientes', 'importados')
  }

  const versaoFonte = Number(
    (fonte.get('PRAGMA user_version') as { user_version: number }).user_version
  )
  for (const registro of linhas(
    fonte,
    versaoFonte >= 8
      ? 'SELECT * FROM servicos ORDER BY ordem,nome COLLATE NOCASE,id'
      : 'SELECT * FROM servicos ORDER BY nome COLLATE NOCASE,id'
  )) {
    const x = linha(registro)
    const origemId = String(x.id)
    const equivalente = servicosExistentes.get(chaveServico(x.nome, x.unidade))
    if (equivalente) {
      servicos.set(origemId, equivalente.id)
      contar(r, 'servicos', 'ignorados')
      continue
    }
    const novo = servicosRepo.create({
      id: idLivre('servicos', origemId),
      nome: String(x.nome),
      descricaoPadrao: String(x.descricao_padrao ?? ''),
      unidade: String(x.unidade ?? ''),
      precoReferencia: x.preco_referencia == null ? null : Number(x.preco_referencia)
    })
    servicos.set(origemId, novo.id)
    servicosExistentes.set(chaveServico(novo.nome, novo.unidade), novo)
    contar(r, 'servicos', 'importados')
  }

  const importarTextos = (
    tabela: 'observacoes_padrao' | 'pagamentos_padrao',
    repo: typeof observacoesRepo | typeof pagamentosRepo,
    mapa: Map<string, string>,
    existentes: Map<string, ObservacaoPadrao | FormaPagamentoPadrao>
  ): void => {
    for (const registro of linhas(fonte, `SELECT * FROM ${tabela} ORDER BY ordem,rowid`)) {
      const x = linha(registro)
      const origemId = String(x.id)
      const aplicacao = String(x.aplicacao ?? 'orcamento')
      const equivalente = existentes.get(chaveTexto(x.texto, aplicacao))
      if (equivalente) {
        mapa.set(origemId, equivalente.id)
        contar(r, tabela, 'ignorados')
        continue
      }
      const novo = repo.create({
        id: idLivre(tabela, origemId),
        texto: String(x.texto),
        padrao: Number(x.padrao ?? 0) === 1,
        aplicacao
      } as never)
      mapa.set(origemId, novo.id)
      existentes.set(chaveTexto(novo.texto, novo.aplicacao), novo)
      contar(r, tabela, 'importados')
    }
  }
  importarTextos('observacoes_padrao', observacoesRepo, observacoes, observacoesExistentes)
  importarTextos('pagamentos_padrao', pagamentosRepo, pagamentos, pagamentosExistentes)

  for (const registro of linhas(fonte, 'SELECT * FROM orcamentos ORDER BY criado_em')) {
    const x = linha(registro)
    if (jaImportado('orcamento', x.id)) {
      contar(r, 'orcamentos', 'ignorados')
      continue
    }
    const preparado = novosIdsOrcamento(
      itensOrcamento(fonte, String(x.id), servicos, observacoes, pagamentos)
    )
    referenciasOrcamento.set(String(x.id), preparado.referencias)
    const ocupado = get('SELECT id FROM orcamentos WHERE numero = ?', [x.numero])
    const desejado = ocupado ? undefined : Number(x.numero)
    const novo = orcamentosRepo.create(
      {
        data: String(x.data),
        clienteId: x.cliente_id ? (clientes.get(String(x.cliente_id)) ?? null) : null,
        destinatario: String(x.destinatario ?? ''),
        formato: String(x.formato) as never,
        titulo: String(x.titulo ?? ''),
        introducao: String(x.introducao ?? ''),
        ...preparado.filhos,
        anexos: [],
        prazoDias: x.prazo_dias == null ? null : Number(x.prazo_dias),
        observacaoInterna: String(x.observacao_interna ?? ''),
        valorTotal: Number(x.valor_total ?? 0),
        status: String(x.status) as never,
        numero: desejado
      },
      { numero: desejado, criadoEm: String(x.criado_em), atualizadoEm: String(x.atualizado_em) }
    )
    run(
      "INSERT INTO importacoes_documentos (tipo, origem_id, documento_id) VALUES ('orcamento', ?, ?)",
      [chaveDocumento(x.id), novo.id]
    )
    if (ocupado) r.renumerados.orcamentos++
    r.importados.anexos += copiarAnexosOrcamento(
      fonte,
      String(x.id),
      novo.id,
      preparado.referencias
    )
    contar(r, 'orcamentos', 'importados')
  }

  if (temTabela(fonte, 'relatorios'))
    for (const registro of linhas(fonte, 'SELECT * FROM relatorios ORDER BY criado_em')) {
      const x = linha(registro)
      if (jaImportado('relatorio', x.id)) {
        contar(r, 'relatorios', 'ignorados')
        continue
      }
      const preparado = novosIdsRelatorio(
        itensRelatorio(fonte, String(x.id), servicos, observacoes, pagamentos)
      )
      referenciasRelatorio.set(String(x.id), preparado.referencias)
      const ocupado = get('SELECT id FROM relatorios WHERE numero = ?', [x.numero])
      const desejado = ocupado ? undefined : Number(x.numero)
      const novo = relatoriosRepo.create(
        {
          data: String(x.data),
          clienteId: x.cliente_id ? (clientes.get(String(x.cliente_id)) ?? null) : null,
          destinatario: String(x.destinatario ?? ''),
          formato: String(x.formato) as never,
          titulo: String(x.titulo ?? ''),
          introducao: String(x.introducao ?? ''),
          ...preparado.filhos,
          anexos: [],
          observacaoInterna: String(x.observacao_interna ?? ''),
          status: String(x.status) as never,
          origemOrcamento: x.origem_orcamento_id
            ? {
                id: String(x.origem_orcamento_id),
                numero: Number(x.origem_orcamento_numero ?? 0),
                cliente: String(x.origem_orcamento_cliente ?? '')
              }
            : null,
          totais: {
            servicos: 0,
            adiantamentos: 0,
            reembolsos: 0,
            saldo: 0,
            valorFinal: 0,
            tipoSaldo: 'receber'
          },
          numero: desejado
        },
        {
          numero: desejado,
          criadoEm: String(x.criado_em),
          atualizadoEm: String(x.atualizado_em)
        } as never
      )
      run(
        "INSERT INTO importacoes_documentos (tipo, origem_id, documento_id) VALUES ('relatorio', ?, ?)",
        [chaveDocumento(x.id), novo.id]
      )
      if (ocupado) r.renumerados.relatorios++
      r.importados.relatorio_anexos += copiarAnexosRelatorio(
        fonte,
        String(x.id),
        novo.id,
        preparado.referencias
      )
      contar(r, 'relatorios', 'importados')
    }
  const destinoDocumento = (tipo: string, id: string): string | null => {
    const tabela = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[tipo]
    const m = get('SELECT documento_id FROM importacoes_documentos WHERE tipo=? AND origem_id=?', [
      tipo,
      chaveDocumento(id)
    ])
    return m
      ? String(m.documento_id)
      : mesmaOrigem && tabela && get(`SELECT 1 FROM ${tabela} WHERE id=?`, [id])
        ? id
        : null
  }
  if (temTabela(fonte, 'recibos'))
    for (const x of linhas(fonte, 'SELECT * FROM recibos')) {
      const origemRecibo = String(x.id)
      if (destinoDocumento('recibo', origemRecibo)) continue
      const dados = JSON.parse(String(x.dados))
      const id = novoId()
      const num =
        Number(get("SELECT MAX(numero) AS n FROM numeros_usados WHERE tipo='recibo'")?.n ?? 0) + 1
      const origemDocumento =
        dados.origemId && dados.origemTipo
          ? destinoDocumento(dados.origemTipo, dados.origemId)
          : null
      const referencia = dados.adiantamentoId
        ? (referenciasRelatorio.get(dados.origemId)?.get(dados.adiantamentoId) ??
          dados.adiantamentoId)
        : null
      const d = {
        ...dados,
        id,
        numero: num,
        clienteId: dados.clienteId ? (clientes.get(dados.clienteId) ?? null) : null,
        origemId: origemDocumento,
        adiantamentoId: referencia
      }
      run('INSERT INTO recibos VALUES (?,?,?)', [id, num, JSON.stringify(d)])
      run('INSERT INTO numeros_usados VALUES (?,?)', ['recibo', num])
      run('INSERT INTO importacoes_documentos VALUES (?,?,?)', [
        'recibo',
        chaveDocumento(origemRecibo),
        id
      ])
      if (temTabela(fonte, 'recebimentos'))
        for (const p of linhas(fonte, 'SELECT * FROM recebimentos WHERE recibo_id=?', [
          origemRecibo
        ]))
          run('INSERT INTO recebimentos VALUES (?,?,?,?,?,?)', [
            novoId(),
            id,
            origemDocumento,
            referencia,
            p.valor,
            p.estornado
          ])
      r.importados.recibos = (r.importados.recibos ?? 0) + 1
    }
  if (temTabela(fonte, 'versoes')) {
    const idsVersoes = new Map<string, string>()
    for (const v of linhas(fonte, 'SELECT * FROM versoes ORDER BY tipo,documento_id,numero')) {
      const tipo = String(v.tipo),
        origemDoc = String(v.documento_id)
      const destino = destinoDocumento(tipo, origemDoc)
      if (
        !destino ||
        idsAntes.has(`${tipo}:${origemDoc}`) ||
        (mesmaOrigem && destino === origemDoc)
      )
        continue
      if (Number(v.numero) === 1) {
        run('DELETE FROM versoes WHERE tipo=? AND documento_id=?', [tipo, destino])
        run('DELETE FROM documento_meta WHERE tipo=? AND documento_id=?', [tipo, destino])
      }
      const doc = JSON.parse(String(v.documento))
      doc.id = destino
      const tabela =
        tipo === 'orcamento' ? 'orcamentos' : tipo === 'relatorio' ? 'relatorios' : 'recibos'
      doc.numero = Number(get(`SELECT numero FROM ${tabela} WHERE id=?`, [destino])?.numero)
      if (doc.clienteId) doc.clienteId = clientes.get(doc.clienteId) ?? null
      if (doc.clienteSnapshot) doc.clienteSnapshot.id = doc.clienteId
      if (tipo === 'recibo') {
        const atual = JSON.parse(
          String(get('SELECT dados FROM recibos WHERE id=?', [destino])?.dados)
        )
        doc.origemId = atual.origemId
        doc.adiantamentoId = atual.adiantamentoId
      }
      const id = novoId()
      idsVersoes.set(String(v.id), id)
      run('INSERT INTO versoes VALUES (?,?,?,?,?,?,?,?,?)', [
        id,
        tipo,
        destino,
        v.numero,
        v.anterior_id ? (idsVersoes.get(String(v.anterior_id)) ?? null) : null,
        v.criado_em,
        v.computador,
        v.descricao,
        JSON.stringify(doc)
      ])
      run(
        'INSERT INTO documento_meta VALUES (?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET dados=excluded.dados',
        [
          tipo,
          destino,
          JSON.stringify({
            versao: v.numero,
            clienteSnapshot: doc.clienteSnapshot,
            empresaSnapshot: doc.empresaSnapshot,
            camposCliente: doc.camposCliente,
            computadorResponsavel: doc.computadorResponsavel
          })
        ]
      )
    }
  }
  if (temTabela(fonte, 'numeros_emitidos')) {
    for (const x of linhas(fonte, 'SELECT * FROM numeros_emitidos')) {
      const destino = destinoDocumento(String(x.tipo), String(x.documento_id))
      if (!destino) continue
      const tipo = String(x.tipo),
        tabela =
          tipo === 'orcamento' ? 'orcamentos' : tipo === 'relatorio' ? 'relatorios' : 'recibos'
      const numero = get(`SELECT numero FROM ${tabela} WHERE id=?`, [destino])?.numero
      if (Number(numero) > 0)
        run('INSERT OR IGNORE INTO numeros_emitidos VALUES (?,?,?,?)', [
          tipo,
          destino,
          numero ?? null,
          x.criado_em
        ])
    }
  }
  if (mesmaOrigem && temTabela(fonte, 'autoria_documentos')) {
    for (const x of linhas(fonte, 'SELECT * FROM autoria_documentos')) {
      const destino = destinoDocumento(String(x.tipo), String(x.documento_id))
      if (destino !== x.documento_id) continue
      if (
        get('SELECT 1 FROM autoria_documentos WHERE tipo=? AND documento_id=?', [x.tipo, destino])
      )
        continue
      run('INSERT INTO autoria_documentos VALUES (?,?,?,?)', [
        x.tipo,
        destino,
        x.usuario_criador,
        x.alterado_por
      ])
    }
  }
  if (temTabela(fonte, 'rascunhos_compartilhados')) {
    for (const x of linhas(fonte, 'SELECT * FROM rascunhos_compartilhados')) {
      const chave = `${origem.id}:${x.id}`
      if (
        get("SELECT 1 FROM importacoes_documentos WHERE tipo='rascunho' AND origem_id=?", [chave])
      )
        continue
      const tipo = String(x.tipo),
        origemDoc = String(x.documento_id),
        destino = destinoDocumento(tipo, origemDoc)
      if (!destino) continue
      if (mesmaOrigem && get('SELECT 1 FROM rascunhos_compartilhados WHERE id=?', [x.id])) continue
      const adaptar = (json: unknown): string => {
        const d = JSON.parse(String(json))
        if (destino === origemDoc) return JSON.stringify(d)
        d.id = destino
        delete d.idInterno
        delete d.usuarioCriador
        delete d.alteradoPor
        d.clienteId = clientes.get(d.clienteId) ?? null
        if (d.clienteSnapshot) d.clienteSnapshot.id = d.clienteId
        const referencias =
          tipo === 'relatorio'
            ? referenciasRelatorio.get(origemDoc)
            : referenciasOrcamento.get(origemDoc)
        for (const item of d.itensServico ?? []) {
          item.id = referencias?.get(item.id) ?? item.id
          item.servicoId = servicos.get(item.servicoId) ?? null
        }
        for (const item of [...(d.adiantamentos ?? []), ...(d.reembolsos ?? [])])
          item.id = referencias?.get(item.id) ?? item.id
        for (const foto of d.anexos ?? []) {
          if (foto.itemServicoId) foto.itemServicoId = referencias?.get(foto.itemServicoId) ?? null
          if (foto.lancamentoId) foto.lancamentoId = referencias?.get(foto.lancamentoId) ?? null
        }
        for (const item of d.observacoes ?? [])
          item.origemPadraoId = observacoes.get(item.origemPadraoId) ?? null
        for (const item of d.pagamentos ?? [])
          item.origemPadraoId = pagamentos.get(item.origemPadraoId) ?? null
        if (d.origemTipo && d.origemId) d.origemId = destinoDocumento(d.origemTipo, d.origemId)
        return JSON.stringify(d)
      }
      const id = mesmaOrigem ? String(x.id) : novoId()
      run('INSERT INTO rascunhos_compartilhados VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
        id,
        tipo,
        destino,
        x.usuario,
        x.computador,
        destino === origemDoc ? x.base_revisao : 0,
        adaptar(x.base),
        adaptar(x.documento),
        x.criado_em,
        x.atualizado_em,
        x.estado === 'aguardando_confirmacao' ? 'local' : x.estado
      ])
      run("INSERT INTO importacoes_documentos VALUES ('rascunho',?,?)", [chave, id])
      r.importados.rascunhos = (r.importados.rascunhos ?? 0) + 1
    }
  }
  if (temTabela(fonte, 'rascunhos_cadastros')) {
    for (const x of linhas(fonte, 'SELECT * FROM rascunhos_cadastros')) {
      const tipo = String(x.tipo)
      const idOrigem = String(x.id_origem)
      if (!['cliente', 'servico'].includes(tipo)) continue
      const id = mesmaOrigem ? idOrigem : `${origem.id}:${idOrigem}`
      if (get('SELECT 1 FROM rascunhos_cadastros WHERE tipo=? AND id_origem=?', [tipo, id]))
        continue
      run('INSERT OR IGNORE INTO rascunhos_cadastros VALUES (?,?,?,?)', [
        tipo,
        id,
        x.dados_json,
        x.criado_em
      ])
      r.importados.rascunhosCadastros = (r.importados.rascunhosCadastros ?? 0) + 1
    }
  }
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
