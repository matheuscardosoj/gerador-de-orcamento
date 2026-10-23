import { afterEach, describe, expect, it, vi } from 'vitest'
import { comPrazo } from './prazo'

afterEach(() => vi.useRealTimers())

describe('comPrazo', () => {
  it('devolve o resultado quando termina a tempo', async () => {
    await expect(comPrazo(Promise.resolve(42), 1000)).resolves.toBe(42)
  })

  it('propaga o erro da própria operação', async () => {
    await expect(comPrazo(Promise.reject(new Error('falhou')), 1000)).rejects.toThrow('falhou')
  })

  it('rejeita com a mensagem quando estoura o prazo', async () => {
    vi.useFakeTimers()
    const pendente = comPrazo(new Promise<void>(() => undefined), 500, 'demorou')
    const resultado = expect(pendente).rejects.toThrow('demorou')
    await vi.advanceTimersByTimeAsync(501)
    await resultado
  })

  it('não deixa temporizador pendente depois de terminar', async () => {
    vi.useFakeTimers()
    await comPrazo(Promise.resolve(1), 10_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
