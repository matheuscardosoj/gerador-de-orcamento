import { get, run, texto } from './db/sqlite'
import { nuvemConfigurada } from './versoes'
import { randomBytes } from 'crypto'
import type { TipoDocumento } from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'

export function validarTrocaNumero(
  tipo: TipoDocumento,
  id: string,
  estado: string,
  n: number
): ResultadoNumeracao | null {
  if (
    estado !== 'rascunho' ||
    get('SELECT 1 FROM numeros_emitidos WHERE tipo=? AND documento_id=?', [tipo, id])
  )
    return {
      ok: false,
      erro: 'O número de um documento emitido está protegido. Crie um novo rascunho para usar outro número.'
    }
  if (!nuvemConfigurada()) return null
  const linha = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  if (!linha || JSON.parse(texto(linha.valor)).protocolo < 2)
    return {
      ok: false,
      erro: 'Atualize a configuração de colaboração da nuvem para corrigir números de rascunhos.'
    }
  if (!Number.isSafeInteger(n) || n < 1 || n > 999999)
    return { ok: false, erro: 'Informe um número inteiro entre 1 e 999999.' }
  if (!get('SELECT 1 FROM reservas WHERE tipo=? AND numero=? AND usado=0', [tipo, n]))
    return {
      ok: false,
      erro: 'Escolha um número disponível nas reservas deste computador. Números usados ou de outros computadores não podem ser reutilizados.'
    }
  return null
}
export function consumirTrocaNumero(tipo: TipoDocumento, n: number): void {
  if (nuvemConfigurada()) run('UPDATE reservas SET usado=1 WHERE tipo=? AND numero=?', [tipo, n])
}
export function registrarNumeroEmitido(tipo: TipoDocumento, id: string, n: number): void {
  if (n <= 0) throw new Error('Reserve um número oficial antes de emitir.')
  run('INSERT OR IGNORE INTO numeros_emitidos VALUES (?,?,?,?)', [
    tipo,
    id,
    n,
    new Date().toISOString()
  ])
}

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
