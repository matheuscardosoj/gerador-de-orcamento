import {
  tabelaNumerosUsados,
  numeroNuvem,
  numeracaoNuvem,
  validarTrocaNumero,
  consumirTrocaNumero
} from '../numeros'
import { envolverDocumento, nuvemConfigurada } from '../versoes'
// Repositórios sobre SQLite. As assinaturas públicas são as mesmas de quando a
// persistência era JSON — o IPC, o preload e o renderer não conhecem o banco.
import { randomUUID } from 'crypto'
import { registrarImagem } from '../imagens'
import { all, get, run, tx, texto, numero, numeroOuNulo, textoOuNulo } from '../db/sqlite'
import type { Linha } from '../db/sqlite'
import type {
  Orcamento,
  ItemMaterial,
  ItemTexto,
  AnexoOrcamento,
  FormatoOrcamento,
  StatusOrcamento,
  ResumoOrcamento
} from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'
import { normalizarDestinatario } from '@shared/documento/comum'
import { normalizarDataCivil } from '@shared/format'
import { exigirValidacao, normalizarOrcamento, validarOrcamentoFinal } from '@shared/validacao'
import {
  nowIso,
  comTotalDosItens,
  gravarConfig,
  blobParaDataUrl,
  paraItemServico,
  paraTexto,
  versoesResumo
} from './base'

const NUMERO_MAXIMO = 999999

// -------------------------------------------------------------- Orçamentos

const paraMaterial = (l: Linha): ItemMaterial => ({
  id: texto(l.id),
  quantidade: numero(l.quantidade),
  unidade: texto(l.unidade),
  especificacao: texto(l.especificacao)
})

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
    imagemHash: texto(l.imagem),
    miniaturaDataUrl: blobParaDataUrl(l.imagem, 'miniatura')
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
  return {
    id,
    numero: numero(l.numero),
    data: normalizarDataCivil(texto(l.data)),
    clienteId,
    destinatario: normalizarDestinatario(texto(l.destinatario)),
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
          `SELECT id, item_servico_id, ordem, titulo, descricao, mime, largura, altura, imagem
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

function listarResumosOrcamento(): ResumoOrcamento[] {
  const versoes = versoesResumo('orcamento')
  const servicosPorOrcamento = new Map<string, string[]>()
  for (const linha of all('SELECT orcamento_id, descricao FROM itens_servico ORDER BY ordem')) {
    const id = texto(linha.orcamento_id)
    const descricoes = servicosPorOrcamento.get(id) ?? []
    descricoes.push(texto(linha.descricao))
    servicosPorOrcamento.set(id, descricoes)
  }
  return all(
    `SELECT o.*, o.destinatario AS destinatario_resumo
       FROM orcamentos o
       LEFT JOIN clientes c ON c.id = o.cliente_id
      ORDER BY o.criado_em DESC`
  ).map((linha) => {
    const id = texto(linha.id)
    return {
      id,
      versao: versoes.get(id),
      numero: numero(linha.numero),
      data: normalizarDataCivil(texto(linha.data)),
      destinatario: normalizarDestinatario(texto(linha.destinatario_resumo)),
      observacaoInterna: textoOuNulo(linha.observacao_interna) ?? '',
      valorTotal: numero(linha.valor_total),
      status: texto(linha.status) as StatusOrcamento,
      criadoEm: texto(linha.criado_em),
      atualizadoEm: texto(linha.atualizado_em),
      servicosBusca: servicosPorOrcamento.get(id) ?? []
    }
  })
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
    const imagem =
      registrarImagem(a.imagemDataUrl, a.miniaturaDataUrl, a.largura, a.altura) ??
      (a.imagemHash || null)
    const miniatura = null

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
  while (
    n <= NUMERO_MAXIMO &&
    (donoDoNumero(n) ||
      get(`SELECT 1 FROM ${tabelaNumerosUsados()} WHERE tipo='orcamento' AND numero=?`, [n]))
  )
    n++
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
  if (
    !donoDoNumero(numero) &&
    get(`SELECT 1 FROM ${tabelaNumerosUsados()} WHERE tipo='orcamento' AND numero=?`, [numero])
  )
    return { ok: false, erro: 'Este número já foi utilizado e não pode ser reutilizado.' }
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
  list: (): ResumoOrcamento[] => listarResumosOrcamento(),

  get: (id: string): Orcamento | null => {
    const l = get('SELECT * FROM orcamentos WHERE id = ?', [id])
    return l ? paraOrcamento(l, true) : null
  },

  /** Prévia do próximo número (não consome o contador). */
  proximoNumero: (): number => numeroNuvem('orcamento', proximoNumeroLivre),

  numeracao: (): InfoNumeracao => {
    const agregado = get(
      'SELECT COALESCE(MAX(numero), 0) AS maior, COUNT(*) AS total FROM orcamentos'
    )
    return numeracaoNuvem('orcamento', {
      proximoNumero: proximoNumeroLivre(),
      maiorEmUso: numero(agregado?.maior),
      menorLivre: numeroLivreAPartirDe(1),
      totalDocumentos: numero(agregado?.total)
    })
  },

  definirProximoNumero: (n: number): ResultadoNumeracao => {
    if (nuvemConfigurada())
      return {
        ok: false,
        erro: 'Na nuvem, a numeração usa faixas exclusivas reservadas para cada computador.'
      }
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
      const protegido = validarTrocaNumero('orcamento', id, atual.status, n)
      if (protegido) return protegido
      const invalido = validarNumero(n, id)
      if (invalido) return invalido
      consumirTrocaNumero('orcamento', n)
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
      const numero = original
        ? (pedido ?? proximoNumeroLivre())
        : numeroNuvem(
            'orcamento',
            () => (pedido && !validarNumero(pedido) ? pedido : proximoNumeroLivre()),
            true
          )
      gravarConfig('seqOrcamento', Math.max(numero, seqAtual()))
      const orc = comTotalDosItens(
        normalizarOrcamento<Orcamento>({
          ...dto,
          id: randomUUID(),
          numero,
          criadoEm: original?.criadoEm ?? nowIso(),
          atualizadoEm: original?.atualizadoEm ?? nowIso()
        })
      )
      if (!original && orc.status !== 'rascunho') exigirValidacao(validarOrcamentoFinal(orc))
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
      const novo = comTotalDosItens(
        normalizarOrcamento<Orcamento>({
          ...atual,
          ...patch,
          id,
          atualizadoEm: nowIso()
        })
      )
      if (novo.status !== 'rascunho') exigirValidacao(validarOrcamentoFinal(novo))
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
      run('DELETE FROM orcamentos WHERE id = ?', [id])
      // Excluiu justamente o último número entregue? O contador recua uma
      // posição para que exatamente esse número volte, sem preencher lacunas
      // internas mais antigas.
    }),

  duplicate: (id: string): Orcamento | null =>
    tx(() => {
      const original = orcamentosRepo.get(id)
      if (!original) return null
      const numero = numeroNuvem('orcamento', proximoNumeroLivre, true)
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
    const data = blobParaDataUrl(l.imagem, 'image/jpeg')
    return data ? Buffer.from(data.split(',')[1], 'base64') : null
  }
}

envolverDocumento(orcamentosRepo, 'orcamento')
