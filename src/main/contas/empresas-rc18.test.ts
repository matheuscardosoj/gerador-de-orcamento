import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const contexto = vi.hoisted(() => ({ pasta: '' }))
vi.mock('electron', () => ({ app: { getPath: () => contexto.pasta } }))
vi.mock('../ia', () => ({ encerrarIA: vi.fn() }))
vi.mock('../colaboracao', () => ({ encerrarEdicoesConta: async () => {} }))
vi.mock('../nuvem', () => ({
  observarAcessoNuvem: vi.fn(),
  configuracaoNuvem: () => ({}),
  statusNuvem: () => ({}),
  pedidoNuvem: vi.fn()
}))
let api: typeof import('./servico').contaApi
const empresas = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Primeira',
    papel: 'administrador',
    usuarioNome: 'Operador'
  }
]
const http = vi.fn()
const resourcesAnterior = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
beforeAll(async () => {
  contexto.pasta = mkdtempSync(join(tmpdir(), 'gdo-empresas-rc18-'))
  Object.defineProperty(process, 'resourcesPath', { value: contexto.pasta, configurable: true })
  vi.stubEnv('GERADOR_SERVICO_URL', 'https://teste.supabase.co')
  vi.stubEnv('GERADOR_SERVICO_CHAVE', 'sb_publishable_teste')
  vi.stubGlobal('fetch', http)
  http.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('/token?')
            ? { access_token: 'teste', user: { id: 'operador' } }
            : { operador: true, empresas }
        ),
        { status: 200 }
      )
  )
  api = (await import('./servico')).contaApi
  await api.entrar('operador@example.invalid', 'senha-de-teste', false)
})
afterAll(() => {
  if (resourcesAnterior) Object.defineProperty(process, 'resourcesPath', resourcesAnterior)
  else delete (process as unknown as Record<string, unknown>).resourcesPath
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(contexto.pasta, { recursive: true, force: true })
})
it('cria uma vez e retenta somente a leitura da lista quando atualizar falha', async () => {
  http.mockClear()
  await api.criarEmpresa('Nova', 'adm@example.invalid', 'Admin')
  expect(http.mock.calls.filter((c) => String(c[0]).includes('/functions/'))).toHaveLength(1)
  http.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: 'rede indisponível' }), { status: 503 })
  )
  await expect(api.atualizarEmpresas()).rejects.toThrow('rede indisponível')
  empresas.push({ ...empresas[0], id: '22222222-2222-4222-8222-222222222222', nome: 'Nova' })
  const atualizado = await api.atualizarEmpresas()
  expect(atualizado.fase).toBe('escolherEmpresa')
  expect(atualizado.empresas.map((e) => e.nome)).toEqual(['Primeira', 'Nova'])
  expect(http.mock.calls.filter((c) => String(c[0]).includes('/functions/'))).toHaveLength(1)
  expect(http.mock.calls.filter((c) => String(c[0]).includes('/gdo_contas'))).toHaveLength(2)
  expect((await api.status()).empresas).toEqual(atualizado.empresas)
})
