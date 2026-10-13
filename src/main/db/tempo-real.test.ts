import { afterEach, expect, it, vi } from 'vitest'
import {
  AgendadorSincronizacao,
  iniciarTempoReal,
  pararTempoReal,
  aguardarTempoReal
} from '../tempo-real'

afterEach(() => {
  pararTempoReal()
  vi.useRealTimers()
})
it('aguarda a renovação antiga e não reconecta depois de encerrar a conta', async () => {
  vi.useFakeTimers()
  let liberar!: () => void
  const pendente = new Promise<void>((resolve) => {
    liberar = resolve
  })
  const renovar = vi.fn(() => pendente)
  const identidade = vi.fn(() => null)
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade,
    sincronizar: async () => null,
    renovar,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(30000)
  expect(renovar).toHaveBeenCalledTimes(1)
  pararTempoReal()
  let terminou = false
  const drenagem = aguardarTempoReal().then(() => {
    terminou = true
  })
  await Promise.resolve()
  expect(terminou).toBe(false)
  const consultas = identidade.mock.calls.length
  liberar()
  await drenagem
  await vi.advanceTimersByTimeAsync(60000)
  expect(identidade).toHaveBeenCalledTimes(consultas)
  expect(renovar).toHaveBeenCalledTimes(1)
})

it('recupera uma mudança que chega durante a consulta, sem consultas paralelas', async () => {
  let chamadas = 0,
    ativas = 0,
    maximo = 0
  let liberar: (() => void) | undefined
  const primeira = new Promise<void>((r) => {
    liberar = r
  })
  const fila = new AgendadorSincronizacao(async () => {
    chamadas++
    ativas++
    maximo = Math.max(maximo, ativas)
    if (chamadas === 1) await primeira
    ativas--
  })
  const executando = fila.solicitar()
  await fila.solicitar()
  await fila.solicitar()
  liberar!()
  await executando
  expect(chamadas).toBe(2)
  expect(maximo).toBe(1)
})
it('não inicia novas consultas depois de parar e libera a fila após falha', async () => {
  let chamadas = 0
  const fila = new AgendadorSincronizacao(async () => {
    if (++chamadas === 1) throw new Error('Sem conexão')
  })
  await expect(fila.solicitar()).rejects.toThrow('Sem conexão')
  await fila.solicitar()
  fila.parar()
  await fila.solicitar()
  expect(chamadas).toBe(2)
})

it('reenvia após falha transitória sem esperar cinco minutos e cancela ao encerrar', async () => {
  vi.useFakeTimers()
  const sincronizar = vi
    .fn()
    .mockResolvedValueOnce({ erro: 'Sem internet' })
    .mockResolvedValue({ erro: null })
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    sincronizar,
    renovar: async () => {},
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(sincronizar).toHaveBeenCalledTimes(2)
  pararTempoReal()
  await vi.advanceTimersByTimeAsync(5 * 60000)
  expect(sincronizar).toHaveBeenCalledTimes(2)
})

it('não repete tentativas automáticas de um conflito que precisa de decisão', async () => {
  vi.useFakeTimers()
  const sincronizar = vi
    .fn()
    .mockResolvedValue({ erro: 'Há alterações em conflito preservadas para conciliação.' })
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    sincronizar,
    renovar: async () => {},
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(10000)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})
