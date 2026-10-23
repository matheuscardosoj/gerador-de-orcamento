import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { mensagemErro } from '../../shared/erros'

const PERFIL = 'b'.repeat(64)
const contexto = vi.hoisted(() => ({ pasta: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => contexto.pasta, getVersion: () => '9.9.9' }
}))
vi.mock('../ia', () => ({ encerrarIA: vi.fn() }))
vi.mock('../colaboracao', () => ({ encerrarEdicoesConta: async () => {} }))
vi.mock('./perfis', () => ({
  perfilAtual: () => ({
    id: 'b'.repeat(64),
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
  inicializarNuvem: vi.fn(),
  statusNuvem: () => ({ erro: null })
}))
let sql: typeof import('../db/sqlite')
const resourcesAnterior = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
beforeAll(async () => {
  contexto.pasta = mkdtempSync(join(tmpdir(), 'gdo-perfil-danificado-'))
  Object.defineProperty(process, 'resourcesPath', { value: contexto.pasta, configurable: true })
  sql = await import('../db/sqlite')
  sql.abrirBanco()
})
afterAll(() => {
  sql.fecharBanco()
  sql.selecionarPerfilDados(null)
  if (resourcesAnterior) Object.defineProperty(process, 'resourcesPath', resourcesAnterior)
  else Reflect.deleteProperty(process, 'resourcesPath')
  rmSync(contexto.pasta, { recursive: true, force: true })
})

it('banco do perfil salvo ilegível: mostra o código da causa e não deixa o perfil preso', async () => {
  const dados = join(contexto.pasta, 'perfis', PERFIL, 'data')
  mkdirSync(dados, { recursive: true })
  writeFileSync(join(dados, 'banco.db'), 'isto não é um banco SQLite '.repeat(200))
  sql.fecharBanco()

  const contas = await import('./servico')
  const erro = await contas.inicializarContas().then(
    () => null,
    (e: unknown) => e
  )
  expect(erro).toBeInstanceOf(Error)
  // A mensagem chega à tela com o código, sem virar o texto genérico nem expor caminhos.
  const mensagem = mensagemErro(erro)
  expect(mensagem).toMatch(/código [0-9A-F]{6}/)
  expect(mensagem).not.toMatch(/[A-Z]:\\|perfis/)
  // O perfil quebrado não pode continuar selecionado: o banco padrão volta a abrir
  // e a lista de empresas continua utilizável.
  expect(sql.caminhoBanco()).not.toContain(PERFIL)
  expect(() => sql.get('SELECT 1 AS ok')).not.toThrow()
})
