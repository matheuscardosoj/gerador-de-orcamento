import { randomUUID } from 'crypto'
import { all, get, run, texto, tx } from './db/sqlite'
import { envolverDocumento, exigirResponsavel, nuvemConfigurada } from './versoes'
import { numeroNuvem, numeracaoNuvem } from './numeros'
import { relatoriosRepo } from './repositories'
import { round2 } from '@shared/format'
import { errosConfirmacaoRecibo } from '@shared/validacao-recibo'
import type { Recibo } from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'

const NUMERO_MAXIMO = 999999
function numeroLivre(de: number): number {
  let n = Math.max(1, de)
  while (
    n <= NUMERO_MAXIMO &&
    (get('SELECT 1 FROM recibos WHERE numero=?', [n]) ||
      get("SELECT 1 FROM numeros_usados WHERE tipo='recibo' AND numero=?", [n]))
  )
    n++
  return n
}
function sequenciaRecibo(): number {
  const config = get("SELECT valor FROM configuracoes WHERE chave='seqRecibo'")
  if (config) return Number(config.valor)
  return Number(get("SELECT MAX(numero) AS n FROM numeros_usados WHERE tipo='recibo'")?.n ?? 0)
}
function gravarSequencia(n: number): void {
  run(
    "INSERT INTO configuracoes VALUES ('seqRecibo',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
    [JSON.stringify(n)]
  )
}

function validar(r: Recibo): void {
  if (!['parcial', 'total'].includes(r.quitacao)) throw new Error('Tipo de quitação inválido.')
  if (!Number.isFinite(r.valor) || r.valor < 0) throw new Error('Valor inválido.')
  if (!['rascunho', 'pendente', 'recebido', 'cancelado'].includes(r.status))
    throw new Error('Estado de recibo inválido.')
  if (r.status === 'rascunho' || r.status === 'cancelado') return
  const erros = Object.values(errosConfirmacaoRecibo(r))
  if (erros.length) throw new Error(erros.join(' '))
}
function gravar(r: Recibo): Recibo {
  r.valor = round2(r.valor)
  validar(r)
  run('INSERT INTO recibos VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET dados=excluded.dados', [
    r.id,
    r.numero,
    JSON.stringify(r)
  ])
  return r
}
export const recibosRepo = {
  numeracao: (): InfoNumeracao => {
    const agregado = get('SELECT MAX(numero) AS maior, COUNT(*) AS total FROM recibos')
    return numeracaoNuvem('recibo', {
      proximoNumero: numeroLivre(sequenciaRecibo() + 1),
      maiorEmUso: Math.max(0, Number(agregado?.maior ?? 0)),
      menorLivre: numeroLivre(1),
      totalDocumentos: Number(agregado?.total ?? 0)
    })
  },
  definirProximoNumero: (n: number): ResultadoNumeracao => {
    if (nuvemConfigurada())
      return {
        ok: false,
        erro: 'Na nuvem, a numeração usa faixas exclusivas reservadas para cada computador.'
      }
    if (!Number.isInteger(n) || n < 1 || n > NUMERO_MAXIMO)
      return { ok: false, erro: `O número deve ser um inteiro entre 1 e ${NUMERO_MAXIMO}.` }
    if (
      get('SELECT 1 FROM recibos WHERE numero=?', [n]) ||
      get("SELECT 1 FROM numeros_usados WHERE tipo='recibo' AND numero=?", [n])
    )
      return {
        ok: false,
        erro: 'Este número já foi utilizado e não pode ser reutilizado.',
        proximoLivre: numeroLivre(n + 1)
      }
    gravarSequencia(n - 1)
    return { ok: true }
  },
  list: (): Recibo[] => {
    const metas = new Map(
      all("SELECT documento_id,dados FROM documento_meta WHERE tipo='recibo'").map((l) => [
        texto(l.documento_id),
        JSON.parse(texto(l.dados))
      ])
    )
    return all('SELECT id,dados FROM recibos ORDER BY numero DESC').map((l) => ({
      ...JSON.parse(texto(l.dados)),
      ...metas.get(texto(l.id))
    }))
  },
  get: (id: string): Recibo | null => {
    const l = get('SELECT dados FROM recibos WHERE id=?', [id])
    return l ? JSON.parse(texto(l.dados)) : null
  },
  create: (dto: Omit<Recibo, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'>): Recibo =>
    tx(() => {
      if (dto.status === 'recebido' || dto.status === 'cancelado')
        throw new Error('Crie um rascunho ou cobrança antes de confirmar o pagamento.')
      const numero = numeroNuvem('recibo', () => numeroLivre(sequenciaRecibo() + 1), true)
      if (numero > NUMERO_MAXIMO)
        throw new Error('A numeração dos recibos atingiu o limite de 999999.')
      const agora = new Date().toISOString()
      const recibo = gravar({
        ...dto,
        id: randomUUID(),
        numero,
        criadoEm: agora,
        atualizadoEm: agora
      })
      if (!nuvemConfigurada()) gravarSequencia(Math.max(numero, sequenciaRecibo()))
      return recibo
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
      if (r.numero <= 0) {
        const numero = numeroNuvem('recibo', () => 0, true)
        if (numero <= 0)
          throw new Error(
            'Sincronize para reservar um número antes de confirmar o recibo. A cobrança continua salva.'
          )
        r.numero = numero
        run('UPDATE recibos SET numero=?,dados=? WHERE id=?', [numero, JSON.stringify(r), id])
      }
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
  remove: (id: string, estornar = false): void =>
    tx(() => {
      const r = recibosRepo.get(id)
      if (!r) return
      if (r.status === 'recebido') {
        if (!estornar)
          throw new Error(
            'Este recibo confirma um pagamento. Confirme excluir e estornar para continuar.'
          )
        recibosRepo.cancelar(id)
      }
      if (get('SELECT 1 FROM recebimentos WHERE recibo_id=? AND estornado=0', [id]))
        throw new Error('O pagamento precisa estar estornado antes de excluir o recibo.')
      // Mantém números utilizados, snapshots de versões e lançamentos financeiros.
      run('DELETE FROM recibos WHERE id=?', [id])
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
