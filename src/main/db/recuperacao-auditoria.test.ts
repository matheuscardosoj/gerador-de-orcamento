import { afterEach, expect, it, vi } from 'vitest'
import type { StatusNuvem } from '@shared/types'
import { avisarDados } from '../eventos'
import { iniciarTempoReal, pararTempoReal, solicitarRecuperacaoNuvem } from '../tempo-real'

afterEach(() => {
  pararTempoReal()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const opcoes = {
  configuracao: () => ({ url: '', chavePublica: '', email: '' }),
  identidade: () => null,
  estado: () => {}
}
const evento = (): void => avisarDados({ origem: 'nuvem', entidades: [], status: true })
it('status repetido não adia indefinidamente o mesmo Retry-After', async () => {
  vi.useFakeTimers()
  const falha = { motivo: 'servico' as const, temporaria: true, repetirAposMs: 10000 }
  const estado = {
    conexao: 'inacessivel',
    falhaSincronizacao: falha,
    erro: 'Servidor ocupado'
  } as StatusNuvem
  const renovar = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('Servidor ocupado'), { status: 429, repetirAposMs: 10000 })
    )
    .mockResolvedValue(undefined)
  const verificar = vi.fn(async () => {})
  iniciarTempoReal({
    ...opcoes,
    renovar,
    verificar,
    status: () => estado,
    sincronizar: async () => ({ erro: null })
  })
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(1000)
    evento()
    await vi.advanceTimersByTimeAsync(0)
  }
  expect(verificar).toHaveBeenCalledTimes(1)
})
it('resposta válida paralela não ignora Retry-After de uma operação', async () => {
  vi.useFakeTimers()
  let estado = { conexao: 'inacessivel', erro: 'Servidor ocupado' } as StatusNuvem
  const renovar = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('Servidor ocupado'), { status: 429, repetirAposMs: 10000 })
    )
    .mockResolvedValue(undefined)
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({
    ...opcoes,
    renovar,
    verificar: async () => {},
    status: () => estado,
    sincronizar
  })
  await vi.advanceTimersByTimeAsync(1000)
  estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  evento()
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(9000)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})
it('status sem erro textual não desbloqueia uma falha permanente', async () => {
  vi.useFakeTimers()
  const estado = {
    conexao: 'acessivel',
    erro: null,
    falhaSincronizacao: { motivo: 'manutencao', temporaria: false }
  } as StatusNuvem
  const renovar = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('Manutenção'), { codigo: 'GDM01' }))
  iniciarTempoReal({ ...opcoes, renovar, status: () => estado, sincronizar: async () => null })
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 10; i++) {
    evento()
    await vi.advanceTimersByTimeAsync(0)
  }
  expect(renovar).toHaveBeenCalledTimes(1)
})
it('confirmação pelo probe e pelo evento agenda uma única recuperação', async () => {
  vi.useFakeTimers()
  let estado = { conexao: 'inacessivel', erro: 'Sem internet' } as StatusNuvem
  const renovar = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValue(undefined)
  const sincronizar = vi.fn(async () => ({ erro: null }))
  const verificar = vi.fn(async () => {
    estado = { conexao: 'acessivel', erro: null } as StatusNuvem
    evento()
  })
  iniciarTempoReal({ ...opcoes, renovar, verificar, status: () => estado, sincronizar })
  await vi.advanceTimersByTimeAsync(0)
  solicitarRecuperacaoNuvem('online')
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  expect(verificar).toHaveBeenCalledTimes(1)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})

it('fica estável por dez minutos e usa somente uma vigilância periódica', async () => {
  vi.useFakeTimers()
  const estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  const sincronizar = vi.fn(async () => {
    evento()
    return { erro: null }
  })
  const verificar = vi.fn(async () => {})
  iniciarTempoReal({
    ...opcoes,
    status: () => estado,
    renovar: async () => {
      evento()
    },
    verificar,
    sincronizar
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 600; i++) {
    evento()
    await vi.advanceTimersByTimeAsync(1000)
  }
  expect(sincronizar).toHaveBeenCalledTimes(21)
  expect(verificar).not.toHaveBeenCalled()
  pararTempoReal()
  const chamadas = sincronizar.mock.calls.length
  await vi.advanceTimersByTimeAsync(600000)
  expect(sincronizar).toHaveBeenCalledTimes(chamadas)
})
it('a consulta antiga não agenda nada na sessão seguinte', async () => {
  vi.useFakeTimers()
  let liberar!: () => void
  iniciarTempoReal({
    ...opcoes,
    renovar: async () => {},
    verificar: () =>
      new Promise<void>((r) => {
        liberar = r
      }),
    sincronizar: async () => null
  })
  await vi.advanceTimersByTimeAsync(0)
  solicitarRecuperacaoNuvem('online')
  const sincronizar = vi.fn(async () => null)
  iniciarTempoReal({ ...opcoes, renovar: async () => {}, verificar: async () => {}, sincronizar })
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
  liberar()
  await vi.advanceTimersByTimeAsync(10000)
  expect(sincronizar).toHaveBeenCalledTimes(1)
})

it('queda durante probe de foco não duplica a retomada confirmada por outra resposta', async () => {
  vi.useFakeTimers()
  let estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  let liberar!: () => void
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({
    ...opcoes,
    status: () => estado,
    renovar: async () => {},
    verificar: () =>
      new Promise<void>((r) => {
        liberar = r
      }),
    sincronizar
  })
  await vi.advanceTimersByTimeAsync(0)
  solicitarRecuperacaoNuvem('focus')
  estado = { conexao: 'inacessivel', erro: 'Sem internet' } as StatusNuvem
  evento()
  await vi.advanceTimersByTimeAsync(0)
  estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  evento()
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(2)
  liberar()
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(2)
})

it('cinquenta reconexões não acumulam timers nem passagens de sincronização', async () => {
  vi.useFakeTimers()
  let estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({
    ...opcoes,
    status: () => estado,
    renovar: async () => {},
    verificar: async () => {},
    sincronizar
  })
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 50; i++) {
    estado = { conexao: 'inacessivel', erro: 'Sem internet' } as StatusNuvem
    evento()
    await vi.advanceTimersByTimeAsync(0)
    estado = { conexao: 'acessivel', erro: null } as StatusNuvem
    evento()
    await vi.advanceTimersByTimeAsync(0)
    expect(sincronizar).toHaveBeenCalledTimes(i + 2)
    expect(vi.getTimerCount()).toBe(1)
  }
  pararTempoReal()
  expect(vi.getTimerCount()).toBe(0)
})
it('indisponibilidade prolongada tem frequência limitada e cessa probes ao recuperar', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  let online = false
  let estado = { conexao: 'inacessivel', erro: 'Sem internet' } as StatusNuvem
  const acesso = async (): Promise<void> => {
    if (!online) throw new TypeError('fetch failed')
  }
  const verificar = vi.fn(acesso)
  const sincronizar = vi.fn(async () => ({ erro: null }))
  iniciarTempoReal({ ...opcoes, status: () => estado, renovar: acesso, verificar, sincronizar })
  for (let i = 0; i < 600; i++) {
    evento()
    await vi.advanceTimersByTimeAsync(1000)
  }
  expect(verificar.mock.calls.length).toBeGreaterThan(100)
  expect(verificar.mock.calls.length).toBeLessThan(125)
  expect(sincronizar).not.toHaveBeenCalled()
  online = true
  estado = { conexao: 'acessivel', erro: null } as StatusNuvem
  evento()
  await vi.advanceTimersByTimeAsync(0)
  expect(sincronizar).toHaveBeenCalledTimes(1)
  const consultas = verificar.mock.calls.length
  await vi.advanceTimersByTimeAsync(120000)
  expect(verificar).toHaveBeenCalledTimes(consultas)
  expect(vi.getTimerCount()).toBe(1)
})

it('leitura saudável não reinicia backoff quando o envio continua falhando', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const sincronizar = vi.fn(async () => ({
    erro: 'Servidor indisponível para envio',
    falhaSincronizacao: { motivo: 'servico', temporaria: true }
  }))
  const verificar = vi.fn(async () => {})
  iniciarTempoReal({ ...opcoes, renovar: async () => {}, verificar, sincronizar })
  await vi.advanceTimersByTimeAsync(10000)
  expect(sincronizar).toHaveBeenCalledTimes(4)
  expect(verificar).toHaveBeenCalledTimes(3)
})
it('Retry-After maior que o limite do temporizador não causa repetição de milissegundos', async () => {
  vi.useFakeTimers()
  const gatilho = vi.fn()
  const verificar = vi.fn(async () => {})
  const renovar = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error('Servidor ocupado'), { status: 429, repetirAposMs: 3000000000 })
    )
  iniciarTempoReal({ ...opcoes, gatilho, renovar, verificar, sincronizar: async () => null })
  await vi.advanceTimersByTimeAsync(1000)
  expect(gatilho).not.toHaveBeenCalled()
  expect(verificar).not.toHaveBeenCalled()
  expect(renovar).toHaveBeenCalledTimes(1)
})
