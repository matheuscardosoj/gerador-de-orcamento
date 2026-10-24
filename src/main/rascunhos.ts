import { vincularAplicacaoRascunho } from './rascunhos-envio'
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
export function preservarConflitos(entidades: string[]): void {
  for (const entidade of entidades) {
    const separador = entidade.indexOf(':')
    const tipo = entidade.slice(0, separador) as TipoDocumento,
      id = entidade.slice(separador + 1)
    if (!['orcamento', 'relatorio', 'recibo'].includes(tipo)) continue
    const documento = repo(tipo).get(id) as Documento | null
    if (!documento) continue
    const snapshot = JSON.stringify(prepararSnapshot(documento))
    if (
      get(
        "SELECT 1 FROM rascunhos_compartilhados WHERE tipo=? AND documento_id=? AND documento=? AND estado='conflito'",
        [tipo, id, snapshot]
      )
    )
      continue
    const r = criarRascunho(tipo, id, documento)
    run("UPDATE rascunhos_compartilhados SET estado='conflito' WHERE id=?", [r.id])
  }
}
export function criarRascunho(
  tipo: TipoDocumento,
  id: string,
  edicao?: Documento
): RascunhoCompartilhado {
  const atual = repo(tipo).get(id) as Documento | null
  if (!atual && (!edicao || edicao.id !== id)) throw new Error('Documento não encontrado.')
  const snapshot = JSON.stringify(prepararSnapshot((edicao ?? atual)!))
  const identico = get(
    "SELECT id FROM rascunhos_compartilhados WHERE tipo=? AND documento_id=? AND documento=? AND estado<>'aplicado' ORDER BY atualizado_em DESC LIMIT 1",
    [tipo, id, snapshot]
  )
  if (identico) return obterRascunho(texto(identico.id))
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
      : (atual ?? edicao!)
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
    JSON.stringify(prepararSnapshot((edicao ?? atual)!)),
    agora,
    agora,
    'local'
  ])
  return obterRascunho(novo)
}
export function salvarRascunho(id: string, d: Documento): RascunhoCompartilhado {
  const r = obterRascunho(id)
  if (r.estado === 'aguardando_confirmacao')
    throw new Error('Este rascunho já foi aplicado localmente e aguarda confirmação da nuvem.')
  if (d.id !== r.documentoId) throw new Error('O rascunho não corresponde ao documento.')
  // Um editor que ficou aberto durante o ACK não pode alterar o snapshot já aplicado.
  if (r.estado === 'aplicado') return criarRascunho(r.tipo, r.documentoId, d)
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
    envelope = await consultarDocumentoRemoto(r.tipo, r.documentoId, 8000)
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
  const conteudoLocal = structuredClone(r.documento)
  // Conteúdo e financeiro têm fluxos diferentes. Uma comparação textual mantém
  // os lançamentos e estados atuais da empresa, inclusive se o rascunho é antigo.
  if ('totais' in remoto && 'totais' in conteudoLocal) {
    conteudoLocal.adiantamentos = remoto.adiantamentos
    conteudoLocal.reembolsos = remoto.reembolsos
    conteudoLocal.status = remoto.status
  }
  if ('quitacao' in remoto && 'quitacao' in conteudoLocal) {
    conteudoLocal.status = remoto.status
    conteudoLocal.adiantamentoId = remoto.adiantamentoId
  }
  const resultado = conciliarDocumento(
    prepararSnapshot(r.base),
    prepararSnapshot(conteudoLocal),
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
  const campos = ['adiantamentos', 'reembolsos', 'adiantamentoId']
  if ('totais' in d || 'quitacao' in d) campos.push('status')
  return campos.some(
    (k) => JSON.stringify(Reflect.get(base, k)) !== JSON.stringify(Reflect.get(d, k))
  )
}
export async function aplicarRascunho(
  id: string,
  revisaoEsperada: number,
  escolhas: Record<string, 'local' | 'remoto'>
): Promise<Documento> {
  const r = obterRascunho(id)
  if (r.estado === 'aguardando_confirmacao' || r.estado === 'aplicado')
    throw new Error(
      'Este rascunho já foi aplicado. Aguarde a confirmação da nuvem antes de continuar.'
    )
  if (
    get(
      "SELECT 1 FROM rascunhos_compartilhados WHERE tipo=? AND documento_id=? AND estado='aguardando_confirmacao'",
      [r.tipo, r.documentoId]
    )
  )
    throw new Error('Este documento já tem um rascunho aplicado e aguarda confirmação da nuvem.')
  const comparacao = await compararRascunho(id, escolhas)
  await autorizarGravacao(r.tipo, r.documentoId)
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
  if (financeiroAlterado(comparacao.remoto, comparacao.documento))
    throw new Error(
      'Mudanças de estado, recebimentos e estornos precisam das operações financeiras próprias. Preserve o rascunho e trate o pagamento separadamente.'
    )
  const envelope = await consultarDocumentoRemoto(r.tipo, r.documentoId, 8000)
  if (!envelope || envelope.revisao !== revisaoEsperada)
    throw new Error('A revisão mudou durante a comparação. Compare novamente.')
  const entidade = `${r.tipo}:${r.documentoId}`
  const pendentes = all("SELECT * FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'", [
    entidade
  ])
  for (const p of pendentes) {
    if (
      get("SELECT 1 FROM fila_nuvem WHERE grupo=? AND entidade<>? AND estado<>'preservada'", [
        p.grupo,
        entidade
      ])
    )
      throw new Error(
        'Este documento possui uma transação relacionada. Resolva os recebimentos relacionados antes da conciliação textual.'
      )
  }
  exportarDadosPara(join(pastaDados(), `antes-conciliacao-rascunho-${Date.now()}.gdo-backup`))
  tx(() => {
    if (
      get(
        "SELECT 1 FROM rascunhos_compartilhados WHERE tipo=? AND documento_id=? AND estado='aguardando_confirmacao'",
        [r.tipo, r.documentoId]
      )
    )
      throw new Error('Este documento já tem um rascunho aplicado e aguarda confirmação da nuvem.')
    const atual = obterRascunho(id)
    if (atual.estado === 'aguardando_confirmacao' || atual.estado === 'aplicado')
      throw new Error(
        'Este rascunho já foi aplicado. Aguarde a confirmação da nuvem antes de continuar.'
      )
    if (JSON.stringify(atual.documento) !== JSON.stringify(r.documento))
      throw new Error('O rascunho mudou durante a comparação. Compare novamente antes de aplicar.')
    run("DELETE FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'", [entidade])
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
    const operacoes = all("SELECT id FROM fila_nuvem WHERE entidade=? AND estado='pendente'", [
      entidade
    ])
    vincularAplicacaoRascunho(
      id,
      operacoes.map((op) => texto(op.id))
    )
  })
  await sincronizarNuvem()
  const estado = obterRascunho(id).estado
  if (estado === 'conflito')
    throw new Error(
      'A versão ou autorização mudou durante o envio. O rascunho está preservado para nova comparação.'
    )
  if (estado === 'envio_interrompido')
    throw new Error(
      'O envio deste rascunho precisa de revisão em Nuvem. As alterações locais estão preservadas.'
    )
  if (estado !== 'aplicado')
    throw new Error(
      'A aplicação está salva neste computador e aguarda confirmação da nuvem. O envio será retomado automaticamente; não é necessário aplicar novamente.'
    )
  return repo(r.tipo).get(r.documentoId) as Documento
}
export function copiarRascunho(id: string): Documento {
  if (obterRascunho(id).estado === 'aguardando_confirmacao')
    throw new Error('Aguarde a confirmação da aplicação antes de copiar este rascunho.')
  const r = obterRascunho(id),
    d = structuredClone(r.documento)
  const dto = {
    ...d,
    status: 'rascunho',
    numero: undefined,
    computadorResponsavel: undefined,
    versao: undefined
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
  return tx(() => {
    const novo = (repo(r.tipo).create as (dto: unknown) => Documento)(dto)
    run("UPDATE rascunhos_compartilhados SET estado='aplicado' WHERE id=?", [id])
    return novo
  })
}
export function descartarRascunho(id: string): void {
  if (obterRascunho(id).estado === 'aguardando_confirmacao')
    throw new Error('Aguarde a confirmação da aplicação antes de excluir este rascunho.')
  run('DELETE FROM rascunhos_compartilhados WHERE id=?', [id])
}
