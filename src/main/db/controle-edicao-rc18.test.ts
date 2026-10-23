import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const contexto = vi.hoisted(() => ({
  pasta: '',
  sessao: 1,
  status: { usuarioId: 'usuario-teste', pendentes: 0, conflitos: [] as unknown[] },
  pedido: vi.fn(),
  sincronizar: vi.fn(),
  parar: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => contexto.pasta } }))
vi.mock('../nuvem', () => ({
  identidadeSessaoNuvem: () => contexto.sessao,
  protocoloNuvem: () => 4,
  statusNuvem: () => contexto.status,
  pedidoNuvem: contexto.pedido,
  sincronizarNuvem: contexto.sincronizar
}))
vi.mock('../tempo-real', () => ({ pararTempoReal: contexto.parar }))
let sql: typeof import('./sqlite')
let encerrar: typeof import('../colaboracao').encerrarEdicoesConta
let computador: string
let controlar: typeof import('../colaboracao').controlarEdicao
beforeAll(async () => {
  contexto.pasta = mkdtempSync(join(tmpdir(), 'gdo-logout-rc17-'))
  sql = await import('./sqlite')
  sql.abrirBanco()
  encerrar = (await import('../colaboracao')).encerrarEdicoesConta
  controlar = (await import('../colaboracao')).controlarEdicao
  computador = (await import('../versoes')).computadorId()
})
beforeEach(() => {
  sql.run('DELETE FROM edicoes_documento')
  contexto.sessao++
  contexto.status.pendentes = 0
  contexto.sincronizar.mockResolvedValue(contexto.status)
  contexto.pedido.mockReset()
  contexto.sincronizar.mockClear()
  contexto.parar.mockClear()
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(contexto.pasta, { recursive: true, force: true })
})
function controle(id: string, offline = false, vencido = false, pc = computador): void {
  sql.run('INSERT INTO edicoes_documento VALUES(?,?,?,?,?,?,?,?)', [
    'orcamento',
    id,
    contexto.status.usuarioId,
    pc,
    7,
    new Date(Date.now() + (vencido ? -60000 : 60000)).toISOString(),
    offline ? 1 : 0,
    1
  ])
}

const resposta = (geracao: number) => ({
  tipo: 'orcamento',
  documentoId: 'doc',
  usuarioId: 'usuario-teste',
  usuarioNome: 'Teste',
  computador,
  geracao,
  expiraEm: null,
  offline: false,
  revisao: 1,
  podeEditar: true,
  solicitacoes: []
})
it('descarta resposta em voo e operação enfileirada após troca de sessão', async () => {
  let resolver!: (valor: unknown) => void
  contexto.pedido.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolver = r
      })
  )
  const antigo = controlar('orcamento', 'doc')
  const pendente = controlar('orcamento', 'doc', 'solicitar')
  const erroAntigo = expect(antigo).rejects.toThrow('sessão mudou')
  const erroPendente = expect(pendente).rejects.toThrow('sessão mudou')
  await vi.waitFor(() => expect(contexto.pedido).toHaveBeenCalledOnce())
  contexto.sessao++
  resolver(resposta(1))
  await Promise.all([erroAntigo, erroPendente])
  expect(sql.get('SELECT * FROM edicoes_documento WHERE documento_id=?', ['doc'])).toBeNull()
  expect(contexto.pedido).toHaveBeenCalledOnce()
})
it('rejeita geração antiga sem sobrescrever o SQLite', async () => {
  controle('doc')
  contexto.pedido.mockResolvedValue(resposta(6))
  await expect(controlar('orcamento', 'doc')).rejects.toThrow('controle mudou')
  expect(
    sql.get('SELECT geracao FROM edicoes_documento WHERE documento_id=?', ['doc'])?.geracao
  ).toBe(7)
})
it('lê a geração atual depois da operação anterior e preserva ordem da transferência', async () => {
  contexto.pedido
    .mockResolvedValueOnce(resposta(1))
    .mockResolvedValueOnce(resposta(2))
    .mockResolvedValueOnce(resposta(2))
  const resultados = await Promise.all([
    controlar('orcamento', 'doc'),
    controlar('orcamento', 'doc', 'transferir', 'outro-pc'),
    controlar('orcamento', 'doc')
  ])
  expect(resultados.map((c) => c?.geracao)).toEqual([1, 2, 2])
  expect(contexto.pedido.mock.calls[1][1].p_geracao).toBe(1)
  expect(contexto.pedido.mock.calls[2][1].p_geracao).toBe(2)
})

it('logout invalida controles em voo sem esperar pela consulta lenta', async () => {
  let resolver!: (valor: unknown) => void
  contexto.pedido.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolver = r
      })
  )
  const antigo = controlar('orcamento', 'doc')
  const falha = expect(antigo).rejects.toThrow('sessão mudou')
  await vi.waitFor(() => expect(contexto.pedido).toHaveBeenCalledOnce())
  await encerrar()
  resolver(resposta(1))
  await falha
  expect(sql.get('SELECT * FROM edicoes_documento WHERE documento_id=?', ['doc'])).toBeNull()
})

it('recepção global consulta somente o responsável atual, incluindo preparação offline', async () => {
  controle('online')
  controle('offline', true)
  controle('vencido', false, true)
  controle('outro', false, false, 'outro-pc')
  const { documentosAcompanhados } = await import('../colaboracao')
  expect(documentosAcompanhados(true).map((d) => d.id)).toEqual(['offline', 'online'])
})

it('a renovação descarta controles de documentos excluídos e renova só os existentes', async () => {
  controle('presente')
  controle('ausente')
  controle('de-outro-pc', false, false, 'outro-pc')
  sql.run(
    `INSERT INTO orcamentos (id, numero, data, destinatario, formato, titulo, valor_total, status, criado_em, atualizado_em)
     VALUES ('presente', 1, '2026-01-01', 'A Teste,', 'carta', 'T', 0, 'rascunho', '2026-01-01', '2026-01-01')`
  )
  contexto.pedido.mockResolvedValue(resposta(7))
  const { renovarEdicoes } = await import('../colaboracao')
  await renovarEdicoes()
  const renovados = contexto.pedido.mock.calls.map((c) => c[1].p_id)
  expect(renovados).toEqual(['presente'])
  const restantes = sql
    .all('SELECT documento_id FROM edicoes_documento ORDER BY documento_id')
    .map((l) => l.documento_id)
  // O controle de outro computador não é nosso para descartar.
  expect(restantes).toEqual(['de-outro-pc', 'presente'])
  sql.run("DELETE FROM orcamentos WHERE id='presente'")
})
