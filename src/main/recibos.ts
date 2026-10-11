import { randomUUID } from 'crypto'
import { all, get, run, texto, tx } from './db/sqlite'
import { envolverDocumento, exigirResponsavel, lerMeta } from './versoes'
import { numeroNuvem } from './numeros'
import { relatoriosRepo } from './repositories'
import { round2, normalizarDataCivil } from '@shared/format'
import type { Recibo } from '@shared/types'

function validar(r: Recibo): void {
  if (!Number.isFinite(r.valor) || r.valor < 0) throw new Error('Valor inválido.')
  if (!['rascunho', 'pendente', 'recebido', 'cancelado'].includes(r.status))
    throw new Error('Estado de recibo inválido.')
  if (r.status === 'rascunho' || r.status === 'cancelado') return
  if (
    !r.destinatario.trim() ||
    !r.descricao.trim() ||
    !r.local.trim() ||
    !r.formaPagamento.trim() ||
    r.valor <= 0
  )
    throw new Error('Preencha cliente, serviço, valor, local e forma de pagamento.')
  const data = normalizarDataCivil(r.data)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) !== data
  )
    throw new Error('Data inválida.')
}
function gravar(r: Recibo): Recibo {
  validar(r)
  run('INSERT INTO recibos VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET dados=excluded.dados', [
    r.id,
    r.numero,
    JSON.stringify(r)
  ])
  return r
}
export const recibosRepo = {
  list: (): Recibo[] =>
    all('SELECT id,dados FROM recibos ORDER BY numero DESC').map((l) => ({
      ...JSON.parse(texto(l.dados)),
      ...lerMeta('recibo', texto(l.id))
    })),
  get: (id: string): Recibo | null => {
    const l = get('SELECT dados FROM recibos WHERE id=?', [id])
    return l ? JSON.parse(texto(l.dados)) : null
  },
  create: (dto: Omit<Recibo, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'>): Recibo =>
    tx(() => {
      if (dto.status === 'recebido' || dto.status === 'cancelado')
        throw new Error('Crie um rascunho ou cobrança antes de confirmar o pagamento.')
      const numero = numeroNuvem(
        'recibo',
        () =>
          Number(get("SELECT MAX(numero) AS n FROM numeros_usados WHERE tipo='recibo'")?.n ?? 0) +
          1,
        true
      )
      const agora = new Date().toISOString()
      return gravar({ ...dto, id: randomUUID(), numero, criadoEm: agora, atualizadoEm: agora })
    }),
  update: (id: string, patch: Partial<Recibo>): Recibo | null =>
    tx(() => {
      const atual = recibosRepo.get(id)
      if (!atual) return null
      if (atual.status === 'recebido' || atual.status === 'cancelado')
        throw new Error(
          'Recibos confirmados são preservados. Cancele e crie um substituto para corrigir.'
        )
      if (patch.status === 'recebido' || patch.status === 'cancelado')
        throw new Error('Use confirmar recebimento ou cancelar.')
      return gravar({
        ...atual,
        ...patch,
        id,
        numero: atual.numero,
        atualizadoEm: new Date().toISOString()
      })
    }),
  confirmar: (id: string): Recibo =>
    tx(() => {
      const r = recibosRepo.get(id)
      if (!r) throw new Error('Recibo não encontrado.')
      exigirResponsavel('recibo', id)
      if (r.status === 'recebido') return r
      if (r.status === 'cancelado') throw new Error('Este recibo foi cancelado.')
      const novo = { ...r, status: 'recebido' as const, atualizadoEm: new Date().toISOString() }
      validar(novo)
      if (r.origemTipo === 'relatorio' && r.origemId) {
        exigirResponsavel('relatorio', r.origemId)
        const rel = relatoriosRepo.get(r.origemId)
        if (!rel) throw new Error('Relatório não encontrado.')
        const saldoDepois = r.adiantamentoId ? rel.totais.saldo : round2(rel.totais.saldo - r.valor)
        if (r.quitacao === 'total' && saldoDepois !== 0)
          throw new Error(
            'A quitação total exige que o saldo do relatório seja zero. Escolha quitação parcial ou corrija o valor.'
          )
        let adiantamentoId = r.adiantamentoId
        if (adiantamentoId) {
          const existente = rel.adiantamentos.find((a) => a.id === adiantamentoId)
          if (!existente || round2(existente.valor) !== round2(r.valor))
            throw new Error('O valor deve corresponder ao adiantamento selecionado.')
        } else {
          if (r.valor > rel.totais.saldo)
            throw new Error('O recebimento excede o saldo do relatório.')
          adiantamentoId = `recebimento:${id}`
          rel.adiantamentos.push({
            id: adiantamentoId,
            descricao: `Recebimento — recibo ${r.numero}`,
            valor: r.valor
          })
          relatoriosRepo.update(rel.id, {
            adiantamentos: rel.adiantamentos,
            status: round2(rel.totais.saldo - r.valor) === 0 ? 'pago' : rel.status,
            versao: rel.versao
          })
        }
        if (
          get(
            'SELECT 1 FROM recebimentos WHERE relatorio_id=? AND adiantamento_id=? AND estornado=0',
            [rel.id, adiantamentoId]
          )
        )
          throw new Error('Este adiantamento já possui recibo de recebimento.')
        run('INSERT INTO recebimentos VALUES (?,?,?,?,?,0)', [
          randomUUID(),
          id,
          rel.id,
          adiantamentoId,
          r.valor
        ])
        novo.adiantamentoId = adiantamentoId
      } else
        run('INSERT INTO recebimentos VALUES (?,?,?,?,?,0)', [
          randomUUID(),
          id,
          null,
          null,
          r.valor
        ])
      return gravar(novo)
    }),
  cancelar: (id: string): Recibo =>
    tx(() => {
      const r = recibosRepo.get(id)
      if (!r) throw new Error('Recibo não encontrado.')
      exigirResponsavel('recibo', id)
      if (r.status === 'cancelado') return r
      const p = get('SELECT * FROM recebimentos WHERE recibo_id=? AND estornado=0', [id])
      run('UPDATE recebimentos SET estornado=1 WHERE recibo_id=?', [id])
      if (p?.relatorio_id && texto(p.adiantamento_id) === `recebimento:${id}`) {
        exigirResponsavel('relatorio', texto(p.relatorio_id))
        const rel = relatoriosRepo.get(texto(p.relatorio_id))
        if (rel)
          relatoriosRepo.update(rel.id, {
            adiantamentos: rel.adiantamentos.filter((a) => a.id !== p.adiantamento_id),
            status: rel.status === 'pago' ? 'emitido' : rel.status,
            versao: rel.versao
          })
      }
      return gravar({ ...r, status: 'cancelado', atualizadoEm: new Date().toISOString() })
    })
}
envolverDocumento(recibosRepo, 'recibo')
