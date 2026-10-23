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

  it('milhões exatos usam "de reais"', () => {
    expect(valorPorExtenso(1000000)).toBe('um milhão de reais')
    expect(valorPorExtenso(2000000)).toBe('dois milhões de reais')
    expect(valorPorExtenso(1000000000)).toBe('um bilhão de reais')
    expect(valorPorExtenso(1000000.5)).toBe('um milhão de reais e cinquenta centavos')
  })

  it('usa "e" antes do último grupo não nulo', () => {
    expect(valorPorExtenso(1500000)).toBe('um milhão e quinhentos mil reais')
    expect(valorPorExtenso(2500000)).toBe('dois milhões e quinhentos mil reais')
    expect(valorPorExtenso(1000100)).toBe('um milhão e cem reais')
    expect(valorPorExtenso(1234567)).toBe(
      'um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais'
    )
  })

  it('usa o mesmo arredondamento do valor exibido', () => {
    expect(valorPorExtenso(1.005)).toBe('um real e um centavo')
    expect(valorPorExtenso(-5)).toBe('zero reais')
  })

  it('suporta escalas acima de trilhões sem texto indefinido', () => {
    expect(valorPorExtenso(1000000000000000)).toBe('um quatrilhão de reais')
  })
})
