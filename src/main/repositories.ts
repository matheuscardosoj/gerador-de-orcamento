// Repositórios sobre SQLite. As assinaturas públicas são as mesmas de quando a
// persistência era JSON — o IPC, o preload e o renderer não conhecem o banco.
import { randomUUID } from 'crypto'
import {
  all,
  get,
  run,
  tx,
  bool,
  paraBool,
  texto,
  numero,
  numeroOuNulo,
  textoOuNulo
} from './db/sqlite'
import type { Linha } from './db/sqlite'
import { bancoInicial, configIAPadrao } from './db/seeds'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento,
  ItemServico,
  ItemMaterial,
  ItemTexto,
  AnexoOrcamento,
  ConfigIA,
  CalculoServico,
  FormatoOrcamento,
  StatusOrcamento,
  Relatorio,
  LancamentoRelatorio,
  AnexoRelatorio,
  StatusRelatorio,
  TipoLancamentoRelatorio,
  TipoReferenciaAnexoRelatorio,
  AplicacaoTextoPadrao
} from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { normalizarDestinatario } from '@shared/documento/comum'
import { dataCivilHoje } from '@shared/format'

const nowIso = (): string => new Date().toISOString()

// -------------------------------------------------------------- Configurações
// Singletons guardados como JSON numa linha de `configuracoes`.

function lerConfig<T>(chave: string, padrao: T): T {
  const linha = get('SELECT valor FROM configuracoes WHERE chave = ?', [chave])
  if (!linha) return padrao
  try {
    return { ...padrao, ...(JSON.parse(String(linha.valor)) as object) } as T
  } catch {
    return padrao
  }
}

function gravarConfig(chave: string, valor: unknown): void {
  run(
    `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [chave, JSON.stringify(valor)]
  )
}

/** Cria as linhas iniciais quando o banco nasce vazio. */
export function semear(): void {
  const inicial = bancoInicial()
  tx(() => {
    gravarConfig('empresa', inicial.empresa)
    gravarConfig('parametros', inicial.parametros)
    gravarConfig('configIA', inicial.configIA)
    gravarConfig('seqOrcamento', 0)
    inicial.servicos.forEach((s) => servicosRepo.create(s))
    inicial.observacoesPadrao.forEach((o) => observacoesRepo.create(o))
    inicial.pagamentosPadrao.forEach((p) => pagamentosRepo.create(p))
  })
}

export function bancoVazio(): boolean {
  return !get('SELECT valor FROM configuracoes WHERE chave = ?', ['empresa'])
}

// ---------------------------------------------------------------- Empresa
export const empresaRepo = {
  get: (): EmpresaConfig => lerConfig('empresa', bancoInicial().empresa),
  save: (patch: Partial<EmpresaConfig>): EmpresaConfig => {
    const atual = { ...empresaRepo.get(), ...patch }
    gravarConfig('empresa', atual)
    return atual
  }
}

// ------------------------------------------------------------- Parâmetros
export const parametrosRepo = {
  get: (): ParametrosFinanceiros => lerConfig('parametros', bancoInicial().parametros),
  save: (patch: Partial<ParametrosFinanceiros>): ParametrosFinanceiros => {
    const atual = { ...parametrosRepo.get(), ...patch }
    gravarConfig('parametros', atual)
    return atual
  }
}

// --------------------------------------------------------------- Config IA
export const configIARepo = {
  get: (): ConfigIA => lerConfig('configIA', configIAPadrao),
  save: (patch: Partial<ConfigIA>): ConfigIA => {
    const atual = { ...configIARepo.get(), ...patch }
    gravarConfig('configIA', atual)
    return atual
  }
}

// ---------------------------------------------------------------- Clientes
const paraCliente = (l: Linha): Cliente => ({
  id: texto(l.id),
  nome: texto(l.nome),
  tratamento: texto(l.tratamento),
  contato: textoOuNulo(l.contato) ?? undefined,
  observacao: textoOuNulo(l.observacao) ?? undefined,
  ativo: paraBool(l.ativo),
  criadoEm: texto(l.criado_em)
})

export const clientesRepo = {
  list: (): Cliente[] =>
    all('SELECT * FROM clientes ORDER BY nome COLLATE NOCASE').map(paraCliente),
  get: (id: string): Cliente | null => {
    const l = get('SELECT * FROM clientes WHERE id = ?', [id])
    return l ? paraCliente(l) : null
  },
  create: (dto: Omit<Cliente, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string }): Cliente => {
    const cliente: Cliente = {
      id: dto.id ?? randomUUID(),
      criadoEm: dto.criadoEm ?? nowIso(),
      nome: dto.nome,
      tratamento: dto.tratamento,
      contato: dto.contato,
      observacao: dto.observacao,
      ativo: dto.ativo ?? true
    }
    run(
      `INSERT INTO clientes (id, nome, tratamento, contato, observacao, ativo, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente.id,
        cliente.nome,
        cliente.tratamento,
        cliente.contato ?? null,
        cliente.observacao ?? null,
        bool(cliente.ativo),
        cliente.criadoEm
      ]
    )
    return cliente
  },
  update: (id: string, patch: Partial<Cliente>): Cliente | null => {
    const atual = clientesRepo.get(id)
    if (!atual) return null
    const novo = { ...atual, ...patch, id }
    run(
      `UPDATE clientes SET nome = ?, tratamento = ?, contato = ?, observacao = ?, ativo = ? WHERE id = ?`,
      [
        novo.nome,
        novo.tratamento,
        novo.contato ?? null,
        novo.observacao ?? null,
        bool(novo.ativo),
        id
      ]
    )
    return novo
  },
  remove: (id: string): void => {
    const uso = get(
      `SELECT 1 AS usado FROM orcamentos WHERE cliente_id = ?
       UNION ALL SELECT 1 AS usado FROM relatorios WHERE cliente_id = ? LIMIT 1`,
      [id, id]
    )
    if (uso) {
      throw new Error(
        'Este cliente já foi usado em documentos e não pode ser excluído. Marque-o como inativo.'
      )
    }
    run('DELETE FROM clientes WHERE id = ?', [id])
  }
}

// -------------------------------------------------------- Catálogo serviços
const paraServico = (l: Linha): ServicoCatalogo => ({
  id: texto(l.id),
  nome: texto(l.nome),
  descricaoPadrao: texto(l.descricao_padrao),
  unidade: texto(l.unidade),
  precoReferencia: numeroOuNulo(l.preco_referencia)
})

export const servicosRepo = {
  list: (): ServicoCatalogo[] =>
    all('SELECT * FROM servicos ORDER BY nome COLLATE NOCASE').map(paraServico),
  get: (id: string): ServicoCatalogo | null => {
    const l = get('SELECT * FROM servicos WHERE id = ?', [id])
    return l ? paraServico(l) : null
  },
  create: (dto: Omit<ServicoCatalogo, 'id'> & { id?: string }): ServicoCatalogo => {
    const s: ServicoCatalogo = { ...dto, id: dto.id ?? randomUUID() }
    run(
      `INSERT INTO servicos (id, nome, descricao_padrao, unidade, preco_referencia)
       VALUES (?, ?, ?, ?, ?)`,
      [s.id, s.nome, s.descricaoPadrao, s.unidade, s.precoReferencia]
    )
    return s
  },
  update: (id: string, patch: Partial<ServicoCatalogo>): ServicoCatalogo | null => {
    const atual = servicosRepo.get(id)
    if (!atual) return null
    const novo = { ...atual, ...patch, id }
    run(
      `UPDATE servicos SET nome = ?, descricao_padrao = ?, unidade = ?, preco_referencia = ? WHERE id = ?`,
      [novo.nome, novo.descricaoPadrao, novo.unidade, novo.precoReferencia, id]
    )
    return novo
  },
  remove: (id: string): void => {
    run('DELETE FROM servicos WHERE id = ?', [id])
  }
}

// -------------------------------------- Observações / pagamentos padrão (CRUD igual)
function repoTextoPadrao<T extends ObservacaoPadrao | FormaPagamentoPadrao>(
  tabela: 'observacoes_padrao' | 'pagamentos_padrao'
): {
  list(): T[]
  get(id: string): T | null
  create(dto: Omit<T, 'id'> & { id?: string }): T
  update(id: string, patch: Partial<T>): T | null
  remove(id: string): void
} {
  const mapear = (l: Linha): T =>
    ({
      id: texto(l.id),
      texto: texto(l.texto),
      padrao: paraBool(l.padrao),
      aplicacao: (texto(l.aplicacao) || 'orcamento') as AplicacaoTextoPadrao
    }) as T

  return {
    list: () => all(`SELECT * FROM ${tabela} ORDER BY ordem, rowid`).map(mapear),
    get: (id) => {
      const l = get(`SELECT * FROM ${tabela} WHERE id = ?`, [id])
      return l ? mapear(l) : null
    },
    create: (dto) => {
      const item = { ...dto, id: dto.id ?? randomUUID() } as T
      const proxima = get(`SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM ${tabela}`)
      run(`INSERT INTO ${tabela} (id, texto, padrao, aplicacao, ordem) VALUES (?, ?, ?, ?, ?)`, [
        item.id,
        item.texto,
        bool(item.padrao),
        item.aplicacao ?? 'orcamento',
        numero(proxima?.proxima)
      ])
      return item
    },
    update: (id, patch) => {
      const atual = get(`SELECT * FROM ${tabela} WHERE id = ?`, [id])
      if (!atual) return null
      const novo = { ...mapear(atual), ...patch, id } as T
      run(`UPDATE ${tabela} SET texto = ?, padrao = ?, aplicacao = ? WHERE id = ?`, [
        novo.texto,
        bool(novo.padrao),
        novo.aplicacao,
        id
      ])
      return novo
    },
    remove: (id) => {
      run(`DELETE FROM ${tabela} WHERE id = ?`, [id])
    }
  }
}

export const observacoesRepo = repoTextoPadrao<ObservacaoPadrao>('observacoes_padrao')
export const pagamentosRepo = repoTextoPadrao<FormaPagamentoPadrao>('pagamentos_padrao')

// -------------------------------------------------------------- Orçamentos

function paraItemServico(l: Linha): ItemServico {
  let calculo: CalculoServico | null = null
  if (l.calculo_json) {
    try {
      calculo = JSON.parse(String(l.calculo_json)) as CalculoServico
    } catch {
      calculo = null
    }
  }
  return {
    id: texto(l.id),
    servicoId: textoOuNulo(l.servico_id),
    descricao: texto(l.descricao),
    unidade: texto(l.unidade),
    quantidade: numero(l.quantidade),
    valorUnitario: numero(l.valor_unitario),
    valorTotal: numero(l.valor_total),
    calculo
  }
}

const paraMaterial = (l: Linha): ItemMaterial => ({
  id: texto(l.id),
  quantidade: numero(l.quantidade),
  unidade: texto(l.unidade),
  especificacao: texto(l.especificacao)
})

const paraTexto = (l: Linha): ItemTexto => ({
  id: texto(l.id),
  texto: texto(l.texto),
  origemPadraoId: textoOuNulo(l.origem_padrao_id)
})

/** Converte o BLOB do banco em data URL (usada pela miniatura e pelo modo ampliado). */
function blobParaDataUrl(blob: unknown, mime: string): string | undefined {
  if (!blob) return undefined
  const buf = Buffer.from(blob as Uint8Array)
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Extrai os bytes de uma data URL (`data:image/jpeg;base64,...`). */
function dataUrlParaBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null
  const virgula = dataUrl.indexOf(',')
  if (virgula < 0) return null
  return Buffer.from(dataUrl.slice(virgula + 1), 'base64')
}

function paraAnexo(l: Linha): AnexoOrcamento {
  const mime = texto(l.mime) || 'image/jpeg'
  return {
    id: texto(l.id),
    itemServicoId: textoOuNulo(l.item_servico_id),
    titulo: texto(l.titulo),
    descricao: texto(l.descricao),
    mime,
    largura: numero(l.largura),
    altura: numero(l.altura),
    miniaturaDataUrl: blobParaDataUrl(l.miniatura, mime)
  }
}

/**
 * `filhos` traz as coleções do orçamento; `comMiniaturas` decide se o BLOB da
 * miniatura vem junto. A listagem do histórico não mostra fotos — carregá-las
 * levaria dezenas de KB em base64 por orçamento sem nenhum uso. Os metadados
 * dos anexos vêm sempre, para que um `update` feito a partir da listagem não
 * apague as fotos.
 */
function paraOrcamento(l: Linha, filhos: boolean, comMiniaturas = filhos): Orcamento {
  const id = texto(l.id)
  const clienteId = textoOuNulo(l.cliente_id)
  const cliente = clienteId ? clientesRepo.get(clienteId) : null
  return {
    id,
    numero: numero(l.numero),
    data: texto(l.data),
    clienteId,
    destinatario: cliente ? cliente.nome : normalizarDestinatario(texto(l.destinatario)),
    formato: texto(l.formato) as FormatoOrcamento,
    titulo: texto(l.titulo),
    introducao: textoOuNulo(l.introducao) ?? '',
    itensServico: filhos
      ? all('SELECT * FROM itens_servico WHERE orcamento_id = ? ORDER BY ordem', [id]).map(
          paraItemServico
        )
      : [],
    materiais: filhos
      ? all('SELECT * FROM materiais WHERE orcamento_id = ? ORDER BY ordem', [id]).map(paraMaterial)
      : [],
    observacoes: filhos
      ? all(
          `SELECT * FROM orcamento_textos WHERE orcamento_id = ? AND tipo = 'observacao' ORDER BY ordem`,
          [id]
        ).map(paraTexto)
      : [],
    pagamentos: filhos
      ? all(
          `SELECT * FROM orcamento_textos WHERE orcamento_id = ? AND tipo = 'pagamento' ORDER BY ordem`,
          [id]
        ).map(paraTexto)
      : [],
    anexos: filhos
      ? all(
          `SELECT id, item_servico_id, ordem, titulo, descricao, mime, largura, altura
                  ${comMiniaturas ? ', miniatura' : ''}
           FROM anexos WHERE orcamento_id = ? ORDER BY ordem`,
          [id]
        ).map(paraAnexo)
      : [],
    prazoDias: numeroOuNulo(l.prazo_dias),
    observacaoInterna: textoOuNulo(l.observacao_interna) ?? '',
    valorTotal: numero(l.valor_total),
    status: texto(l.status) as StatusOrcamento,
    criadoEm: texto(l.criado_em),
    atualizadoEm: texto(l.atualizado_em)
  }
}

/** Regrava todas as coleções filhas do orçamento na ordem em que chegaram. */
function gravarFilhos(orcamentoId: string, orc: Orcamento): void {
  run('DELETE FROM itens_servico WHERE orcamento_id = ?', [orcamentoId])
  run('DELETE FROM materiais WHERE orcamento_id = ?', [orcamentoId])
  run('DELETE FROM orcamento_textos WHERE orcamento_id = ?', [orcamentoId])

  orc.itensServico.forEach((i, ordem) => {
    run(
      `INSERT INTO itens_servico
         (id, orcamento_id, ordem, servico_id, descricao, unidade, quantidade, valor_unitario, valor_total, calculo_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        i.id || randomUUID(),
        orcamentoId,
        ordem,
        i.servicoId ?? null,
        i.descricao,
        i.unidade,
        i.quantidade,
        i.valorUnitario,
        i.valorTotal,
        i.calculo ? JSON.stringify(i.calculo) : null
      ]
    )
  })

  orc.materiais.forEach((m, ordem) => {
    run(
      `INSERT INTO materiais (id, orcamento_id, ordem, quantidade, unidade, especificacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [m.id || randomUUID(), orcamentoId, ordem, m.quantidade, m.unidade, m.especificacao]
    )
  })

  const gravarTextos = (itens: ItemTexto[], tipo: 'observacao' | 'pagamento'): void =>
    itens.forEach((t, ordem) => {
      run(
        `INSERT INTO orcamento_textos (id, orcamento_id, tipo, ordem, texto, origem_padrao_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [t.id || randomUUID(), orcamentoId, tipo, ordem, t.texto, t.origemPadraoId ?? null]
      )
    })
  gravarTextos(orc.observacoes ?? [], 'observacao')
  gravarTextos(orc.pagamentos ?? [], 'pagamento')

  gravarAnexos(orcamentoId, orc.anexos ?? [])
}

/**
 * Sincroniza os anexos. Anexos já existentes têm apenas os metadados
 * atualizados — os BLOBs de imagem só são gravados quando o renderer envia
 * `imagemDataUrl` (anexo recém-inserido), evitando trafegar megabytes a cada save.
 */
function gravarAnexos(orcamentoId: string, anexos: AnexoOrcamento[]): void {
  const existentes = new Set(
    all('SELECT id FROM anexos WHERE orcamento_id = ?', [orcamentoId]).map((l) => texto(l.id))
  )
  const mantidos = new Set<string>()

  anexos.forEach((a, ordem) => {
    const id = a.id || randomUUID()
    mantidos.add(id)
    const imagem = dataUrlParaBuffer(a.imagemDataUrl)
    const miniatura = dataUrlParaBuffer(a.miniaturaDataUrl)

    if (existentes.has(id)) {
      run(
        `UPDATE anexos SET item_servico_id = ?, ordem = ?, titulo = ?, descricao = ? WHERE id = ?`,
        [a.itemServicoId ?? null, ordem, a.titulo, a.descricao, id]
      )
      if (imagem) {
        run(
          `UPDATE anexos SET imagem = ?, miniatura = ?, mime = ?, largura = ?, altura = ? WHERE id = ?`,
          [imagem, miniatura, a.mime, a.largura, a.altura, id]
        )
      }
    } else {
      run(
        `INSERT INTO anexos
           (id, orcamento_id, item_servico_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          orcamentoId,
          a.itemServicoId ?? null,
          ordem,
          a.titulo,
          a.descricao,
          a.mime,
          a.largura,
          a.altura,
          imagem,
          miniatura
        ]
      )
    }
  })

  existentes.forEach((id) => {
    if (!mantidos.has(id)) run('DELETE FROM anexos WHERE id = ?', [id])
  })
}

// ------------------------------------------------------------------ Numeração
// `seqOrcamento` guarda o ÚLTIMO número entregue. O próximo é o primeiro número
// livre a partir dele — assim o contador é auto-corretivo: mesmo apontando para
// um número já ocupado, criar um orçamento nunca esbarra no UNIQUE da coluna.

const NUMERO_MAXIMO = 999999

/** Usado pela importação do banco legado para não retroceder o contador. */
export function definirSeqOrcamento(valor: number): void {
  gravarConfig('seqOrcamento', Math.max(valor, seqAtual()))
}

function seqAtual(): number {
  const l = get('SELECT valor FROM configuracoes WHERE chave = ?', ['seqOrcamento'])
  return Number(l?.valor ?? 0)
}

/** Orçamento que ocupa o número, ignorando opcionalmente um id (o próprio). */
function donoDoNumero(numero: number, ignorarId?: string): Linha | null {
  return ignorarId
    ? get('SELECT id, destinatario FROM orcamentos WHERE numero = ? AND id <> ?', [
        numero,
        ignorarId
      ])
    : get('SELECT id, destinatario FROM orcamentos WHERE numero = ?', [numero])
}

/** Primeiro número livre a partir de `de` (inclusive). */
function numeroLivreAPartirDe(de: number): number {
  let n = Math.max(1, de)
  while (n <= NUMERO_MAXIMO && donoDoNumero(n)) n++
  return n
}

function proximoNumeroLivre(): number {
  return numeroLivreAPartirDe(seqAtual() + 1)
}

/** Valida forma e disponibilidade. Devolve null quando o número pode ser usado. */
function validarNumero(numero: number, ignorarId?: string): ResultadoNumeracao | null {
  if (!Number.isInteger(numero) || numero < 1 || numero > NUMERO_MAXIMO) {
    return { ok: false, erro: `O número deve ser um inteiro entre 1 e ${NUMERO_MAXIMO}.` }
  }
  const dono = donoDoNumero(numero, ignorarId)
  if (dono) {
    const destinatario = texto(dono.destinatario).replace(/,$/, '').trim()
    return {
      ok: false,
      erro:
        `O número ${numero} já é do orçamento` +
        (destinatario ? ` de ${destinatario}` : '') +
        `. O próximo número livre é ${numeroLivreAPartirDe(numero + 1)}.`,
      proximoLivre: numeroLivreAPartirDe(numero + 1)
    }
  }
  return null
}

export const orcamentosRepo = {
  list: (): Orcamento[] =>
    all('SELECT * FROM orcamentos ORDER BY criado_em DESC').map((l) =>
      paraOrcamento(l, true, false)
    ),

  get: (id: string): Orcamento | null => {
    const l = get('SELECT * FROM orcamentos WHERE id = ?', [id])
    return l ? paraOrcamento(l, true) : null
  },

  /** Prévia do próximo número (não consome o contador). */
  proximoNumero: (): number => proximoNumeroLivre(),

  numeracao: (): InfoNumeracao => {
    const agregado = get(
      'SELECT COALESCE(MAX(numero), 0) AS maior, COUNT(*) AS total FROM orcamentos'
    )
    return {
      proximoNumero: proximoNumeroLivre(),
      maiorEmUso: numero(agregado?.maior),
      menorLivre: numeroLivreAPartirDe(1),
      totalDocumentos: numero(agregado?.total)
    }
  },

  definirProximoNumero: (n: number): ResultadoNumeracao => {
    const invalido = validarNumero(n)
    if (invalido) return invalido
    gravarConfig('seqOrcamento', n - 1)
    return { ok: true }
  },

  alterarNumero: (id: string, n: number): ResultadoNumeracao & { orcamento?: Orcamento } =>
    tx(() => {
      const atual = orcamentosRepo.get(id)
      if (!atual) return { ok: false, erro: 'Orçamento não encontrado.' }
      if (atual.numero === n) return { ok: true, orcamento: atual }
      const invalido = validarNumero(n, id)
      if (invalido) return invalido
      run('UPDATE orcamentos SET numero = ?, atualizado_em = ? WHERE id = ?', [n, nowIso(), id])
      // O contador acompanha para o próximo orçamento não colidir.
      if (n > seqAtual()) gravarConfig('seqOrcamento', n)
      return { ok: true, orcamento: orcamentosRepo.get(id) as Orcamento }
    }),

  /**
   * `original` só é usado pela importação do banco legado, para preservar a
   * numeração e as datas de criação. No uso normal o número é o próximo livre,
   * ou o que o usuário digitou no editor (já validado por `alterarNumero`
   * quando o orçamento existe, e aqui quando ele está sendo criado).
   */
  create: (
    dto: Omit<Orcamento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'> & { numero?: number },
    original?: { numero?: number; criadoEm?: string; atualizadoEm?: string }
  ): Orcamento =>
    tx(() => {
      const pedido = original?.numero ?? dto.numero
      // Um número pedido que esteja ocupado cai no próximo livre em vez de
      // estourar o UNIQUE — a validação amigável acontece antes, na interface.
      const numero = pedido && !donoDoNumero(pedido) ? pedido : proximoNumeroLivre()
      gravarConfig('seqOrcamento', Math.max(numero, seqAtual()))
      const orc: Orcamento = {
        ...dto,
        id: randomUUID(),
        numero,
        criadoEm: original?.criadoEm ?? nowIso(),
        atualizadoEm: original?.atualizadoEm ?? nowIso()
      }
      run(
        `INSERT INTO orcamentos
           (id, numero, data, cliente_id, destinatario, formato, titulo, introducao,
            prazo_dias, observacao_interna, valor_total, status, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orc.id,
          orc.numero,
          orc.data,
          orc.clienteId ?? null,
          normalizarDestinatario(orc.destinatario),
          orc.formato,
          orc.titulo,
          orc.introducao ?? null,
          orc.prazoDias ?? null,
          orc.observacaoInterna ?? null,
          orc.valorTotal,
          orc.status,
          orc.criadoEm,
          orc.atualizadoEm
        ]
      )
      gravarFilhos(orc.id, orc)
      return orcamentosRepo.get(orc.id) as Orcamento
    }),

  update: (id: string, patch: Partial<Orcamento>): Orcamento | null =>
    tx(() => {
      const atual = orcamentosRepo.get(id)
      if (!atual) return null
      const novo: Orcamento = { ...atual, ...patch, id, atualizadoEm: nowIso() }
      run(
        `UPDATE orcamentos SET data = ?, cliente_id = ?, destinatario = ?, formato = ?, titulo = ?,
           introducao = ?, prazo_dias = ?, observacao_interna = ?, valor_total = ?, status = ?, atualizado_em = ?
         WHERE id = ?`,
        [
          novo.data,
          novo.clienteId ?? null,
          normalizarDestinatario(novo.destinatario),
          novo.formato,
          novo.titulo,
          novo.introducao ?? null,
          novo.prazoDias ?? null,
          novo.observacaoInterna ?? null,
          novo.valorTotal,
          novo.status,
          novo.atualizadoEm,
          id
        ]
      )
      gravarFilhos(id, novo)
      return orcamentosRepo.get(id)
    }),

  remove: (id: string): void =>
    tx(() => {
      const alvo = get('SELECT numero FROM orcamentos WHERE id = ?', [id])
      if (!alvo) return
      const excluido = numero(alvo.numero)
      run('DELETE FROM orcamentos WHERE id = ?', [id])
      // Excluiu justamente o último número entregue? O contador recua uma
      // posição para que exatamente esse número volte, sem preencher lacunas
      // internas mais antigas.
      if (excluido === seqAtual()) {
        gravarConfig('seqOrcamento', Math.max(0, excluido - 1))
      }
    }),

  duplicate: (id: string): Orcamento | null =>
    tx(() => {
      const original = orcamentosRepo.get(id)
      if (!original) return null
      const numero = proximoNumeroLivre()
      gravarConfig('seqOrcamento', Math.max(numero, seqAtual()))
      const novoId = randomUUID()
      run(
        `INSERT INTO orcamentos
           (id, numero, data, cliente_id, destinatario, formato, titulo, introducao,
            prazo_dias, observacao_interna, valor_total, status, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?)`,
        [
          novoId,
          numero,
          original.data,
          original.clienteId ?? null,
          original.destinatario,
          original.formato,
          original.titulo,
          original.introducao ?? null,
          original.prazoDias ?? null,
          original.observacaoInterna ?? null,
          original.valorTotal,
          nowIso(),
          nowIso()
        ]
      )
      // Filhos ganham ids novos; as imagens são copiadas em SQL (sem passar pelo JS).
      const mapaItens = new Map<string, string>()
      original.itensServico.forEach((i) => mapaItens.set(i.id, randomUUID()))
      gravarFilhos(novoId, {
        ...original,
        id: novoId,
        itensServico: original.itensServico.map((i) => ({
          ...i,
          id: mapaItens.get(i.id) as string
        })),
        materiais: original.materiais.map((m) => ({ ...m, id: randomUUID() })),
        observacoes: original.observacoes.map((o) => ({ ...o, id: randomUUID() })),
        pagamentos: original.pagamentos.map((p) => ({ ...p, id: randomUUID() })),
        anexos: []
      })
      original.anexos.forEach((a, ordem) => {
        run(
          `INSERT INTO anexos (id, orcamento_id, item_servico_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
           SELECT ?, ?, ?, ?, titulo, descricao, mime, largura, altura, imagem, miniatura FROM anexos WHERE id = ?`,
          [
            randomUUID(),
            novoId,
            a.itemServicoId ? (mapaItens.get(a.itemServicoId) ?? null) : null,
            ordem,
            a.id
          ]
        )
      })
      return orcamentosRepo.get(novoId)
    })
}

// --------------------------------------------------------------- Relatórios

const paraLancamentoRelatorio = (l: Linha): LancamentoRelatorio => ({
  id: texto(l.id),
  descricao: texto(l.descricao),
  valor: numero(l.valor)
})

function paraAnexoRelatorio(l: Linha): AnexoRelatorio {
  return {
    id: texto(l.id),
    referenciaTipo: (texto(l.referencia_tipo) || 'solto') as TipoReferenciaAnexoRelatorio,
    referenciaId: textoOuNulo(l.referencia_id),
    titulo: texto(l.titulo),
    descricao: texto(l.descricao),
    mime: texto(l.mime) || 'image/jpeg',
    largura: numero(l.largura),
    altura: numero(l.altura),
    miniaturaDataUrl: blobParaDataUrl(l.miniatura, texto(l.mime) || 'image/jpeg')
  }
}

function paraRelatorio(l: Linha, filhos: boolean, comMiniaturas = filhos): Relatorio {
  const id = texto(l.id)
  const clienteId = textoOuNulo(l.cliente_id)
  const cliente = clienteId ? clientesRepo.get(clienteId) : null
  const itensServico = filhos
    ? all('SELECT * FROM relatorio_itens_servico WHERE relatorio_id = ? ORDER BY ordem', [id]).map(
        paraItemServico
      )
    : []
  const adiantamentos = filhos
    ? all(
        `SELECT * FROM relatorio_lancamentos WHERE relatorio_id = ? AND tipo = 'adiantamento' ORDER BY ordem`,
        [id]
      ).map(paraLancamentoRelatorio)
    : []
  const reembolsos = filhos
    ? all(
        `SELECT * FROM relatorio_lancamentos WHERE relatorio_id = ? AND tipo = 'reembolso' ORDER BY ordem`,
        [id]
      ).map(paraLancamentoRelatorio)
    : []
  const origemId = textoOuNulo(l.origem_orcamento_id)
  const saldo = numero(l.saldo)
  return {
    id,
    numero: numero(l.numero),
    data: texto(l.data),
    clienteId,
    destinatario: cliente ? cliente.nome : normalizarDestinatario(texto(l.destinatario)),
    formato: texto(l.formato) as FormatoOrcamento,
    titulo: texto(l.titulo) || 'Relatório de Serviço',
    introducao: textoOuNulo(l.introducao) ?? '',
    itensServico,
    adiantamentos,
    reembolsos,
    observacoes: filhos
      ? all(
          `SELECT * FROM relatorio_textos WHERE relatorio_id = ? AND tipo = 'observacao' ORDER BY ordem`,
          [id]
        ).map(paraTexto)
      : [],
    pagamentos: filhos
      ? all(
          `SELECT * FROM relatorio_textos WHERE relatorio_id = ? AND tipo = 'pagamento' ORDER BY ordem`,
          [id]
        ).map(paraTexto)
      : [],
    anexos: filhos
      ? all(
          `SELECT id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura
                  ${comMiniaturas ? ', miniatura' : ''}
           FROM relatorio_anexos WHERE relatorio_id = ? ORDER BY ordem`,
          [id]
        ).map(paraAnexoRelatorio)
      : [],
    observacaoInterna: textoOuNulo(l.observacao_interna) ?? '',
    status: texto(l.status) as StatusRelatorio,
    origemOrcamento: origemId
      ? {
          id: origemId,
          numero: numero(l.origem_orcamento_numero),
          cliente: texto(l.origem_orcamento_cliente)
        }
      : null,
    totais: {
      servicos: numero(l.total_servicos),
      adiantamentos: numero(l.total_adiantamentos),
      reembolsos: numero(l.total_reembolsos),
      saldo,
      valorFinal: Math.abs(saldo),
      tipoSaldo: saldo < 0 ? 'devolver' : 'receber'
    },
    criadoEm: texto(l.criado_em),
    atualizadoEm: texto(l.atualizado_em)
  }
}

function gravarAnexosRelatorio(relatorioId: string, anexos: AnexoRelatorio[]): void {
  const existentes = new Set(
    all('SELECT id FROM relatorio_anexos WHERE relatorio_id = ?', [relatorioId]).map((l) =>
      texto(l.id)
    )
  )
  const mantidos = new Set<string>()
  anexos.forEach((a, ordem) => {
    const id = a.id || randomUUID()
    mantidos.add(id)
    const imagem = dataUrlParaBuffer(a.imagemDataUrl)
    const miniatura = dataUrlParaBuffer(a.miniaturaDataUrl)
    if (existentes.has(id)) {
      run(
        `UPDATE relatorio_anexos SET referencia_tipo = ?, referencia_id = ?, ordem = ?, titulo = ?, descricao = ? WHERE id = ?`,
        [a.referenciaTipo, a.referenciaId ?? null, ordem, a.titulo, a.descricao, id]
      )
      if (imagem) {
        run(
          `UPDATE relatorio_anexos SET imagem = ?, miniatura = ?, mime = ?, largura = ?, altura = ? WHERE id = ?`,
          [imagem, miniatura, a.mime, a.largura, a.altura, id]
        )
      }
    } else {
      run(
        `INSERT INTO relatorio_anexos
           (id, relatorio_id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          relatorioId,
          a.referenciaTipo,
          a.referenciaId ?? null,
          ordem,
          a.titulo,
          a.descricao,
          a.mime,
          a.largura,
          a.altura,
          imagem,
          miniatura
        ]
      )
    }
  })
  existentes.forEach((id) => {
    if (!mantidos.has(id)) run('DELETE FROM relatorio_anexos WHERE id = ?', [id])
  })
}

function gravarFilhosRelatorio(relatorioId: string, rel: Relatorio): void {
  run('DELETE FROM relatorio_itens_servico WHERE relatorio_id = ?', [relatorioId])
  run('DELETE FROM relatorio_lancamentos WHERE relatorio_id = ?', [relatorioId])
  run('DELETE FROM relatorio_textos WHERE relatorio_id = ?', [relatorioId])

  rel.itensServico.forEach((i, ordem) => {
    run(
      `INSERT INTO relatorio_itens_servico
         (id, relatorio_id, ordem, servico_id, descricao, unidade, quantidade, valor_unitario, valor_total, calculo_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        i.id || randomUUID(),
        relatorioId,
        ordem,
        i.servicoId ?? null,
        i.descricao,
        i.unidade,
        i.quantidade,
        i.valorUnitario,
        i.valorTotal,
        i.calculo ? JSON.stringify(i.calculo) : null
      ]
    )
  })

  const gravarLancamentos = (itens: LancamentoRelatorio[], tipo: TipoLancamentoRelatorio): void =>
    itens.forEach((i, ordem) => {
      run(
        `INSERT INTO relatorio_lancamentos (id, relatorio_id, tipo, ordem, descricao, valor) VALUES (?, ?, ?, ?, ?, ?)`,
        [i.id || randomUUID(), relatorioId, tipo, ordem, i.descricao, i.valor]
      )
    })
  gravarLancamentos(rel.adiantamentos ?? [], 'adiantamento')
  gravarLancamentos(rel.reembolsos ?? [], 'reembolso')

  const gravarTextos = (itens: ItemTexto[], tipo: 'observacao' | 'pagamento'): void =>
    itens.forEach((i, ordem) => {
      run(
        `INSERT INTO relatorio_textos (id, relatorio_id, tipo, ordem, texto, origem_padrao_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [i.id || randomUUID(), relatorioId, tipo, ordem, i.texto, i.origemPadraoId ?? null]
      )
    })
  gravarTextos(rel.observacoes ?? [], 'observacao')
  gravarTextos(rel.pagamentos ?? [], 'pagamento')
  gravarAnexosRelatorio(relatorioId, rel.anexos ?? [])
}

function seqRelatorioAtual(): number {
  const l = get('SELECT valor FROM configuracoes WHERE chave = ?', ['seqRelatorio'])
  return Number(l?.valor ?? 0)
}

function donoDoNumeroRelatorio(n: number, ignorarId?: string): Linha | null {
  return ignorarId
    ? get('SELECT id, destinatario FROM relatorios WHERE numero = ? AND id <> ?', [n, ignorarId])
    : get('SELECT id, destinatario FROM relatorios WHERE numero = ?', [n])
}

function numeroRelatorioLivreAPartirDe(de: number): number {
  let n = Math.max(1, de)
  while (n <= NUMERO_MAXIMO && donoDoNumeroRelatorio(n)) n++
  return n
}

function proximoNumeroRelatorio(): number {
  return numeroRelatorioLivreAPartirDe(seqRelatorioAtual() + 1)
}

function validarNumeroRelatorio(n: number, ignorarId?: string): ResultadoNumeracao | null {
  if (!Number.isInteger(n) || n < 1 || n > NUMERO_MAXIMO) {
    return { ok: false, erro: `O número deve ser um inteiro entre 1 e ${NUMERO_MAXIMO}.` }
  }
  const dono = donoDoNumeroRelatorio(n, ignorarId)
  if (!dono) return null
  return {
    ok: false,
    erro: `O número ${n} já pertence a outro relatório. O próximo número livre é ${numeroRelatorioLivreAPartirDe(n + 1)}.`,
    proximoLivre: numeroRelatorioLivreAPartirDe(n + 1)
  }
}

export const relatoriosRepo = {
  list: (): Relatorio[] =>
    all('SELECT * FROM relatorios ORDER BY criado_em DESC').map((l) =>
      paraRelatorio(l, true, false)
    ),

  get: (id: string): Relatorio | null => {
    const l = get('SELECT * FROM relatorios WHERE id = ?', [id])
    return l ? paraRelatorio(l, true) : null
  },

  proximoNumero: (): number => proximoNumeroRelatorio(),

  numeracao: (): InfoNumeracao => {
    const agregado = get(
      'SELECT COALESCE(MAX(numero), 0) AS maior, COUNT(*) AS total FROM relatorios'
    )
    return {
      proximoNumero: proximoNumeroRelatorio(),
      maiorEmUso: numero(agregado?.maior),
      menorLivre: numeroRelatorioLivreAPartirDe(1),
      totalDocumentos: numero(agregado?.total)
    }
  },

  definirProximoNumero: (n: number): ResultadoNumeracao => {
    const invalido = validarNumeroRelatorio(n)
    if (invalido) return invalido
    gravarConfig('seqRelatorio', n - 1)
    return { ok: true }
  },

  alterarNumero: (id: string, n: number): ResultadoNumeracao & { relatorio?: Relatorio } =>
    tx(() => {
      const atual = relatoriosRepo.get(id)
      if (!atual) return { ok: false, erro: 'Relatório não encontrado.' }
      if (atual.numero === n) return { ok: true, relatorio: atual }
      const invalido = validarNumeroRelatorio(n, id)
      if (invalido) return invalido
      run('UPDATE relatorios SET numero = ?, atualizado_em = ? WHERE id = ?', [n, nowIso(), id])
      if (n > seqRelatorioAtual()) gravarConfig('seqRelatorio', n)
      return { ok: true, relatorio: relatoriosRepo.get(id) as Relatorio }
    }),

  create: (
    dto: Omit<Relatorio, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'> & { numero?: number },
    original?: { numero?: number; criadoEm?: string; atualizadoEm?: string }
  ): Relatorio =>
    tx(() => {
      const pedido = original?.numero ?? dto.numero
      const numeroRel = pedido && !donoDoNumeroRelatorio(pedido) ? pedido : proximoNumeroRelatorio()
      gravarConfig('seqRelatorio', Math.max(numeroRel, seqRelatorioAtual()))
      const totais = calcularTotaisRelatorio(dto.itensServico, dto.adiantamentos, dto.reembolsos)
      const agora = nowIso()
      const rel: Relatorio = {
        ...dto,
        destinatario: normalizarDestinatario(dto.destinatario),
        totais,
        id: randomUUID(),
        numero: numeroRel,
        criadoEm: original?.criadoEm ?? agora,
        atualizadoEm: original?.atualizadoEm ?? agora
      }
      run(
        `INSERT INTO relatorios
           (id, numero, data, cliente_id, destinatario, formato, titulo, introducao, observacao_interna, status,
            origem_orcamento_id, origem_orcamento_numero, origem_orcamento_cliente,
            total_servicos, total_adiantamentos, total_reembolsos, saldo, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rel.id,
          rel.numero,
          rel.data,
          rel.clienteId ?? null,
          rel.destinatario,
          rel.formato,
          rel.titulo,
          rel.introducao ?? null,
          rel.observacaoInterna ?? null,
          rel.status,
          rel.origemOrcamento?.id ?? null,
          rel.origemOrcamento?.numero ?? null,
          rel.origemOrcamento?.cliente ?? null,
          totais.servicos,
          totais.adiantamentos,
          totais.reembolsos,
          totais.saldo,
          rel.criadoEm,
          rel.atualizadoEm
        ]
      )
      gravarFilhosRelatorio(rel.id, rel)
      return relatoriosRepo.get(rel.id) as Relatorio
    }),

  update: (id: string, patch: Partial<Relatorio>): Relatorio | null =>
    tx(() => {
      const atual = relatoriosRepo.get(id)
      if (!atual) return null
      const novo = { ...atual, ...patch, id, atualizadoEm: nowIso() }
      novo.destinatario = normalizarDestinatario(novo.destinatario)
      novo.totais = calcularTotaisRelatorio(novo.itensServico, novo.adiantamentos, novo.reembolsos)
      run(
        `UPDATE relatorios SET data = ?, cliente_id = ?, destinatario = ?, formato = ?, titulo = ?, introducao = ?, observacao_interna = ?,
           status = ?, origem_orcamento_id = ?, origem_orcamento_numero = ?, origem_orcamento_cliente = ?,
           total_servicos = ?, total_adiantamentos = ?, total_reembolsos = ?, saldo = ?, atualizado_em = ? WHERE id = ?`,
        [
          novo.data,
          novo.clienteId ?? null,
          novo.destinatario,
          novo.formato,
          novo.titulo,
          novo.introducao ?? null,
          novo.observacaoInterna ?? null,
          novo.status,
          novo.origemOrcamento?.id ?? null,
          novo.origemOrcamento?.numero ?? null,
          novo.origemOrcamento?.cliente ?? null,
          novo.totais.servicos,
          novo.totais.adiantamentos,
          novo.totais.reembolsos,
          novo.totais.saldo,
          novo.atualizadoEm,
          id
        ]
      )
      gravarFilhosRelatorio(id, novo)
      return relatoriosRepo.get(id)
    }),

  remove: (id: string): void =>
    tx(() => {
      const alvo = get('SELECT numero FROM relatorios WHERE id = ?', [id])
      if (!alvo) return
      const excluido = numero(alvo.numero)
      run('DELETE FROM relatorios WHERE id = ?', [id])
      if (excluido === seqRelatorioAtual()) {
        gravarConfig('seqRelatorio', Math.max(0, excluido - 1))
      }
    }),

  criarDeOrcamento: (orcamentoId: string): Relatorio | null =>
    tx(() => {
      const orc = orcamentosRepo.get(orcamentoId)
      if (!orc) return null
      const mapaItens = new Map<string, string>()
      const itensServico = orc.itensServico.map((i) => {
        const id = randomUUID()
        mapaItens.set(i.id, id)
        return { ...i, id, calculo: i.calculo ? structuredClone(i.calculo) : null }
      })
      const idsObsAmbos = new Set(
        observacoesRepo
          .list()
          .filter((o) => o.aplicacao === 'ambos')
          .map((o) => o.id)
      )
      const idsPagAmbos = new Set(
        pagamentosRepo
          .list()
          .filter((p) => p.aplicacao === 'ambos')
          .map((p) => p.id)
      )
      const copiarTextos = (itens: ItemTexto[], permitidos: Set<string>): ItemTexto[] =>
        itens
          .filter((i) => Boolean(i.origemPadraoId && permitidos.has(i.origemPadraoId)))
          .map((i) => ({ ...i, id: randomUUID() }))
      const cliente = orc.clienteId ? clientesRepo.get(orc.clienteId)?.nome : null
      const rel = relatoriosRepo.create({
        data: dataCivilHoje(),
        clienteId: orc.clienteId ?? null,
        destinatario: normalizarDestinatario(orc.destinatario),
        formato: orc.formato,
        titulo: 'Relatório de Serviço',
        introducao: orc.introducao ?? '',
        itensServico,
        adiantamentos: [],
        reembolsos: [],
        observacoes: copiarTextos(orc.observacoes, idsObsAmbos),
        pagamentos: copiarTextos(orc.pagamentos, idsPagAmbos),
        anexos: [],
        observacaoInterna: '',
        status: 'rascunho',
        origemOrcamento: {
          id: orc.id,
          numero: orc.numero,
          cliente: cliente ?? normalizarDestinatario(orc.destinatario)
        },
        totais: calcularTotaisRelatorio(itensServico, [], [])
      })
      orc.anexos
        .filter((a) => a.itemServicoId && mapaItens.has(a.itemServicoId))
        .forEach((a, ordem) => {
          run(
            `INSERT INTO relatorio_anexos
             (id, relatorio_id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
           SELECT ?, ?, 'servico', ?, ?, titulo, descricao, mime, largura, altura, imagem, miniatura FROM anexos WHERE id = ?`,
            [randomUUID(), rel.id, mapaItens.get(a.itemServicoId as string), ordem, a.id]
          )
        })
      return relatoriosRepo.get(rel.id)
    })
}

// -------------------------------------------------------------- Anexos (BLOB)
export const anexosRepo = {
  /** Imagem em tamanho cheio, sob demanda (visualização ampliada na tela). */
  imagem: (id: string): string | null => {
    const l = get('SELECT imagem, mime FROM anexos WHERE id = ?', [id])
    if (!l) return null
    return blobParaDataUrl(l.imagem, texto(l.mime) || 'image/jpeg') ?? null
  },
  /** Bytes crus, usados pelo gerador de DOCX. */
  buffer: (id: string): Buffer | null => {
    const l = get('SELECT imagem FROM anexos WHERE id = ?', [id])
    if (!l?.imagem) return null
    return Buffer.from(l.imagem as Uint8Array)
  }
}

export const anexosRelatorioRepo = {
  imagem: (id: string): string | null => {
    const l = get('SELECT imagem, mime FROM relatorio_anexos WHERE id = ?', [id])
    if (!l) return null
    return blobParaDataUrl(l.imagem, texto(l.mime) || 'image/jpeg') ?? null
  },
  buffer: (id: string): Buffer | null => {
    const l = get('SELECT imagem FROM relatorio_anexos WHERE id = ?', [id])
    if (!l?.imagem) return null
    return Buffer.from(l.imagem as Uint8Array)
  }
}
