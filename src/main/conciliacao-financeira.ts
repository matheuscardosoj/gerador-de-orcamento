import { randomUUID } from 'crypto'
import { join } from 'path'
import { all, get, run, texto, tx, pastaDados } from './db/sqlite'
import {
  consultarDocumentoRemoto,
  adotarDocumentoRemoto,
  pedidoNuvem,
  sincronizarNuvem,
  statusNuvem,
  type Remoto
} from './nuvem'
import { autorizarGravacao } from './colaboracao'
import { preservarConflitos } from './rascunhos'
import { recibosRepo } from './recibos'
import { computadorId } from './versoes'
import { exportarDadosPara } from './dados'
import type { Recibo, RevisaoRecebimentos, TipoDocumento } from '@shared/evolucao'

async function conjunto(tipo: TipoDocumento, id: string): Promise<Map<string, Remoto>> {
  const entidades = new Set([`${tipo}:${id}`])
  let relatorioId = tipo === 'relatorio' ? id : null
  if (tipo === 'recibo') {
    const local = recibosRepo.get(id)
    relatorioId = local?.origemTipo === 'relatorio' ? (local.origemId ?? null) : null
    if (!local)
      relatorioId =
        texto(get('SELECT relatorio_id FROM recebimentos WHERE recibo_id=?', [id])?.relatorio_id) ||
        null
  }
  if (relatorioId) {
    entidades.add(`relatorio:${relatorioId}`)
    for (const r of recibosRepo.list())
      if (r.origemTipo === 'relatorio' && r.origemId === relatorioId)
        entidades.add(`recibo:${r.id}`)
    for (const p of all('SELECT recibo_id FROM recebimentos WHERE relatorio_id=?', [relatorioId]))
      entidades.add(`recibo:${p.recibo_id}`)
    const remotos = (await pedidoNuvem(
      `/rest/v1/recibos?select=id&origem_tipo=eq.relatorio&origem_id=eq.${encodeURIComponent(relatorioId)}`
    )) as Array<{ id: string }>
    for (const r of remotos) entidades.add(`recibo:${r.id}`)
  }
  const resultado = new Map<string, Remoto>()
  for (const entidade of entidades) {
    const pos = entidade.indexOf(':'),
      t = entidade.slice(0, pos) as TipoDocumento,
      doc = entidade.slice(pos + 1)
    const remoto = await consultarDocumentoRemoto(t, doc)
    if (!remoto)
      throw new Error(
        'Há documento ainda não publicado. Sincronize sua criação antes de revisar recebimentos.'
      )
    resultado.set(entidade, remoto)
  }
  return resultado
}
function operacoes(remotos: Map<string, Remoto>): RevisaoRecebimentos['operacoes'] {
  const resultado: RevisaoRecebimentos['operacoes'] = []
  for (const [entidade, remoto] of remotos) {
    if (
      !entidade.startsWith('recibo:') ||
      !get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [entidade])
    )
      continue
    const id = entidade.slice(7),
      p = get('SELECT * FROM recebimentos WHERE recibo_id=?', [id])
    if (!p) continue
    const r = recibosRepo.get(id)
    const ultima = get(
      "SELECT documento FROM versoes WHERE tipo='recibo' AND documento_id=? ORDER BY numero DESC LIMIT 1",
      [id]
    )
    const local = r ?? (ultima ? (JSON.parse(texto(ultima.documento)) as Recibo) : null)
    if (!local)
      throw new Error(
        'Não foi possível recuperar o documento do recebimento. Preserve o backup para revisão.'
      )
    const remotoDocumento = remoto.payload.rows?.recibos?.[0]
    const d = remotoDocumento ? (JSON.parse(texto(remotoDocumento.dados)) as Recibo) : null
    const atual = remoto.payload.rows?.recebimentos?.find((x) => x.recibo_id === id)
    const estornar = Number(p.estornado) === 1
    const item: RevisaoRecebimentos['operacoes'][number] = {
      reciboId: id,
      numero: local.numero,
      cliente: local.destinatario,
      valor: Number(p.valor),
      acao: estornar ? 'estornar' : 'confirmar',
      situacao: 'pendente',
      detalhe: 'Operação ainda não confirmada pela nuvem.',
      excluir: !r
    }
    if (
      atual &&
      (Number(atual.valor) !== Number(p.valor) ||
        atual.relatorio_id !== p.relatorio_id ||
        atual.adiantamento_id !== p.adiantamento_id)
    ) {
      item.situacao = 'divergente'
      item.detalhe =
        'O recebimento remoto usa outro valor ou vínculo. Revise o pagamento; não será sobrescrito.'
    } else if (atual && Number(atual.estornado) === (estornar ? 1 : 0)) {
      item.situacao = 'aplicada'
      item.detalhe = 'A nuvem já confirmou esta operação. Não será contabilizada novamente.'
    } else if (
      !d ||
      remoto.payload.excluido ||
      (!estornar && (d.status === 'cancelado' || Number(atual?.estornado) === 1))
    ) {
      item.situacao = 'divergente'
      item.detalhe =
        'O documento remoto foi cancelado ou excluído. Não é possível reativar seu pagamento.'
    } else if (
      !estornar &&
      (d.valor !== Number(p.valor) ||
        d.origemId !== local.origemId ||
        d.formaPagamento !== local.formaPagamento)
    ) {
      item.situacao = 'divergente'
      item.detalhe =
        'Valor, origem ou forma de pagamento mudou na empresa. Preserve a alternativa e prepare um novo recibo após revisar.'
    }
    resultado.push(item)
  }
  return resultado
}
export async function revisarRecebimentos(
  tipo: TipoDocumento,
  id: string
): Promise<RevisaoRecebimentos> {
  const remotos = await conjunto(tipo, id)
  return {
    tipo,
    documentoId: id,
    revisoes: Object.fromEntries([...remotos].map(([e, r]) => [e, r.revisao])),
    operacoes: operacoes(remotos)
  }
}
export async function conciliarRecebimentos(
  revisao: RevisaoRecebimentos,
  acao: 'reaplicar' | 'arquivar'
): Promise<void> {
  if (!['reaplicar', 'arquivar'].includes(acao)) throw new Error('Ação inválida.')
  const remotos = await conjunto(revisao.tipo, revisao.documentoId)
  const revisoes = Object.fromEntries([...remotos].map(([e, r]) => [e, r.revisao])),
    atuais = operacoes(remotos)
  if (
    JSON.stringify(revisoes) !== JSON.stringify(revisao.revisoes) ||
    JSON.stringify(atuais) !== JSON.stringify(revisao.operacoes)
  )
    throw new Error('Os dados mudaram desde a revisão. Compare os recebimentos novamente.')
  if (!atuais.length) throw new Error('Não há recebimentos pendentes neste conjunto.')
  if (acao === 'reaplicar' && atuais.some((o) => o.situacao === 'divergente'))
    throw new Error(
      'Há divergências financeiras. Preserve os registros para revisão; os dados da empresa não serão sobrescritos.'
    )
  const entidades = [...remotos.keys()]
  const pendentes = all('SELECT * FROM fila_nuvem').filter((l) =>
    entidades.includes(texto(l.entidade))
  )
  for (const p of pendentes)
    if (
      all('SELECT entidade FROM fila_nuvem WHERE grupo=?', [p.grupo]).some(
        (l) => !entidades.includes(texto(l.entidade))
      )
    )
      throw new Error(
        'Esta transação inclui outras alterações. Preserve os rascunhos e sincronize os cadastros relacionados antes de revisar pagamentos.'
      )
  if (acao === 'reaplicar')
    for (const o of atuais.filter((o) => o.situacao === 'pendente')) {
      await autorizarGravacao('recibo', o.reciboId)
      const p = get('SELECT relatorio_id FROM recebimentos WHERE recibo_id=?', [o.reciboId])
      if (p?.relatorio_id) await autorizarGravacao('relatorio', texto(p.relatorio_id))
    }
  // Recuperar o bloqueio não aumenta a revisão do conteúdo; uma alteração concorrente
  // posterior será rejeitada pelo compare-and-swap da nova operação.
  for (const [entidade, anterior] of remotos) {
    const atual = await consultarDocumentoRemoto(anterior.payload.tipo!, anterior.payload.id)
    if (!atual || atual.revisao !== anterior.revisao)
      throw new Error(
        'A empresa recebeu novas alterações durante a autorização. Revise os recebimentos novamente.'
      )
    remotos.set(entidade, atual)
  }
  const backup = join(pastaDados(), `antes-revisao-recebimentos-${Date.now()}.gdo-backup`)
  exportarDadosPara(backup)
  preservarConflitos(entidades)
  tx(() => {
    run('INSERT INTO auditoria_colaboracao VALUES (?,?,?,?,?,?,?)', [
      randomUUID(),
      new Date().toISOString(),
      statusNuvem().usuarioId ?? null,
      computadorId(),
      `recebimentos:${acao}`,
      `${revisao.tipo}:${revisao.documentoId}`,
      JSON.stringify({
        backup,
        revisao,
        operacoesOriginais: pendentes,
        recebimentosOriginais: all('SELECT * FROM recebimentos').filter((p) =>
          atuais.some((o) => o.reciboId === p.recibo_id)
        )
      })
    ])
    for (const entidade of entidades) {
      run('DELETE FROM fila_nuvem WHERE entidade=?', [entidade])
      run('DELETE FROM conflitos_nuvem WHERE entidade=?', [entidade])
      if (entidade.startsWith('recibo:'))
        run('DELETE FROM recebimentos WHERE recibo_id=?', [entidade.slice(7)])
    }
    for (const remoto of [...remotos.values()].sort(
      (a, b) =>
        (a.payload.tipo === 'relatorio' ? -1 : 1) - (b.payload.tipo === 'relatorio' ? -1 : 1)
    ))
      adotarDocumentoRemoto(remoto)
    if (acao === 'reaplicar')
      for (const o of atuais) {
        if (o.situacao === 'pendente') {
          if (o.acao === 'confirmar') recibosRepo.confirmar(o.reciboId)
          else recibosRepo.cancelar(o.reciboId)
        }
        if (o.excluir && recibosRepo.get(o.reciboId)) recibosRepo.remove(o.reciboId)
      }
  })
  const s = await sincronizarNuvem()
  if (
    s.erro ||
    all('SELECT entidade FROM fila_nuvem').some((l) => entidades.includes(texto(l.entidade)))
  )
    throw new Error(
      'A nova operação continua aguardando confirmação. Os registros originais e o backup foram preservados; revise novamente após sincronizar.'
    )
}
