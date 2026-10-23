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
  const falha = ia.revisarTexto(entrada)
  await expect(falha).rejects.toThrow('O serviço de IA não conseguiu atender à solicitação')
  await expect(falha).rejects.toMatchObject({ cause: { message: 'Ollama respondeu 503.' } })
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

/** Simula o Ollama devolvendo, em ordem, as respostas dadas (a última se repete). */
function ollamaResponde(...respostas: string[]): ReturnType<typeof vi.fn> {
  let i = 0
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ message: { content: respostas[Math.min(i++, respostas.length - 1)] } })
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const temperaturas = (fetch: ReturnType<typeof vi.fn>): number[] =>
  fetch.mock.calls.map(
    (c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).options.temperature
  )

it('remove o rótulo que o modelo cola na resposta e corrige o texto', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  ollamaResponde('Descr. Recibo: servico de rocada terreno')
  expect(
    await ia.revisarTexto({
      id: 'r1',
      campo: 'descricaoRecibo',
      texto: 'ref. servico de rocada terreno'
    })
  ).toBe('Serviço de roçada terreno.')
})

it('não deixa o modelo trocar a contratante pela empresa', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  ollamaResponde('materiais por conta da empresa')
  expect(
    await ia.revisarTexto({
      id: 'r2',
      campo: 'observacao',
      texto: 'materiais por conta da contratante'
    })
  ).toBe('Materiais por conta da contratante.')
})

it('com o texto já correto e uma troca de papéis, pede nova tentativa em vez de aplicar', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  ollamaResponde('Materiais por conta da empresa.')
  await expect(
    ia.revisarTexto({
      id: 'r3',
      campo: 'observacao',
      texto: 'Materiais por conta da contratante.'
    })
  ).rejects.toThrow('trocou quem é a contratante')
})

it('se o modelo devolve o mesmo texto, tenta de novo com mais variação e usa a melhor resposta', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  const original = 'Conforme conversamos, segue o orçamento para o serviço de cerca.'
  const fetch = ollamaResponde(
    original,
    'Conforme conversado, segue o orçamento para o serviço de cerca.'
  )
  expect(await ia.revisarTexto({ id: 'r4', campo: 'introducao', texto: original })).toBe(
    'Conforme conversado, segue o orçamento para o serviço de cerca.'
  )
  expect(temperaturas(fetch)).toEqual([0.2, 0.7])
})

it('texto correto e resposta igual nas duas tentativas devolve o original, sem erro', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  const original = 'Pagamento à vista, via Pix.'
  const fetch = ollamaResponde(original)
  expect(await ia.revisarTexto({ id: 'r5', campo: 'pagamento', texto: original })).toBe(original)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('quando a primeira resposta já melhora o texto, não faz segunda chamada', async () => {
  repos.configIARepo.save({ modo: 'ollama', urlOllama: 'http://127.0.0.1:11434' })
  const fetch = ollamaResponde('Poda de 3 árvores de grande porte, com remoção dos resíduos.')
  expect(
    await ia.revisarTexto({
      id: 'r6',
      campo: 'descricaoServico',
      texto: 'poda de 3 arvores de grande porte'
    })
  ).toBe('Poda de 3 árvores de grande porte, com remoção dos resíduos.')
  expect(fetch).toHaveBeenCalledTimes(1)
})
