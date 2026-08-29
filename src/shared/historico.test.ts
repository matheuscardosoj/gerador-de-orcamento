import { describe, expect, it } from 'vitest'
import { compararOrigemRelatorio } from './historico'
import type { Relatorio } from './types'

const rel = (numero: number | null, cliente = '') =>
  ({
    origemOrcamento: numero == null ? null : { id: String(numero), numero, cliente }
  }) as unknown as Relatorio

describe('ordenação da origem de relatórios', () => {
  it('ordena propostas numericamente e deixa sem origem por último', () => {
    expect(
      [rel(10), rel(2), rel(null)]
        .sort(compararOrigemRelatorio)
        .map((r) => r.origemOrcamento?.numero ?? null)
    ).toEqual([2, 10, null])
  })
})
