import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ambiente = vi.hoisted(() => ({ pasta: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => ambiente.pasta },
  dialog: {},
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))
vi.mock('../tempo-real', () => ({
  pararTempoReal: vi.fn(),
  iniciarTempoReal: vi.fn(),
  avisarEstadoTempoReal: vi.fn(),
  aguardarTempoReal: async () => {}
}))
let nuvem: typeof import('../nuvem')
let sql: typeof import('./sqlite')
beforeAll(async () => {
  ambiente.pasta = mkdtempSync(join(tmpdir(), 'gdo-sessao-'))
  sql = await import('./sqlite')
  sql.abrirBanco()
  nuvem = await import('../nuvem')
})
beforeEach(() => {
  nuvem.configurarSessaoConta(false, 'empresa-a', true)
  nuvem.adotarSessaoConta(
    { url: 'https://teste.supabase.co', chavePublica: 'sb_publishable_teste', email: '' },
    {
      access_token: 'token-descartavel',
      refresh_token: 'refresh-descartavel',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'usuario-teste' }
    }
  )
})
afterAll(async () => {
  await nuvem.suspenderNuvemConta()
  sql.fecharBanco()
  rmSync(ambiente.pasta, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

it('descarta resposta de uma empresa após troca da sessão', async () => {
  let responder!: (resposta: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        })
    )
  )
  const pedido = nuvem.pedidoNuvem('/rest/v1/teste')
  nuvem.configurarSessaoConta(false, 'empresa-b', true)
  responder(new Response(JSON.stringify({ empresa: 'empresa-a' })))
  await expect(pedido).rejects.toThrow('resposta anterior foi descartada')
})
it('o prazo de encerramento também limita a espera por uma renovação já em andamento', async () => {
  nuvem.adotarSessaoConta(
    { url: 'https://teste.supabase.co', chavePublica: 'sb_publishable_teste', email: '' },
    {
      access_token: 'token-vencido',
      refresh_token: 'refresh-teste',
      expires_at: 1,
      user: { id: 'usuario-teste' }
    }
  )
  const fetch = vi.fn(
    (_url: string, opcoes: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        opcoes.signal!.addEventListener('abort', () => reject(opcoes.signal!.reason), {
          once: true
        })
      })
  )
  vi.stubGlobal('fetch', fetch)
  const existente = nuvem.pedidoNuvem('/rest/v1/teste').catch((erro) => erro)
  await expect(
    nuvem.pedidoNuvem('/rest/v1/teste', undefined, false, undefined, 25)
  ).rejects.toMatchObject({ name: 'TimeoutError' })
  expect(fetch).toHaveBeenCalledTimes(1)
  await nuvem.suspenderNuvemConta()
  expect(await existente).toBeInstanceOf(Error)
})
it('encerra uma única vez e bloqueia novos pedidos após exclusão confirmada', async () => {
  const observador = vi.fn()
  nuvem.observarAcessoNuvem(observador)
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ code: 'GDE01', message: 'Empresa excluída' }), { status: 400 })
  )
  vi.stubGlobal('fetch', fetch)
  await expect(nuvem.pedidoNuvem('/rest/v1/rpc/gdo_contexto_v4', {})).rejects.toMatchObject({
    codigo: 'GDE01'
  })
  await expect(nuvem.pedidoNuvem('/rest/v1/teste')).rejects.toThrow(
    'acesso a esta empresa foi encerrado'
  )
  expect(observador).toHaveBeenCalledExactlyOnceWith(null, 'empresaExcluida')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('falhas de rede e HTTP genérico não removem nem encerram o perfil', async () => {
  const observador = vi.fn()
  nuvem.observarAcessoNuvem(observador)
  sql.run("INSERT OR REPLACE INTO configuracoes VALUES('testePreservado','true')")
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new Error('Sem internet'))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}'))
  )
  await expect(nuvem.pedidoNuvem('/rest/v1/teste')).rejects.toThrow('Sem internet')
  await expect(nuvem.pedidoNuvem('/rest/v1/teste')).rejects.toThrow('500')
  await expect(nuvem.pedidoNuvem('/rest/v1/teste')).resolves.toEqual({})
  expect(observador).not.toHaveBeenCalled()
  expect(sql.get("SELECT valor FROM configuracoes WHERE chave='testePreservado'")?.valor).toBe(
    'true'
  )
})

it('cancela requisições concorrentes quando o servidor confirma a exclusão', async () => {
  const observador = vi.fn()
  nuvem.observarAcessoNuvem(observador)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opcoes: RequestInit) => {
      if (url.endsWith('/lento'))
        return new Promise<Response>((_resolve, reject) => {
          opcoes.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelado', 'AbortError')),
            { once: true }
          )
        })
      return new Response(JSON.stringify({ code: 'GDE01', message: 'Empresa excluída' }), {
        status: 400
      })
    })
  )
  const lento = nuvem.pedidoNuvem('/lento')
  const cancelado = expect(lento).rejects.toMatchObject({ name: 'AbortError' })
  await expect(nuvem.pedidoNuvem('/confirmar')).rejects.toMatchObject({ codigo: 'GDE01' })
  await cancelado
  expect(observador).toHaveBeenCalledTimes(1)
})
