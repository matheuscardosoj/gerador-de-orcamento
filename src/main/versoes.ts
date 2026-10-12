import { registrarImagem, imagemDataUrl } from './imagens'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { avisarDados } from './eventos'
import { all, get, run, texto, tx, grupoTransacao } from './db/sqlite'
import type { Documento, DocumentoMetadados, TipoDocumento, VersaoDocumento } from '@shared/types'

let suspenso = 0
export function semRastreamento<T>(acao: () => T): T {
  suspenso++
  try {
    return acao()
  } finally {
    suspenso--
  }
}
export function computadorId(): string {
  const l = get("SELECT valor FROM configuracoes WHERE chave='computadorId'")
  if (l) return JSON.parse(texto(l.valor))
  const id = randomUUID()
  run('INSERT INTO configuracoes VALUES (?,?)', ['computadorId', JSON.stringify(id)])
  return id
}
export function nuvemConfigurada(): boolean {
  return !!get("SELECT 1 FROM configuracoes WHERE chave='nuvem'")
}
export function enfileirar(entidade: string, payload: unknown): void {
  if (!suspenso) avisarDados({ origem: 'local', entidades: [entidade] })
  if (suspenso || !nuvemConfigurada()) return
  const remoto = Number(
    get('SELECT revisao FROM sincronizacao WHERE entidade=?', [entidade])?.revisao ?? 0
  )
  const ultimo = get('SELECT MAX(base) AS base FROM fila_nuvem WHERE entidade=?', [entidade])?.base
  const base = ultimo == null ? remoto : Math.max(remoto, Number(ultimo) + 1)
  const [tipo, id] = entidade.split(':')
  const controle = get('SELECT geracao FROM edicoes_documento WHERE tipo=? AND documento_id=?', [
    tipo,
    id
  ])
  run('INSERT INTO fila_nuvem VALUES (?,?,?,?,?,?,?)', [
    randomUUID(),
    entidade,
    base,
    JSON.stringify(payload),
    new Date().toISOString(),
    controle?.geracao ?? null,
    grupoTransacao() ?? randomUUID()
  ])
}
export function lerMeta(tipo: TipoDocumento, id: string): DocumentoMetadados {
  const l = get('SELECT dados FROM documento_meta WHERE tipo=? AND documento_id=?', [tipo, id])
  const meta: DocumentoMetadados = l ? JSON.parse(texto(l.dados)) : {}
  const identificador = get(
    'SELECT * FROM identificadores_documento WHERE tipo=? AND documento_id=?',
    [tipo, id]
  )
  if (identificador) {
    meta.idInterno = identificador.id_interno == null ? null : Number(identificador.id_interno)
    meta.usuarioCriador = identificador.usuario_criador
      ? texto(identificador.usuario_criador)
      : null
    meta.alteradoPor = identificador.alterado_por ? texto(identificador.alterado_por) : null
  }
  if (meta.empresaSnapshot?.logoHash)
    meta.empresaSnapshot = {
      ...meta.empresaSnapshot,
      logoDataUrl: imagemDataUrl(meta.empresaSnapshot.logoHash) ?? null
    }
  return meta
}
export function exigirResponsavel(tipo: TipoDocumento, id: string): void {
  const contextoLinha = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  const contexto = contextoLinha ? JSON.parse(texto(contextoLinha.valor)) : null
  if (contexto?.protocolo >= 2 && !suspenso) {
    if (
      !get('SELECT 1 FROM sincronizacao WHERE entidade=?', [`${tipo}:${id}`]) &&
      get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [`${tipo}:${id}`])
    )
      return
    const c = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
    if (
      c?.usuario !== contexto.usuarioId ||
      c?.computador !== computadorId() ||
      (!Number(c.offline) && (!c.expira_em || Date.parse(texto(c.expira_em)) <= Date.now()))
    )
      throw new Error(
        'Solicite a edição online ou prepare este documento offline antes de alterar ou emitir. Seu rascunho pode ser preservado.'
      )
    return
  }
  if (
    (!nuvemConfigurada() && !get("SELECT 1 FROM configuracoes WHERE chave='restauracaoLocal'")) ||
    suspenso
  )
    return
  if (get('SELECT 1 FROM configuracoes WHERE chave=?', [`transferencia:${tipo}:${id}`]))
    throw new Error(
      'A transferência aguarda confirmação da nuvem. Sincronize antes de editar ou emitir este documento.'
    )
  const dono = lerMeta(tipo, id).computadorResponsavel
  if (dono && dono !== computadorId())
    throw new Error(
      'Este documento pertence a outro computador. Crie uma cópia ou solicite a transferência com os dois computadores conectados.'
    )
}
function normalizado(d: Documento): string {
  const copia = structuredClone(d) as Documento
  const dados = copia as unknown as Record<string, unknown>
  delete dados.atualizadoEm
  delete dados.versao
  for (const chave of [
    'idInterno',
    'usuarioCriador',
    'alteradoPor',
    'autorNome',
    'computadorResponsavel'
  ])
    delete dados[chave]
  if ('anexos' in copia)
    copia.anexos = copia.anexos.map((a) => {
      const c = { ...a }
      delete c.imagemDataUrl
      delete c.miniaturaDataUrl
      return c
    })
  if (copia.empresaSnapshot?.logoDataUrl) {
    const e = copia.empresaSnapshot
    const hash = registrarImagem(e.logoDataUrl, null, 0, 0, true)
    copia.empresaSnapshot = { ...e, logoHash: hash ?? undefined, logoDataUrl: null }
  }
  return JSON.stringify(copia)
}
export function registrarVersao(tipo: TipoDocumento, d: Documento, descricao = ''): Documento {
  const contextoLinha = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  const contexto = contextoLinha ? JSON.parse(texto(contextoLinha.valor)) : null
  const anterior = get(
    'SELECT * FROM versoes WHERE tipo=? AND documento_id=? ORDER BY numero DESC LIMIT 1',
    [tipo, d.id]
  )
  const antigo = anterior ? (JSON.parse(texto(anterior.documento)) as Documento) : null
  const meta = lerMeta(tipo, d.id)
  const cliente = d.clienteId ? get('SELECT * FROM clientes WHERE id=?', [d.clienteId]) : null
  const clienteSnapshot =
    d.clienteSnapshot !== undefined && (!d.clienteId || d.clienteSnapshot?.id === d.clienteId)
      ? d.clienteSnapshot
      : ((meta.clienteSnapshot?.id === d.clienteId ? meta.clienteSnapshot : null) ??
        (cliente
          ? {
              ...JSON.parse(texto(cliente.dados_json) || '{}'),
              id: cliente.id,
              nome: cliente.nome,
              tratamento: cliente.tratamento,
              ativo: cliente.ativo === 1,
              criadoEm: cliente.criado_em
            }
          : null))
  const empresa = get("SELECT valor FROM configuracoes WHERE chave='empresa'")
  const documento = {
    ...d,
    ...(contexto?.protocolo >= 2
      ? {
          alteradoPor: contexto.usuarioId,
          autorNome: contexto.usuarioNome,
          usuarioCriador: meta.usuarioCriador ?? contexto.usuarioId
        }
      : {}),
    clienteSnapshot,
    empresaSnapshot:
      d.empresaSnapshot ??
      meta.empresaSnapshot ??
      (empresa ? JSON.parse(texto(empresa.valor)) : undefined),
    camposCliente:
      d.camposCliente ??
      meta.camposCliente ??
      (() => {
        const padrao = get("SELECT valor FROM configuracoes WHERE chave='camposClientePadrao'")
        return padrao
          ? JSON.parse(texto(padrao.valor))
          : ((empresa ? JSON.parse(texto(empresa.valor)).camposClientePadrao : undefined) ?? [
              'documento'
            ])
      })(),
    computadorResponsavel:
      contexto?.protocolo >= 2
        ? computadorId()
        : (d.computadorResponsavel ?? meta.computadorResponsavel ?? computadorId())
  }
  if (d.status !== 'rascunho' && d.numero > 0)
    run('INSERT OR IGNORE INTO numeros_emitidos VALUES (?,?,?,?)', [
      tipo,
      d.id,
      d.numero,
      new Date().toISOString()
    ])
  if (antigo && normalizado(antigo) === normalizado(documento))
    return { ...documento, versao: Number(anterior?.numero) }
  const numero = Number(anterior?.numero ?? 0) + 1
  const id = randomUUID()
  const agora = new Date().toISOString()
  documento.versao = numero
  const snapshot = structuredClone(documento)
  if ('anexos' in snapshot)
    snapshot.anexos = snapshot.anexos.map((a) => {
      const c = { ...a }
      delete c.imagemDataUrl
      delete c.miniaturaDataUrl
      return c
    })
  if (snapshot.empresaSnapshot?.logoDataUrl) {
    const e = snapshot.empresaSnapshot
    const hash = registrarImagem(e.logoDataUrl, null, 0, 0, true)
    snapshot.empresaSnapshot = { ...e, logoHash: hash ?? undefined, logoDataUrl: null }
  }
  run('INSERT INTO versoes VALUES (?,?,?,?,?,?,?,?,?)', [
    id,
    tipo,
    d.id,
    numero,
    anterior?.id ?? null,
    agora,
    hostname(),
    descricao,
    JSON.stringify(snapshot)
  ])
  run(
    'INSERT INTO documento_meta VALUES (?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET dados=excluded.dados',
    [
      tipo,
      d.id,
      JSON.stringify({
        versao: numero,
        clienteSnapshot: documento.clienteSnapshot,
        empresaSnapshot: snapshot.empresaSnapshot,
        camposCliente: documento.camposCliente,
        computadorResponsavel: documento.computadorResponsavel
      })
    ]
  )
  run('INSERT OR IGNORE INTO numeros_usados VALUES (?,?)', [tipo, d.numero])
  return hidratarDocumento(documento)
}
export function hidratarDocumento<T extends Documento>(d: T): T {
  if (d.empresaSnapshot?.logoHash)
    return {
      ...d,
      empresaSnapshot: {
        ...d.empresaSnapshot,
        logoDataUrl: imagemDataUrl(d.empresaSnapshot.logoHash) ?? null
      }
    }
  return d
}
export function listarVersoes(tipo: TipoDocumento, id: string): VersaoDocumento[] {
  return all('SELECT * FROM versoes WHERE tipo=? AND documento_id=? ORDER BY numero DESC', [
    tipo,
    id
  ]).map((l) => ({
    id: texto(l.id),
    tipo,
    documentoId: id,
    numero: Number(l.numero),
    anteriorId: l.anterior_id ? texto(l.anterior_id) : null,
    criadoEm: texto(l.criado_em),
    computador: texto(l.computador),
    descricao: texto(l.descricao),
    documento: hidratarDocumento(JSON.parse(texto(l.documento)))
  }))
}
export function obterVersao(id: string): VersaoDocumento {
  const l = get('SELECT tipo,documento_id FROM versoes WHERE id=?', [id])
  if (!l) throw new Error('Versão não encontrada.')
  return listarVersoes(texto(l.tipo) as TipoDocumento, texto(l.documento_id)).find(
    (v) => v.id === id
  )!
}
export const tabelasFilhos: Record<string, string[]> = {
  orcamento: ['itens_servico', 'materiais', 'orcamento_textos', 'anexos'],
  relatorio: [
    'relatorio_itens_servico',
    'relatorio_lancamentos',
    'relatorio_textos',
    'relatorio_anexos'
  ],
  recibo: []
}
export function pacoteDocumento(tipo: TipoDocumento, id: string): unknown {
  const contexto = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  const tabela = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[tipo]
  const principal = get(`SELECT * FROM ${tabela} WHERE id=?`, [id])
  const rows: Record<string, unknown> = { [tabela]: principal ? [principal] : [] }
  for (const t of tabelasFilhos[tipo]) rows[t] = all(`SELECT * FROM ${t} WHERE ${tipo}_id=?`, [id])
  rows.documento_meta = all('SELECT * FROM documento_meta WHERE tipo=? AND documento_id=?', [
    tipo,
    id
  ])
  rows.versoes = all('SELECT * FROM versoes WHERE tipo=? AND documento_id=?', [tipo, id])
  if (tipo === 'recibo')
    rows.recebimentos = all('SELECT * FROM recebimentos WHERE recibo_id=?', [id])
  return {
    tipo,
    id,
    rows,
    excluido: !principal,
    responsavel: lerMeta(tipo, id).computadorResponsavel,
    ...(contexto && JSON.parse(texto(contexto.valor)).protocolo >= 2
      ? {
          emissao:
            get('SELECT numero,criado_em FROM numeros_emitidos WHERE tipo=? AND documento_id=?', [
              tipo,
              id
            ]) ?? null
        }
      : {})
  }
}
export function envolverDocumento<T extends object>(repo: T, tipo: TipoDocumento): T {
  const alvo = repo as Record<string, (...args: unknown[]) => unknown>
  const ler = alvo.get
  alvo.get = (id) => {
    const d = ler(id) as Documento | null
    return d ? { ...d, ...lerMeta(tipo, String(id)) } : null
  }
  for (const nome of [
    'create',
    'update',
    'duplicate',
    'remove',
    'alterarNumero',
    'criarDeOrcamento',
    'confirmar',
    'cancelar'
  ]) {
    const original = alvo[nome]
    if (!original) continue
    alvo[nome] = (...args) =>
      tx(() => {
        if (!suspenso && ['update', 'remove', 'alterarNumero'].includes(nome))
          exigirResponsavel(tipo, String(args[0]))
        const patch = args[1] as Partial<Documento> | undefined
        if (!suspenso && tipo === 'relatorio' && ['update', 'remove'].includes(nome)) {
          const pagamentos = all(
            'SELECT adiantamento_id,valor FROM recebimentos WHERE relatorio_id=? AND estornado=0',
            [String(args[0])]
          )
          if (nome === 'remove' && pagamentos.length)
            throw new Error(
              'Este relatório possui recebimentos confirmados. Cancele os recibos antes de excluir.'
            )
          const adiantamentos = (patch as Partial<import('@shared/types').Relatorio> | undefined)
            ?.adiantamentos
          if (
            adiantamentos &&
            pagamentos.some(
              (p) =>
                !adiantamentos.some(
                  (a) => a.id === p.adiantamento_id && a.valor === Number(p.valor)
                )
            )
          )
            throw new Error(
              'Recebimentos confirmados são preservados. Cancele o recibo para corrigir o pagamento.'
            )
        }
        if (
          !suspenso &&
          nome === 'update' &&
          patch?.versao != null &&
          patch.versao !== lerMeta(tipo, String(args[0])).versao
        )
          throw new Error(
            'O documento mudou desde que foi aberto. Reabra ou crie uma cópia das suas alterações.'
          )
        const fonte = nome === 'duplicate' ? (alvo.get(args[0]) as Documento | null) : null
        const resultado = original(...args)
        if (suspenso) return resultado
        const d = (
          nome === 'alterarNumero' ? (resultado as Record<string, unknown>)?.[tipo] : resultado
        ) as Documento | null
        if (d?.id) {
          const extras =
            nome === 'duplicate'
              ? fonte
              : nome === 'update'
                ? patch
                : (args[0] as Partial<Documento>)
          const novo = registrarVersao(tipo, {
            ...d,
            ...(extras?.clienteSnapshot !== undefined
              ? { clienteSnapshot: extras.clienteSnapshot }
              : {}),
            ...(extras?.camposCliente ? { camposCliente: extras.camposCliente } : {}),
            ...(extras?.empresaSnapshot ? { empresaSnapshot: extras.empresaSnapshot } : {})
          })
          enfileirar(`${tipo}:${d.id}`, pacoteDocumento(tipo, d.id))
          return nome === 'alterarNumero' ? { ...(resultado as object), [tipo]: novo } : novo
        }
        if (nome === 'remove')
          enfileirar(`${tipo}:${String(args[0])}`, pacoteDocumento(tipo, String(args[0])))
        return resultado
      })
  }
  return repo
}
