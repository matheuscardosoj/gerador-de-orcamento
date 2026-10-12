import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const estado = vi.hoisted(() => ({ perfil: '' }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-numeracao-recibos-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, isPackaged: false, getAppPath: () => estado.perfil },
  dialog: {}
}))
let sql: typeof import('./sqlite')
let repos: typeof import('../repositories')
let recibos: typeof import('../recibos')
let dados: typeof import('../dados')
beforeAll(async () => {
  sql = await import('./sqlite')
  repos = await import('../repositories')
  recibos = await import('../recibos')
  dados = await import('../dados')
})
beforeEach(() => {
  estado.perfil = mkdtempSync(join(raiz, 'perfil-'))
  sql.abrirBanco()
  repos.semear()
})
afterEach(() => sql.fecharBanco())
afterAll(() => rmSync(raiz, { recursive: true, force: true }))
const criar = () =>
  recibos.recibosRepo.create({
    data: '2026-10-12',
    destinatario: 'Cliente',
    descricao: 'Serviço',
    valor: 100,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'rascunho',
    quitacao: 'parcial',
    observacao: ''
  })

it('define e persiste o próximo número sem criar documento, pagamento ou versão', () => {
  expect(recibos.recibosRepo.definirProximoNumero(120)).toEqual({ ok: true })
  sql.fecharBanco()
  sql.abrirBanco()
  expect(recibos.recibosRepo.numeracao().proximoNumero).toBe(120)
  expect(sql.get('SELECT COUNT(*) AS n FROM recibos')?.n).toBe(0)
  expect(sql.get('SELECT COUNT(*) AS n FROM recebimentos')?.n).toBe(0)
  expect(sql.get('SELECT COUNT(*) AS n FROM versoes')?.n).toBe(0)
  expect(criar().numero).toBe(120)
  expect(criar().numero).toBe(121)
})

it('recusa números usados mesmo após exclusão e permite escolher um intervalo livre', () => {
  const r = criar()
  recibos.recibosRepo.remove(r.id)
  expect(recibos.recibosRepo.definirProximoNumero(r.numero).ok).toBe(false)
  expect(recibos.recibosRepo.numeracao().menorLivre).toBe(2)
  expect(recibos.recibosRepo.definirProximoNumero(10).ok).toBe(true)
  expect(criar().numero).toBe(10)
  expect(recibos.recibosRepo.definirProximoNumero(2).ok).toBe(true)
  expect(criar().numero).toBe(2)
})

it('mantém a sequência legada quando não existe configuração de recibos', () => {
  sql.run("INSERT INTO numeros_usados VALUES ('recibo',37)")
  expect(recibos.recibosRepo.numeracao().proximoNumero).toBe(38)
  expect(criar().numero).toBe(38)
})

it('recusa limites, frações e valores inválidos e não avança após falha no salvamento', () => {
  for (const n of [0, -1, 1.5, 1000000, NaN, Infinity]) {
    expect(recibos.recibosRepo.definirProximoNumero(n).ok).toBe(false)
  }
  expect(recibos.recibosRepo.definirProximoNumero(999999).ok).toBe(true)
  expect(criar().numero).toBe(999999)
  expect(() => criar()).toThrow('limite')
  expect(recibos.recibosRepo.list()).toHaveLength(1)
  expect(recibos.recibosRepo.definirProximoNumero(8).ok).toBe(true)
  expect(() => recibos.recibosRepo.create({ ...criar(), valor: -1 })).toThrow('Valor inválido')
  expect(recibos.recibosRepo.numeracao().proximoNumero).toBe(9)
})

it('mostra as reservas reais e bloqueia alterações manuais nos três tipos na nuvem', () => {
  sql.run("INSERT INTO configuracoes VALUES ('nuvem','{}')")
  for (const [tipo, repo] of [
    ['recibo', recibos.recibosRepo],
    ['orcamento', repos.orcamentosRepo],
    ['relatorio', repos.relatoriosRepo]
  ] as const) {
    sql.run('INSERT INTO reservas VALUES (?,?,0)', [tipo, 80])
    expect(repo.numeracao()).toMatchObject({ usaReservas: true, proximoNumero: 80, menorLivre: 80 })
    expect(repo.definirProximoNumero(100)).toMatchObject({
      ok: false,
      erro: expect.stringContaining('faixas exclusivas')
    })
  }
  expect(criar().numero).toBe(80)
  expect(recibos.recibosRepo.numeracao()).toMatchObject({ usaReservas: true, proximoNumero: 0 })
  expect(sql.get("SELECT valor FROM configuracoes WHERE chave='seqRecibo'")).toBeNull()
})

it('restaura o próximo número escolhido e preserva os números usados no backup', () => {
  const r = criar()
  recibos.recibosRepo.remove(r.id)
  recibos.recibosRepo.definirProximoNumero(50)
  const arquivo = join(raiz, 'numeracao.gdo-backup')
  dados.exportarDadosPara(arquivo)
  recibos.recibosRepo.definirProximoNumero(70)
  dados.importarDadosDe(arquivo, 'restaurar')
  expect(recibos.recibosRepo.numeracao().proximoNumero).toBe(50)
  expect(recibos.recibosRepo.definirProximoNumero(1).ok).toBe(false)
  expect(criar().numero).toBe(50)
})
