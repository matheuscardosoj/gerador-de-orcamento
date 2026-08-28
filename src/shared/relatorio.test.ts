import { describe, expect, it } from 'vitest'
import { calcularTotaisRelatorio } from './relatorio'

const servico = (valorTotal: number) => ({ id: String(valorTotal), descricao: 'Serviço', unidade: 'un', quantidade: 1, valorUnitario: valorTotal, valorTotal, calculo: null })

describe('calcularTotaisRelatorio', () => {
  it('soma serviços, subtrai adiantamentos e soma reembolsos com centavos', () => {
    const r = calcularTotaisRelatorio([servico(100.1), servico(20.2)], [{ id: 'a', descricao: '', valor: 10.15 }], [{ id: 'r', descricao: '', valor: 1.05 }])
    expect(r).toEqual({ servicos: 120.3, adiantamentos: 10.15, reembolsos: 1.05, saldo: 111.2, valorFinal: 111.2, tipoSaldo: 'receber' })
  })

  it('apresenta saldo negativo como valor a devolver', () => {
    const r = calcularTotaisRelatorio([servico(10)], [{ id: 'a', descricao: '', valor: 15 }], [])
    expect(r.saldo).toBe(-5)
    expect(r.valorFinal).toBe(5)
    expect(r.tipoSaldo).toBe('devolver')
  })
})
