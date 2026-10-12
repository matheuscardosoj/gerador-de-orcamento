import { expect, it } from 'vitest'
import { AgendadorSincronizacao } from '../tempo-real'

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
