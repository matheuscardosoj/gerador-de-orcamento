import { EventEmitter } from 'events'
import type { EventoDados } from '@shared/evolucao'

const eventos = new EventEmitter()
export function avisarDados(evento: EventoDados): void {
  // Publica após o término da transação local. A fila persistente é a fonte de verdade.
  queueMicrotask(() => eventos.emit('dados', evento))
}
export function observarDados(fn: (evento: EventoDados) => void): () => void {
  eventos.on('dados', fn)
  return () => {
    eventos.off('dados', fn)
  }
}
