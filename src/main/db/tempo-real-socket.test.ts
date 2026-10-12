// Socket local real + SDK oficial; não usa o projeto de produção.
import { afterEach, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import WebSocket, { WebSocketServer } from 'ws'
import { iniciarTempoReal, pararTempoReal } from '../tempo-real'
import type { StatusNuvem } from '@shared/types'
afterEach(() => pararTempoReal())
it('recebe aviso privado em menos de dois segundos e recupera evento perdido ao reconectar', async () => {
  const servidor = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>((r) => servidor.once('listening', r))
  const porta = (servidor.address() as { port: number }).port
  const assinantes = new Map<WebSocket, { topico: string; ref: string }>()
  const entradas: Array<{ privado: boolean; token: string }> = []
  servidor.on('connection', (socket) =>
    socket.on('message', (bytes) => {
      const [join_ref, ref, topic, event, payload] = JSON.parse(bytes.toString())
      if (event === 'phx_join') {
        entradas.push({ privado: payload.config.private, token: payload.access_token })
        const permitido =
          payload.config.private &&
          payload.access_token === 'empresa-a' &&
          topic === 'realtime:empresa:empresa-a'
        if (permitido) assinantes.set(socket, { topico: topic, ref: join_ref })
        socket.send(
          JSON.stringify([
            join_ref,
            ref,
            topic,
            'phx_reply',
            {
              status: permitido ? 'ok' : 'error',
              response: permitido ? { postgres_changes: [] } : { reason: 'unauthorized' }
            }
          ])
        )
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        if (event === 'phx_leave') assinantes.delete(socket)
        socket.send(
          JSON.stringify([join_ref, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
        )
      }
    })
  )
  let revisaoServidor = 1,
    revisaoLocal = 0,
    estado: StatusNuvem['tempoReal'] = 'desconectado',
    passagens = 0
  const config = {
    url: `http://127.0.0.1:${porta}`,
    chavePublica: 'chave-teste-local',
    email: 'b@teste.local'
  }
  try {
    iniciarTempoReal({
      configuracao: () => config,
      identidade: () => ({ empresa: 'empresa-a', token: 'empresa-a' }),
      renovar: async () => {},
      estado: (s) => {
        estado = s
      },
      sincronizar: async () => {
        passagens++
        revisaoLocal = revisaoServidor
      },
      criarCliente: (c, opcoes) =>
        createClient(c.url, c.chavePublica, {
          ...opcoes,
          realtime: {
            ...opcoes?.realtime,
            transport: WebSocket as unknown as typeof globalThis.WebSocket,
            timeout: 1000,
            reconnectAfterMs: () => 30
          }
        })
    })
    await expect.poll(() => estado, { timeout: 5000 }).toBe('conectado')
    await expect.poll(() => revisaoLocal).toBe(1)
    const avisar = (): void => {
      for (const [socket, a] of assinantes)
        if (socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify([
              a.ref,
              null,
              a.topico,
              'broadcast',
              { event: 'alteracao', type: 'broadcast', payload: { alterado: true } }
            ])
          )
    }
    revisaoServidor = 2
    const confirmado = performance.now()
    avisar()
    await expect.poll(() => revisaoLocal, { timeout: 2000, interval: 10 }).toBe(2)
    const latencia = performance.now() - confirmado
    expect(latencia).toBeLessThan(2000)
    // Avisos duplicados ou atrasados consultam a verdade atual; não aplicam payloads.
    avisar()
    avisar()
    await expect.poll(() => passagens).toBeGreaterThan(2)
    for (const socket of assinantes.keys()) socket.terminate()
    assinantes.clear()
    revisaoServidor = 3 // nenhuma notificação desta alteração é entregue.
    await expect.poll(() => entradas.length, { timeout: 5000 }).toBeGreaterThan(1)
    await expect.poll(() => revisaoLocal, { timeout: 5000 }).toBe(3)
    expect(entradas.every((e) => e.privado && e.token === 'empresa-a')).toBe(true)
    console.log(
      JSON.stringify({
        ensaio: 'socket-local-sdk',
        latenciaMs: Math.round(latencia),
        reconexao: true
      })
    )
  } finally {
    pararTempoReal()
    for (const socket of servidor.clients) socket.terminate()
    await new Promise<void>((r) => servidor.close(() => r()))
  }
}, 10000)
