import { randomUUID as novoId } from 'crypto'
import { Database } from 'node-sqlite3-wasm'
import { get, run } from './db/sqlite'
import {
  clientesRepo,
  orcamentosRepo,
  relatoriosRepo,
  servicosRepo,
  observacoesRepo,
  pagamentosRepo
} from './repositories'
import { linhaImagemValida } from '@shared/imagem-segura'
import type { FormaPagamentoPadrao, ObservacaoPadrao } from '@shared/types'

import { type Resumo, normal } from './dados-comuns'
import {
  contar,
  linha,
  linhas,
  temTabela,
  copiarAnexosOrcamento,
  copiarAnexosRelatorio,
  itensOrcamento,
  itensRelatorio,
  novosIdsOrcamento,
  novosIdsRelatorio,
  idLivre
} from './dados-auxiliares'

export interface ContextoMescla {
  fonte: Database
  r: Resumo
  origem: { id: string; legado: boolean }
  mesmaOrigem: boolean
  clientes: Map<string, string>
  servicos: Map<string, string>
  observacoes: Map<string, string>
  pagamentos: Map<string, string>
  referenciasRelatorio: Map<string, Map<string, string>>
  referenciasOrcamento: Map<string, Map<string, string>>
  idsAntes: Set<string>
  chaveDocumento: (id: unknown) => string
  jaImportado: (tipo: 'orcamento' | 'relatorio', id: unknown) => boolean
  destinoDocumento: (tipo: string, id: string) => string | null
}

/** Monta o estado compartilhado das etapas da mesclagem (mapas origem → destino e consultas). */
export function criarContextoMescla(
  fonte: Database,
  r: Resumo,
  origem: { id: string; legado: boolean },
  mesmaOrigem: boolean
): ContextoMescla {
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
  return {
    fonte,
    r,
    origem,
    mesmaOrigem,
    clientes: new Map<string, string>(),
    servicos: new Map<string, string>(),
    observacoes: new Map<string, string>(),
    pagamentos: new Map<string, string>(),
    referenciasRelatorio,
    referenciasOrcamento,
    idsAntes,
    chaveDocumento,
    jaImportado,
    destinoDocumento
  }
}

export function mesclarCadastros(c: ContextoMescla): void {
  const { fonte, r, clientes, servicos, observacoes, pagamentos } = c
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
    for (const x of linhas(fonte, 'SELECT * FROM imagens')) {
      if (!linhaImagemValida(x)) continue
      run('INSERT OR IGNORE INTO imagens VALUES (?,?,?,?,?,?,?)', [
        x.hash,
        x.mime,
        x.base64,
        x.miniatura_base64,
        x.bytes,
        x.largura,
        x.altura
      ])
    }
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
}

export function mesclarOrcamentosERelatorios(c: ContextoMescla): void {
  const {
    fonte,
    r,
    clientes,
    servicos,
    observacoes,
    pagamentos,
    referenciasRelatorio,
    referenciasOrcamento,
    chaveDocumento,
    jaImportado
  } = c
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
}

export function mesclarRecibos(c: ContextoMescla): void {
  const { fonte, r, clientes, referenciasRelatorio, chaveDocumento, destinoDocumento } = c
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
}

export function mesclarVersoes(c: ContextoMescla): void {
  const { fonte, mesmaOrigem, clientes, idsAntes, destinoDocumento } = c
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
}

export function mesclarEmissoesEAutoria(c: ContextoMescla): void {
  const { fonte, mesmaOrigem, destinoDocumento } = c
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
}

export function mesclarRascunhos(c: ContextoMescla): void {
  const {
    fonte,
    r,
    origem,
    mesmaOrigem,
    clientes,
    servicos,
    observacoes,
    pagamentos,
    referenciasRelatorio,
    referenciasOrcamento,
    destinoDocumento
  } = c
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
}
