import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const contexto = vi.hoisted(() => ({ pasta: '', concluir: () => {}, inicializar: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => contexto.pasta } }))
vi.mock('../ia', () => ({ encerrarIA: vi.fn() }))
vi.mock('../colaboracao', () => ({ encerrarEdicoesConta: async () => {} }))
vi.mock('./perfis', () => ({
  perfilAtual: () => ({
    id: 'a'.repeat(64),
    usuario: 'usuario',
    email: 'teste@example.invalid',
    nome: 'Teste',
    empresa: { id: 'empresa', nome: 'Empresa', papel: 'administrador' },
    lembrar: true,
    central: true,
    operador: false,
    configuracao: {
      url: 'https://teste.supabase.co',
      chavePublica: 'sb_publishable_teste',
      email: ''
    }
  })
}))
vi.mock('../nuvem', () => ({
  observarAcessoNuvem: vi.fn(),
  configuracaoNuvem: () => ({}),
  configurarSessaoConta: vi.fn(),
  suspenderNuvemConta: async () => {},
  lerSessaoConta: () => ({ access_token: 'token-de-teste' }),
  inicializarNuvem: contexto.inicializar,
  statusNuvem: () => ({ erro: null })
}))
let sql: typeof import('../db/sqlite')
const resourcesAnterior = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
beforeAll(async () => {
  contexto.pasta = mkdtempSync(join(tmpdir(), 'gdo-inicio-rc17-'))
  Object.defineProperty(process, 'resourcesPath', { value: contexto.pasta, configurable: true })
  sql = await import('../db/sqlite')
  sql.abrirBanco()
  contexto.inicializar.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        contexto.concluir = resolve
      })
  )
})
afterAll(() => {
  sql.fecharBanco()
  if (resourcesAnterior) Object.defineProperty(process, 'resourcesPath', resourcesAnterior)
  else Reflect.deleteProperty(process, 'resourcesPath')
  rmSync(contexto.pasta, { recursive: true, force: true })
})
it('permite mostrar o carregamento sem expor os dados antes de concluir a recuperação da conta', async () => {
  const contas = await import('./servico')
  const inicializacao = contas.inicializarContas()
  expect(contas.inicializarContas()).toBe(inicializacao)
  await vi.waitFor(() => expect(contexto.inicializar).toHaveBeenCalledOnce())
  let publicado = false
  const leitura = contas.contaApi.status().then((estado) => {
    publicado = true
    return estado
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(publicado).toBe(false)
  contexto.concluir()
  await inicializacao
  expect(await leitura).toMatchObject({ fase: 'pronto', empresa: { id: 'empresa' } })
})
