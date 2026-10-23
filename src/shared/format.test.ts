import { describe, expect, it } from 'vitest'
import {
  dataCivilParaDate,
  formatDataCurta,
  formatMoeda,
  normalizarDataCivil,
  round2
} from './format'

describe('datas civis', () => {
  it('preserva o dia para valores ISO antigos e canônicos', () => {
    expect(normalizarDataCivil('2026-08-28T00:00:00.000Z')).toBe('2026-08-28')
    expect(formatDataCurta('2026-08-28')).toBe('28/08/2026')
    expect(dataCivilParaDate('2026-08-28').getDate()).toBe(28)
  })
})

describe('round2', () => {
  it('mantém o arredondamento dos valores positivos', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(10.004)).toBe(10)
    expect(round2(1234.5678)).toBe(1234.57)
  })

  it('arredonda negativos de forma simétrica aos positivos', () => {
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(-2.675)).toBe(-2.68)
    expect(round2(-1234.5678)).toBe(-1234.57)
  })

  it('nunca devolve -0', () => {
    expect(Object.is(round2(-0.004), 0)).toBe(true)
    expect(Object.is(round2(-0), 0)).toBe(true)
    expect(formatMoeda(round2(-0.004))).not.toContain('-')
  })
})
