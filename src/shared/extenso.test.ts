import { describe, it, expect } from 'vitest'
import { valorPorExtenso } from './extenso'

describe('valorPorExtenso', () => {
  it('valores simples', () => {
    expect(valorPorExtenso(0)).toBe('zero reais')
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(2)).toBe('dois reais')
    expect(valorPorExtenso(100)).toBe('cem reais')
    expect(valorPorExtenso(101)).toBe('cento e um reais')
  })

  it('centavos', () => {
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos')
    expect(valorPorExtenso(1.99)).toBe('um real e noventa e nove centavos')
  })

  it('milhares', () => {
    expect(valorPorExtenso(1000)).toBe('mil reais')
    expect(valorPorExtenso(2500)).toBe('dois mil e quinhentos reais')
    expect(valorPorExtenso(38761.68)).toBe(
      'trinta e oito mil, setecentos e sessenta e um reais e sessenta e oito centavos'
    )
  })

  it('milhão', () => {
    expect(valorPorExtenso(1000000)).toBe('um milhão reais')
  })
})
