import { describe, expect, it } from 'vitest'
import { dataCivilParaDate, formatDataCurta, normalizarDataCivil } from './format'

describe('datas civis', () => {
  it('preserva o dia para valores ISO antigos e canônicos', () => {
    expect(normalizarDataCivil('2026-08-28T00:00:00.000Z')).toBe('2026-08-28')
    expect(formatDataCurta('2026-08-28')).toBe('28/08/2026')
    expect(dataCivilParaDate('2026-08-28').getDate()).toBe(28)
  })
})
