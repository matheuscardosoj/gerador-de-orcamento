import { app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { randomUUID } from 'crypto'
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
    if (versao < 1 || versao > 5)
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

function backupAntesImportar(): string {
  const destino = join(pastaBackups(), `banco-antes-importacao-${agoraNome()}.gdo-backup`)
  comBancoFechado(() => copiarEValidar(caminhoBanco(), destino))
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
  idOrigemAtual()
  comBancoFechado(() => copiarEValidar(caminhoBanco(), destino))
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
        x.imagem,
        x.miniatura
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
        x.imagem,
        x.miniatura
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
  const origem = idOrigemFonte(fonte)
  const clientes = new Map<string, string>()
  const servicos = new Map<string, string>()
  const observacoes = new Map<string, string>()
  const pagamentos = new Map<string, string>()
  const clientesExistentes = new Map(
    clientesRepo.list().map((cliente) => [normal(cliente.nome), cliente] as const)
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
  const chaveDocumento = (id: unknown): string => `${origem.id}:${String(id)}`
  const jaImportado = (tipo: 'orcamento' | 'relatorio', id: unknown): boolean =>
    Boolean(
      get('SELECT 1 FROM importacoes_documentos WHERE tipo = ? AND origem_id = ?', [
        tipo,
        chaveDocumento(id)
      ]) ||
      (origem.legado &&
        get('SELECT 1 FROM importacoes_documentos WHERE tipo = ? AND origem_id = ?', [tipo, id]))
    )

  for (const registro of linhas(fonte, 'SELECT * FROM clientes')) {
    const x = linha(registro)
    const origemId = String(x.id)
    const equivalente = clientesExistentes.get(normal(x.nome))
    if (equivalente) {
      clientes.set(origemId, equivalente.id)
      contar(r, 'clientes', 'ignorados')
      continue
    }
    const novo = clientesRepo.create({
      id: idLivre('clientes', origemId),
      criadoEm: String(x.criado_em),
      nome: String(x.nome),
      tratamento: String(x.tratamento ?? ''),
      contato: x.contato ? String(x.contato) : '',
      observacao: x.observacao ? String(x.observacao) : '',
      ativo: x.ativo == null || Number(x.ativo) === 1
    })
    clientes.set(origemId, novo.id)
    clientesExistentes.set(normal(novo.nome), novo)
    contar(r, 'clientes', 'importados')
  }

  for (const registro of linhas(fonte, 'SELECT * FROM servicos')) {
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
    for (const registro of linhas(fonte, `SELECT * FROM ${tabela}`)) {
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
  if (get('PRAGMA foreign_key_check'))
    throw new Error('A mesclagem produziria referências internas inválidas e foi cancelada.')
  return r
}

export function importarDadosDe(origem: string, modo: Modo): ResultadoImportacaoDados {
  validar(origem)
  const backupAntes = backupAntesImportar()
  if (modo === 'mesclar') {
    const fonte = new Database(origem)
    try {
      const r = tx(() => mesclar(fonte))
      return { modo, backupAntes, ...r, reiniciarNecessario: false }
    } finally {
      fonte.close()
    }
  }
  const temporario = `${caminhoBanco()}.importando-${Date.now()}`
  try {
    copyFileSync(origem, temporario)
    validar(temporario)
    fecharBanco()
    copyFileSync(temporario, caminhoBanco())
    abrirBanco()
    validar(caminhoBanco())
    return { modo, backupAntes, ...resumo(), reiniciarNecessario: true }
  } catch (e) {
    fecharBanco()
    copyFileSync(backupAntes, caminhoBanco())
    abrirBanco()
    throw e
  } finally {
    if (existsSync(temporario)) rmSync(temporario, { force: true })
  }
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
