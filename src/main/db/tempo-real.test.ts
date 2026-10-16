import { afterEach, expect, it, vi } from 'vitest'
import {
  AgendadorSincronizacao,
  iniciarTempoReal,
  pararTempoReal,
  aguardarTempoReal,
  solicitarRecuperacaoNuvem
} from '../tempo-real'

afterEach(() => {
  pararTempoReal()
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  await vi.advanceTimersByTimeAsync(2400)
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

it('continua recuperando depois de cinco falhas e confirma o serviço antes de sincronizar', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  let acessivel = false
  const renovar = vi.fn(async () => {
    if (!acessivel) throw new TypeError('fetch failed')
  })
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    renovar,
    sincronizar,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(160000)
  expect(renovar.mock.calls.length).toBeGreaterThan(5)
  expect(sincronizar).not.toHaveBeenCalled()
  acessivel = true
  solicitarRecuperacaoNuvem()
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})
it('respeita Retry-After mesmo com sinal de retorno da rede e vigilância periódica', async () => {
  vi.useFakeTimers()
  const renovar = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('limite'), { status: 429, repetirAposMs: 90000 })
    )
    .mockResolvedValue(undefined)
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    renovar,
    sincronizar,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(0)
  solicitarRecuperacaoNuvem()
  await vi.advanceTimersByTimeAsync(89999)
  expect(renovar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})
it('falha permanente não entra em repetição automática', async () => {
  vi.useFakeTimers()
  const renovar = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('acesso revogado'), { status: 403 }))
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    renovar,
    sincronizar: async () => null,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(6 * 60000)
  expect(renovar).toHaveBeenCalledTimes(1)
})

it('consulta imediatamente fora da fila lenta e consolida eventos simultâneos', async () => {
  vi.useFakeTimers()
  let liberar!: () => void
  let confirmar!: () => void
  const renovar = vi.fn(
    () =>
      new Promise<void>((r) => {
        liberar = r
      })
  )
  const verificar = vi.fn(
    () =>
      new Promise<void>((r) => {
        confirmar = r
      })
  )
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    sincronizar: async () => null,
    renovar,
    verificar,
    estado: () => {}
  })
  solicitarRecuperacaoNuvem('online')
  await vi.advanceTimersByTimeAsync(0)
  expect(verificar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1100)
  solicitarRecuperacaoNuvem('focus')
  expect(verificar).toHaveBeenCalledTimes(1)
  confirmar()
  await vi.advanceTimersByTimeAsync(0)
  pararTempoReal()
  liberar()
  await aguardarTempoReal()
})
it('verifica sem evento em até cinco segundos durante interrupção', async () => {
  vi.useFakeTimers()
  const verificar = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValue(undefined)
  const renovar = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValue(undefined)
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    sincronizar: async () => null,
    renovar,
    verificar,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(5000)
  expect(verificar).toHaveBeenCalledTimes(2)
})

it('consulta independente respeita Retry-After mesmo com eventos de rede', async () => {
  vi.useFakeTimers()
  const verificar = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('Servidor ocupado'), { status: 429, repetirAposMs: 90000 })
    )
    .mockResolvedValue(undefined)
  iniciarTempoReal({
    configuracao: () => ({ url: '', chavePublica: '', email: '' }),
    identidade: () => null,
    sincronizar: async () => null,
    renovar: async () => {},
    verificar,
    estado: () => {}
  })
  await vi.advanceTimersByTimeAsync(0)
  solicitarRecuperacaoNuvem('online')
  await vi.advanceTimersByTimeAsync(0)
  expect(verificar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  solicitarRecuperacaoNuvem('focus')
  expect(verificar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(80000)
  expect(verificar).toHaveBeenCalledTimes(2)
})
