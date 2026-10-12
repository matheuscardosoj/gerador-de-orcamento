import { expect, it } from 'vitest'
import {
  formatarEntradaNumerica,
  lerEntradaNumerica,
  mascararNumeroEditavel,
  prepararNumeroColado,
  valorNumericoCanonico
} from './entrada-numerica'

it('converte valores brasileiros sem confundir milhares e casas decimais', () => {
  for (const [entrada, canonico, mascara] of [
    ['25.591,40', '25591.4', '25.591,40'],
    ['1,5', '1.5', '1,5'],
    [',75', '0.75', '0,75'],
    ['00012,', '12', '12,'],
    ['', '', '']
  ]) {
    const raw = lerEntradaNumerica(entrada)!
    expect(valorNumericoCanonico(raw)).toBe(canonico)
    expect(mascararNumeroEditavel(raw)).toBe(mascara)
  }
})
it('bloqueia letras, notação científica, sinais indevidos e valores não representáveis', () => {
  for (const entrada of ['abc', '1e3', '1+2', '-1', '1,2,3', 'Infinity', '999999999999999999'])
    expect(lerEntradaNumerica(entrada)).toBeNull()
  expect(lerEntradaNumerica('1,5', { inteiro: true })).toBeNull()
  expect(lerEntradaNumerica('-1,5', { negativo: true })).toBe('-1,5')
})
it('aceita colagem de reais, inteiros agrupados e decimais com ponto', () => {
  for (const [texto, numero] of [
    ['R$ 25.591,40', 25591.4],
    ['1.234', 1234],
    ['25.5', 25.5],
    ['0.125', 0.125]
  ])
    expect(
      Number(valorNumericoCanonico(lerEntradaNumerica(prepararNumeroColado(String(texto)))!))
    ).toBe(numero)
})
it('preserva precisão das quantidades e mantém vazio diferente de zero nos filtros', () => {
  expect(formatarEntradaNumerica(1.23456789)).toBe('1,23456789')
  expect(formatarEntradaNumerica('', false, true)).toBe('')
  expect(formatarEntradaNumerica(0, false, true)).toBe('0,00')
  expect(formatarEntradaNumerica(25591.4, false, true)).toBe('25.591,40')
  expect(formatarEntradaNumerica(12345, true)).toBe('12.345')
})
