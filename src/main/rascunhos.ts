import { randomUUID } from 'crypto'
import { join } from 'path'
import { all, get, run, texto, tx, pastaDados } from './db/sqlite'
import { computadorId, hidratarDocumento } from './versoes'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import { recibosRepo } from './recibos'
import {
  consultarDocumentoRemoto,
  adotarDocumentoRemoto,
  sincronizarNuvem,
  statusNuvem
} from './nuvem'
import { autorizarGravacao } from './colaboracao'
import { snapshotRascunho, conciliarDocumento } from '@shared/conciliacao'
import { exportarDadosPara } from './dados'
import type {
  Documento,
  TipoDocumento,
  RascunhoCompartilhado,
  ComparacaoRascunho
} from '@shared/evolucao'
import type { Recibo, Relatorio } from '@shared/types'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { round2 } from '@shared/format'
import { registrarImagem, imagemDataUrl } from './imagens'

const repo = (tipo: TipoDocumento) =>
  tipo === 'orcamento' ? orcamentosRepo : tipo === 'relatorio' ? relatoriosRepo : recibosRepo
function prepararSnapshot(d: Documento): Documento {
  const documento = structuredClone(d)
  if (documento.empresaSnapshot?.logoDataUrl && !documento.empresaSnapshot.logoHash)
    documento.empresaSnapshot.logoHash =
      registrarImagem(documento.empresaSnapshot.logoDataUrl, null, 0, 0, true) ?? undefined
  if ('anexos' in documento)
    for (const a of documento.anexos) {
      if (a.imagemDataUrl && !a.imagemHash)
        a.imagemHash =
          registrarImagem(a.imagemDataUrl, a.miniaturaDataUrl, a.largura, a.altura) ?? undefined
    }
  return snapshotRascunho(documento)
}
function hidratar(d: Documento): Documento {
  const documento = hidratarDocumento(d)
  if ('anexos' in documento)
    documento.anexos = documento.anexos.map((a) => ({
      ...a,
      imagemDataUrl: a.imagemHash ? imagemDataUrl(a.imagemHash) : undefined
    }))
  return documento
}
export function obterRascunho(id: string): RascunhoCompartilhado {
  const l = get('SELECT * FROM rascunhos_compartilhados WHERE id=?', [id])
  if (!l) throw new Error('Rascunho não encontrado.')
  return {
    id,
    tipo: texto(l.tipo) as TipoDocumento,
    documentoId: texto(l.documento_id),
    baseRevisao: Number(l.base_revisao),
    base: hidratar(JSON.parse(texto(l.base))),
    documento: hidratar(JSON.parse(texto(l.documento))),
    criadoEm: texto(l.criado_em),
    atualizadoEm: texto(l.atualizado_em),
    estado: texto(l.estado) as RascunhoCompartilhado['estado']
  }
}
export function listarRascunhos(tipo?: TipoDocumento, id?: string): RascunhoCompartilhado[] {
  return all(
    "SELECT id FROM rascunhos_compartilhados WHERE estado<>'aplicado' AND (? IS NULL OR tipo=?) AND (? IS NULL OR documento_id=?) ORDER BY atualizado_em DESC",
    [tipo ?? null, tipo ?? null, id ?? null, id ?? null]
  ).map((l) => obterRascunho(texto(l.id)))
}
export function criarRascunho(
  tipo: TipoDocumento,
  id: string,
  edicao?: Documento
): RascunhoCompartilhado {
  const atual = repo(tipo).get(id) as Documento | null
  if (!atual) throw new Error('Documento não encontrado.')
  const conhecido = get(
    'SELECT documento,revisao FROM bases_documento WHERE tipo=? AND documento_id=?',
    [tipo, id]
  )
  const primeira =
    !conhecido && !get('SELECT 1 FROM sincronizacao WHERE entidade=?', [`${tipo}:${id}`])
      ? get(
          'SELECT documento FROM versoes WHERE tipo=? AND documento_id=? ORDER BY numero LIMIT 1',
          [tipo, id]
        )
      : null
  const base = conhecido
    ? (JSON.parse(texto(conhecido.documento)) as Documento)
    : primeira
      ? (JSON.parse(texto(primeira.documento)) as Documento)
      : atual
  const agora = new Date().toISOString(),
    novo = randomUUID()
  run('INSERT INTO rascunhos_compartilhados VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
    novo,
    tipo,
    id,
    statusNuvem().usuarioId ?? null,
    computadorId(),
    Number(
      get('SELECT revisao FROM sincronizacao WHERE entidade=?', [`${tipo}:${id}`])?.revisao ?? 0
    ),
    JSON.stringify(prepararSnapshot(base)),
    JSON.stringify(prepararSnapshot(edicao ?? atual)),
    agora,
    agora,
    'local'
  ])
  return obterRascunho(novo)
}
export function salvarRascunho(id: string, d: Documento): RascunhoCompartilhado {
  const r = obterRascunho(id)
  if (d.id !== r.documentoId) throw new Error('O rascunho não corresponde ao documento.')
  run('UPDATE rascunhos_compartilhados SET documento=?,atualizado_em=? WHERE id=?', [
    JSON.stringify(prepararSnapshot(d)),
    new Date().toISOString(),
    id
  ])
  return obterRascunho(id)
}
export async function compararRascunho(
  id: string,
  escolhas: Record<string, 'local' | 'remoto'> = {}
): Promise<ComparacaoRascunho> {
  const r = obterRascunho(id),
    envelope = await consultarDocumentoRemoto(r.tipo, r.documentoId)
  if (!envelope || envelope.payload.excluido)
    return {
      rascunho: r,
      remoto: null,
      revisaoRemota: envelope?.revisao ?? 0,
      documento: r.documento,
      conflitos: []
    }
  const versoes = envelope.payload.rows?.versoes ?? []
  const ultima = [...versoes].sort((a, b) => Number(b.numero) - Number(a.numero))[0]
  if (!ultima) throw new Error('A versão remota não contém um snapshot para comparação.')
  const remoto = JSON.parse(String(ultima.documento)) as Documento
  remoto.idInterno = envelope.identificador?.id_interno ?? null
  const resultado = conciliarDocumento(
    prepararSnapshot(r.base),
    prepararSnapshot(r.documento),
    prepararSnapshot(remoto),
    escolhas
  )
  return {
    rascunho: r,
    remoto: hidratar(remoto),
    revisaoRemota: envelope.revisao,
    documento: hidratar(resultado.documento),
    conflitos: resultado.conflitos
  }
}
function financeiroAlterado(base: Documento, d: Documento): boolean {
  const campos = ['status', 'adiantamentos', 'reembolsos', 'adiantamentoId']
  return campos.some(
    (k) =>
      JSON.stringify((base as unknown as Record<string, unknown>)[k]) !==
      JSON.stringify((d as unknown as Record<string, unknown>)[k])
  )
}
export async function aplicarRascunho(
  id: string,
  revisaoEsperada: number,
  escolhas: Record<string, 'local' | 'remoto'>
): Promise<Documento> {
  const r = obterRascunho(id)
  await autorizarGravacao(r.tipo, r.documentoId)
  const comparacao = await compararRascunho(id, escolhas)
  if (!comparacao.remoto)
    throw new Error('O documento foi excluído. Crie um novo a partir deste rascunho.')
  if (comparacao.revisaoRemota !== revisaoEsperada)
    throw new Error('A versão remota mudou. Compare novamente antes de aplicar.')
  if (comparacao.conflitos.length)
    throw new Error('Escolha como resolver todos os campos em conflito.')
  if (
    r.tipo === 'recibo' &&
    ['recebido', 'cancelado'].includes((comparacao.remoto as Recibo).status)
  )
    throw new Error(
      'Recibos confirmados são preservados. Use cancelamento/substituição, sem desfazer pagamentos por uma versão textual.'
    )
  if (financeiroAlterado(r.base, r.documento))
    throw new Error(
      'Mudanças de estado, recebimentos e estornos precisam das operações financeiras próprias. Preserve o rascunho e trate o pagamento separadamente.'
    )
  const envelope = await consultarDocumentoRemoto(r.tipo, r.documentoId)
  if (!envelope || envelope.revisao !== revisaoEsperada)
    throw new Error('A revisão mudou durante a comparação. Compare novamente.')
  const entidade = `${r.tipo}:${r.documentoId}`
  const pendentes = all('SELECT * FROM fila_nuvem WHERE entidade=?', [entidade])
  for (const p of pendentes) {
    if (get('SELECT 1 FROM fila_nuvem WHERE grupo=? AND entidade<>?', [p.grupo, entidade]))
      throw new Error(
        'Este documento possui uma transação relacionada. Resolva os recebimentos relacionados antes da conciliação textual.'
      )
  }
  exportarDadosPara(join(pastaDados(), `antes-conciliacao-rascunho-${Date.now()}.gdo-backup`))
  tx(() => {
    run('DELETE FROM fila_nuvem WHERE entidade=?', [entidade])
    run('DELETE FROM conflitos_nuvem WHERE entidade=?', [entidade])
    adotarDocumentoRemoto(envelope)
    const d = comparacao.documento
    if ('itensServico' in d) {
      for (const i of d.itensServico)
        if (!i.calculo) i.valorTotal = round2(i.quantidade * i.valorUnitario)
      if ('totais' in d)
        d.totais = calcularTotaisRelatorio(d.itensServico, d.adiantamentos, d.reembolsos)
      else d.valorTotal = round2(d.itensServico.reduce((s, i) => s + i.valorTotal, 0))
    }
    const atualizado = (
      repo(r.tipo).update as (id: string, patch: Partial<Documento>) => Documento | null
    )(r.documentoId, { ...d, versao: comparacao.remoto!.versao })
    if (!atualizado) throw new Error('Documento não encontrado.')
  })
  const s = await sincronizarNuvem()
  if (s.erro || get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [entidade])) {
    run("UPDATE rascunhos_compartilhados SET estado='conflito' WHERE id=?", [id])
    throw new Error(
      s.erro ?? 'A aplicação aguarda confirmação da nuvem. O rascunho foi preservado.'
    )
  }
  run("UPDATE rascunhos_compartilhados SET estado='aplicado' WHERE id=?", [id])
  return repo(r.tipo).get(r.documentoId) as Documento
}
export function copiarRascunho(id: string): Documento {
  const r = obterRascunho(id),
    d = structuredClone(r.documento)
  const dto = {
    ...d,
    status: 'rascunho',
    numero: undefined,
    computadorResponsavel: undefined,
    versao: undefined,
    idInterno: undefined
  }
  if ('anexos' in dto) dto.anexos = dto.anexos.map((a) => ({ ...a, id: randomUUID() }))
  if (r.tipo === 'recibo') {
    const c = dto as unknown as Recibo
    c.adiantamentoId = null
    c.origemId = null
    c.origemTipo = undefined
  }
  if (r.tipo === 'relatorio') {
    const c = dto as unknown as Relatorio
    c.adiantamentos = []
    c.reembolsos = []
    c.totais = calcularTotaisRelatorio(c.itensServico, [], [])
  }
  return (repo(r.tipo).create as (dto: unknown) => Documento)(dto)
}
export function descartarRascunho(id: string): void {
  run('DELETE FROM rascunhos_compartilhados WHERE id=?', [id])
}
