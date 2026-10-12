import { get, run } from './db/sqlite'
import { nuvemConfigurada } from './versoes'
import { randomBytes } from 'crypto'
import type { TipoDocumento } from '@shared/types'
import type { InfoNumeracao } from '@shared/api'

export function numeracaoNuvem(tipo: TipoDocumento, local: InfoNumeracao): InfoNumeracao {
  if (!nuvemConfigurada()) return local
  const proximo = numeroNuvem(tipo, () => 0)
  return { ...local, proximoNumero: proximo, menorLivre: proximo, usaReservas: true }
}
export function numeroNuvem(tipo: TipoDocumento, local: () => number, consumir = false): number {
  if (!nuvemConfigurada()) return local()
  const reserva = get(
    'SELECT numero FROM reservas WHERE tipo=? AND usado=0 ORDER BY numero LIMIT 1',
    [tipo]
  )
  if (reserva) {
    if (consumir)
      run('UPDATE reservas SET usado=1 WHERE tipo=? AND numero=?', [tipo, reserva.numero])
    return Number(reserva.numero)
  }
  if (!consumir) return 0
  // Identificador temporário amplo evita que dois computadores offline criem
  // o mesmo número negativo. A numeração oficial usa apenas reservas positivas.
  return -(randomBytes(6).readUIntBE(0, 6) || 1)
}
