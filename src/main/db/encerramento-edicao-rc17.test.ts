import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const contexto = vi.hoisted(() => ({
  pasta: '',
  status: { usuarioId: 'usuario-teste', pendentes: 0, conflitos: [] as unknown[] },
  pedido: vi.fn(),
  sincronizar: vi.fn(),
  parar: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => contexto.pasta } }))
vi.mock('../nuvem', () => ({
  protocoloNuvem: () => 4,
  statusNuvem: () => contexto.status,
  pedidoNuvem: contexto.pedido,
  sincronizarNuvem: contexto.sincronizar
}))
vi.mock('../tempo-real', () => ({ pararTempoReal: contexto.parar }))
let sql: typeof import('./sqlite')
let encerrar: typeof import('../colaboracao').encerrarEdicoesConta
let computador: string
beforeAll(async () => {
  contexto.pasta = mkdtempSync(join(tmpdir(), 'gdo-logout-rc17-'))
  sql = await import('./sqlite')
  sql.abrirBanco()
  encerrar = (await import('../colaboracao')).encerrarEdicoesConta
  computador = (await import('../versoes')).computadorId()
})
beforeEach(() => {
  sql.run('DELETE FROM edicoes_documento')
  contexto.status.pendentes = 0
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
it('libera controles limpos em paralelo sem repetir sincronizações nem tocar em offline ou outro PC', async () => {
  controle('ativo-a')
  controle('ativo-b')
  controle('vencido', false, true)
  controle('offline', true)
  controle('outro-pc', false, false, 'outro-computador')
  const concluir: Array<() => void> = []
  contexto.pedido.mockImplementation(() => new Promise<void>((resolve) => concluir.push(resolve)))
  const encerramento = encerrar()
  expect(contexto.pedido).toHaveBeenCalledTimes(2)
  expect(contexto.parar).toHaveBeenCalledOnce()
  expect(contexto.sincronizar).not.toHaveBeenCalled()
  for (const chamada of contexto.pedido.mock.calls) {
    expect(chamada[1]).toMatchObject({ p_acao: 'liberar', p_geracao: 7 })
    expect(chamada[4]).toBe(2000)
  }
  concluir.forEach((resolver) => resolver())
  await encerramento
  expect(
    sql
      .all('SELECT documento_id FROM edicoes_documento')
      .map((r) => r.documento_id)
      .sort()
  ).toEqual(['offline', 'outro-pc', 'vencido'])
})
it('preserva o controle quando há alterações pendentes e não inicia envio ao sair', async () => {
  controle('pendente')
  contexto.status.pendentes = 1
  await encerrar()
  expect(contexto.pedido).not.toHaveBeenCalled()
  expect(contexto.sincronizar).not.toHaveBeenCalled()
  expect(sql.all('SELECT * FROM edicoes_documento')).toHaveLength(1)
})
it('permite encerrar sem rede e mantém o controle local até expirar', async () => {
  controle('sem-rede')
  contexto.pedido.mockRejectedValue(new Error('Sem conexão'))
  await expect(encerrar()).resolves.toBeUndefined()
  expect(sql.all('SELECT * FROM edicoes_documento')).toHaveLength(1)
})
