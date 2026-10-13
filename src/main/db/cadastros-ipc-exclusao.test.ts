import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type Handler = (evento: unknown, ...args: unknown[]) => Promise<unknown>
const estado = vi.hoisted(() => ({ perfil: '', handlers: new Map<string, Handler>() }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-cadastros-ipc-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, getAppPath: () => estado.perfil, isPackaged: false },
  ipcMain: { handle: (canal: string, handler: Handler) => estado.handlers.set(canal, handler) },
  dialog: {},
  nativeImage: {},
  clipboard: {}
}))
let sql: typeof import('./sqlite'),
  repos: typeof import('../repositories'),
  recibos: typeof import('../recibos')
beforeAll(async () => {
  sql = await import('./sqlite')
  repos = await import('../repositories')
  recibos = await import('../recibos')
  ;(await import('../ipc')).registrarIpc()
})
beforeEach(() => {
  estado.perfil = mkdtempSync(join(raiz, 'perfil-'))
  sql.abrirBanco()
  repos.semear()
})
afterEach(() => sql.fecharBanco())
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

function configurarFila(): void {
  sql.run('INSERT INTO configuracoes VALUES (?,?)', [
    'nuvem',
    JSON.stringify({
      url: 'https://teste.supabase.co',
      chavePublica: 'publica-teste',
      email: 'teste@example.com'
    })
  ])
}

it.each([
  ['clientes', 'clientes'],
  ['servicos', 'servicos'],
  ['observacoes', 'observacoes_padrao'],
  ['pagamentos', 'pagamentos_padrao']
] as const)(
  'a exclusão IPC de %s enfileira contrato mínimo e mantém a revisão base',
  async (dominio, tabela) => {
    const criar = {
      clientes: () =>
        repos.clientesRepo.create({ nome: 'Cliente sem vínculo', tratamento: '', ativo: true }),
      servicos: () =>
        repos.servicosRepo.create({
          nome: 'Serviço',
          descricaoPadrao: 'Descrição',
          unidade: 'un',
          precoReferencia: null
        }),
      observacoes: () =>
        repos.observacoesRepo.create({ texto: 'Observação', padrao: true, aplicacao: 'orcamento' }),
      pagamentos: () =>
        repos.pagamentosRepo.create({ texto: 'Pix', padrao: true, aplicacao: 'orcamento' })
    }
    const cadastro = criar[dominio]()
    configurarFila()
    const entidade = `${tabela}:${cadastro.id}`
    sql.run('INSERT INTO sincronizacao VALUES (?,?)', [entidade, 7])
    await estado.handlers.get(`${dominio}.remove`)!(null, cadastro.id)
    const operacoes = sql.all('SELECT * FROM fila_nuvem WHERE entidade=?', [entidade])
    expect(operacoes).toHaveLength(1)
    expect(operacoes[0].base).toBe(7)
    expect(operacoes[0].id).toMatch(/^[a-f0-9-]{36}$/)
    expect(JSON.parse(String(operacoes[0].payload))).toEqual({ tabela, id: cadastro.id })
    expect(sql.get(`SELECT 1 FROM ${tabela} WHERE id=?`, [cadastro.id])).toBeNull()
  }
)

it('bloqueia a exclusão IPC de cliente usado em recibo antes de publicar tombstone', async () => {
  const cliente = repos.clientesRepo.create({
    nome: 'Cliente do recibo',
    tratamento: '',
    ativo: true
  })
  const recibo = recibos.recibosRepo.create({
    clienteId: cliente.id,
    data: '2026-10-12',
    destinatario: cliente.nome,
    descricao: 'Serviço',
    valor: 100,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'rascunho',
    quitacao: 'parcial',
    observacao: ''
  })
  configurarFila()
  await expect(estado.handlers.get('clientes.remove')!(null, cliente.id)).rejects.toThrow(
    'Marque-o como inativo'
  )
  expect(repos.clientesRepo.get(cliente.id)).toEqual(cliente)
  expect(recibos.recibosRepo.get(recibo.id)).toEqual(recibo)
  expect(sql.all('SELECT * FROM fila_nuvem')).toEqual([])
})
