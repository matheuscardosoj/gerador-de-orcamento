import { it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
const raiz = mkdtempSync(join(tmpdir(), 'gdo-ia-revisao-'))
vi.mock('electron', () => ({
  app: { getPath: () => raiz, getAppPath: () => raiz, isPackaged: false }
}))
let ia: typeof import('../ia'), repos: typeof import('../repositories')
beforeAll(async () => {
  repos = await import('../repositories')
  ia = await import('../ia')
})
afterEach(() => {
  ia.encerrarIA()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  ;(await import('./sqlite')).fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})
const entrada = {
  id: 'revisao',
  campo: 'descricaoServico' as const,
  texto: 'Cortar 3 árvores por R$ 1.600,00.'
}
it('IA desativada não inicia chamada', async () => {
  repos.configIARepo.save({ modo: 'desligada' })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(ia.revisarTexto(entrada)).rejects.toThrow('desativada')
  expect(fetch).not.toHaveBeenCalled()
})
it('aceita revisão fiel e recusa resposta que altera valor', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ message: { content: 'Corte de 3 árvores por R$ 1.600,00.' } })
    }))
  )
  expect(await ia.revisarTexto(entrada)).toBe('Corte de 3 árvores por R$ 1.600,00.')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ message: { content: 'Corte de 4 árvores por R$ 1.600,00.' } })
    }))
  )
  await expect(ia.revisarTexto(entrada)).rejects.toThrow('recusada')
})
it('cancela geração e libera a próxima revisão', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, opcoes) =>
        new Promise((_resolve, reject) =>
          opcoes.signal.addEventListener('abort', () => reject(opcoes.signal.reason), {
            once: true
          })
        )
    )
  )
  const pendente = ia.revisarTexto(entrada)
  await expect(ia.revisarTexto({ ...entrada, id: 'outra' })).rejects.toThrow('andamento')
  ia.cancelarRevisao(entrada.id)
  await expect(pendente).rejects.toThrow('cancelada')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503 }))
  )
  await expect(ia.revisarTexto(entrada)).rejects.toThrow('503')
})
it('encerra geração após 120 segundos', async () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, opcoes) =>
        new Promise((_resolve, reject) =>
          opcoes.signal.addEventListener('abort', () => reject(opcoes.signal.reason), {
            once: true
          })
        )
    )
  )
  const pendente = ia.revisarTexto(entrada)
  const verificar = expect(pendente).rejects.toThrow('120 segundos')
  await vi.advanceTimersByTimeAsync(120000)
  await verificar
})
