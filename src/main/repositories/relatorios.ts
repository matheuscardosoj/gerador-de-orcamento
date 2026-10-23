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
import { clientesRepo } from './clientes'
import { registrarImagem } from '../imagens'
import { all, get, run, tx, texto, numero, textoOuNulo } from '../db/sqlite'
import type { Linha } from '../db/sqlite'
import type {
  ItemTexto,
  FormatoOrcamento,
  Relatorio,
  LancamentoRelatorio,
  AnexoRelatorio,
  StatusRelatorio,
  TipoLancamentoRelatorio,
  TipoReferenciaAnexoRelatorio,
  ResumoRelatorio
} from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { normalizarDestinatario } from '@shared/documento/comum'
import { dataCivilHoje, normalizarDataCivil } from '@shared/format'
import { exigirValidacao, normalizarRelatorio, validarRelatorioFinal } from '@shared/validacao'
import { orcamentosRepo } from './orcamentos'
import {
  nowIso,
  gravarConfig,
  blobParaDataUrl,
  paraItemServico,
  paraTexto,
  versoesResumo
} from './base'
import { observacoesRepo, pagamentosRepo } from './textos-padrao'

const NUMERO_MAXIMO = 999999

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
    imagemHash: texto(l.imagem),
    miniaturaDataUrl: blobParaDataUrl(l.imagem, 'miniatura')
  }
}

function paraRelatorio(l: Linha, filhos: boolean, comMiniaturas = filhos): Relatorio {
  const id = texto(l.id)
  const clienteId = textoOuNulo(l.cliente_id)
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
    data: normalizarDataCivil(texto(l.data)),
    clienteId,
    destinatario: normalizarDestinatario(texto(l.destinatario)),
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
          `SELECT id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura, imagem
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

function listarResumosRelatorio(): ResumoRelatorio[] {
  const versoes = versoesResumo('relatorio')
  const servicos = new Map<string, string[]>()
  for (const r of all(
    'SELECT relatorio_id,descricao FROM relatorio_itens_servico ORDER BY ordem'
  )) {
    const id = texto(r.relatorio_id)
    servicos.set(id, [...(servicos.get(id) ?? []), texto(r.descricao)])
  }
  return all(
    `SELECT r.*, r.destinatario AS destinatario_resumo
       FROM relatorios r
       LEFT JOIN clientes c ON c.id = r.cliente_id
      ORDER BY r.criado_em DESC`
  ).map((linha) => {
    const origemId = textoOuNulo(linha.origem_orcamento_id)
    const saldo = numero(linha.saldo)
    return {
      id: texto(linha.id),
      versao: versoes.get(texto(linha.id)),
      servicosBusca: servicos.get(texto(linha.id)) ?? [],
      numero: numero(linha.numero),
      data: normalizarDataCivil(texto(linha.data)),
      destinatario: normalizarDestinatario(texto(linha.destinatario_resumo)),
      observacaoInterna: textoOuNulo(linha.observacao_interna) ?? '',
      status: texto(linha.status) as StatusRelatorio,
      origemOrcamento: origemId
        ? {
            id: origemId,
            numero: numero(linha.origem_orcamento_numero),
            cliente: texto(linha.origem_orcamento_cliente)
          }
        : null,
      totais: {
        servicos: numero(linha.total_servicos),
        adiantamentos: numero(linha.total_adiantamentos),
        reembolsos: numero(linha.total_reembolsos),
        saldo,
        valorFinal: Math.abs(saldo),
        tipoSaldo: saldo < 0 ? 'devolver' : 'receber'
      },
      criadoEm: texto(linha.criado_em),
      atualizadoEm: texto(linha.atualizado_em)
    }
  })
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
    const imagem =
      registrarImagem(a.imagemDataUrl, a.miniaturaDataUrl, a.largura, a.altura) ??
      (a.imagemHash || null)
    const miniatura = null
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
  while (
    n <= NUMERO_MAXIMO &&
    (donoDoNumeroRelatorio(n) ||
      get(`SELECT 1 FROM ${tabelaNumerosUsados()} WHERE tipo='relatorio' AND numero=?`, [n]))
  )
    n++
  return n
}

function proximoNumeroRelatorio(): number {
  return numeroRelatorioLivreAPartirDe(seqRelatorioAtual() + 1)
}

function validarNumeroRelatorio(n: number, ignorarId?: string): ResultadoNumeracao | null {
  if (!Number.isInteger(n) || n < 1 || n > NUMERO_MAXIMO) {
    return { ok: false, erro: `O número deve ser um inteiro entre 1 e ${NUMERO_MAXIMO}.` }
  }
  if (
    !donoDoNumeroRelatorio(n) &&
    get(`SELECT 1 FROM ${tabelaNumerosUsados()} WHERE tipo='relatorio' AND numero=?`, [n])
  )
    return { ok: false, erro: 'Este número já foi utilizado e não pode ser reutilizado.' }
  const dono = donoDoNumeroRelatorio(n, ignorarId)
  if (!dono) return null
  return {
    ok: false,
    erro: `O número ${n} já pertence a outro relatório. O próximo número livre é ${numeroRelatorioLivreAPartirDe(n + 1)}.`,
    proximoLivre: numeroRelatorioLivreAPartirDe(n + 1)
  }
}

export const relatoriosRepo = {
  list: (): ResumoRelatorio[] => listarResumosRelatorio(),

  get: (id: string): Relatorio | null => {
    const l = get('SELECT * FROM relatorios WHERE id = ?', [id])
    return l ? paraRelatorio(l, true) : null
  },

  proximoNumero: (): number => numeroNuvem('relatorio', proximoNumeroRelatorio),

  numeracao: (): InfoNumeracao => {
    const agregado = get(
      'SELECT COALESCE(MAX(numero), 0) AS maior, COUNT(*) AS total FROM relatorios'
    )
    return numeracaoNuvem('relatorio', {
      proximoNumero: proximoNumeroRelatorio(),
      maiorEmUso: numero(agregado?.maior),
      menorLivre: numeroRelatorioLivreAPartirDe(1),
      totalDocumentos: numero(agregado?.total)
    })
  },

  definirProximoNumero: (n: number): ResultadoNumeracao => {
    if (nuvemConfigurada())
      return {
        ok: false,
        erro: 'Na nuvem, a numeração usa faixas exclusivas reservadas para cada computador.'
      }
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
      const protegido = validarTrocaNumero('relatorio', id, atual.status, n)
      if (protegido) return protegido
      const invalido = validarNumeroRelatorio(n, id)
      if (invalido) return invalido
      consumirTrocaNumero('relatorio', n)
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
      const numeroRel = original
        ? (pedido ?? proximoNumeroRelatorio())
        : numeroNuvem(
            'relatorio',
            () => (pedido && !validarNumeroRelatorio(pedido) ? pedido : proximoNumeroRelatorio()),
            true
          )
      gravarConfig('seqRelatorio', Math.max(numeroRel, seqRelatorioAtual()))
      const totais = calcularTotaisRelatorio(dto.itensServico, dto.adiantamentos, dto.reembolsos)
      const agora = nowIso()
      const rel = normalizarRelatorio<Relatorio>({
        ...dto,
        destinatario: normalizarDestinatario(dto.destinatario),
        totais,
        id: randomUUID(),
        numero: numeroRel,
        criadoEm: original?.criadoEm ?? agora,
        atualizadoEm: original?.atualizadoEm ?? agora
      })
      if (!original && rel.status !== 'rascunho') exigirValidacao(validarRelatorioFinal(rel))
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
      const novo = normalizarRelatorio<Relatorio>({
        ...atual,
        ...patch,
        id,
        atualizadoEm: nowIso()
      })
      if (novo.status !== 'rascunho') exigirValidacao(validarRelatorioFinal(novo))
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
      run('DELETE FROM relatorios WHERE id = ?', [id])
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
        clienteSnapshot: orc.clienteSnapshot,
        empresaSnapshot: orc.empresaSnapshot,
        camposCliente: orc.camposCliente,
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

export const anexosRelatorioRepo = {
  imagem: (id: string): string | null => {
    const l = get('SELECT imagem, mime FROM relatorio_anexos WHERE id = ?', [id])
    if (!l) return null
    return blobParaDataUrl(l.imagem, texto(l.mime) || 'image/jpeg') ?? null
  },
  buffer: (id: string): Buffer | null => {
    const l = get('SELECT imagem FROM relatorio_anexos WHERE id = ?', [id])
    if (!l?.imagem) return null
    const data = blobParaDataUrl(l.imagem, 'image/jpeg')
    return data ? Buffer.from(data.split(',')[1], 'base64') : null
  }
}

envolverDocumento(relatoriosRepo, 'relatorio')
