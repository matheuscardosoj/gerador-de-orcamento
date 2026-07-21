import type { CalculoServico } from '@shared/types'

/** Dados que um modal (de cálculo ou manual) devolve para virar um item de serviço. */
export interface ResultadoServico {
  descricao: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  calculo: CalculoServico | null
}

export const novoId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
