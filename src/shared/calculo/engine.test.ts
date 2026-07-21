import { describe, it, expect } from 'vitest'
import { calcularCustoServico } from './engine'
import type { EntradaCalculo, ParametrosEncargos } from './types'

const params: ParametrosEncargos = {
  percentualFerias: 10,
  percentualDecimoTerceiro: 10,
  percentualFgts: 8,
  percentualInss: 20, // soma dos encargos = 48%
  percentualMultaRescisao: 10,
  custoContratacao: 100,
  diasBaseMes: 30
}

function base(over: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return {
    dias: 1,
    maoDeObra: [],
    alimentacao: { ativo: false, qtdPessoas: 0, valorRefeicao: 0, modo: 'diario' },
    ferramentas: [],
    combustivel: { ativo: false, distanciaKm: 0, custoPorKm: 0, modo: 'cheio' },
    estadia: { ativo: false, qtdPessoas: 0, valorPorPessoa: 0, modo: 'diario' },
    avulsos: [],
    margemLucroPercent: 0,
    emitirNota: false,
    aliquotaNotaPercent: 0,
    modoImposto: 'gross_up',
    parametros: params,
    ...over
  }
}

describe('mão de obra', () => {
  it('diária: valor × dias × funcionários', () => {
    const r = calcularCustoServico(
      base({
        dias: 4,
        maoDeObra: [{ id: 'a', qtdFuncionarios: 3, regime: 'diaria', valor: 150 }]
      })
    )
    expect(r.custoTotal).toBe(1800)
    expect(r.precoFinal).toBe(1800)
  })

  it('valor fechado: valor × funcionários (ignora dias)', () => {
    const r = calcularCustoServico(
      base({ dias: 10, maoDeObra: [{ id: 'a', qtdFuncionarios: 2, regime: 'valor_cheio', valor: 500 }] })
    )
    expect(r.custoTotal).toBe(1000)
  })

  it('CLT: salário proporcional + encargos + contratação + rescisão', () => {
    const r = calcularCustoServico(
      base({
        dias: 15,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 1,
            regime: 'clt',
            valor: 3000,
            houveContratacao: true,
            demitidoAoFim: true
          }
        ]
      })
    )
    // salário: 3000/30*15 = 1500; encargos 48% = 720; contratação 100; rescisão 10% = 150
    expect(r.custoTotal).toBe(2470)
    // breakdown deve ter 4 linhas
    expect(r.breakdown).toHaveLength(4)
  })

  it('CLT sem contratação e sem rescisão: só salário + encargos', () => {
    const r = calcularCustoServico(
      base({ dias: 30, maoDeObra: [{ id: 'a', qtdFuncionarios: 1, regime: 'clt', valor: 2000 }] })
    )
    // salário 2000 + encargos 48% (960) = 2960
    expect(r.custoTotal).toBe(2960)
    expect(r.breakdown).toHaveLength(2)
  })
})

describe('componentes de custo', () => {
  it('alimentação diária', () => {
    const r = calcularCustoServico(
      base({ dias: 4, alimentacao: { ativo: true, qtdPessoas: 5, valorRefeicao: 20, modo: 'diario' } })
    )
    expect(r.custoTotal).toBe(400)
  })

  it('alimentação valor fechado ignora dias', () => {
    const r = calcularCustoServico(
      base({ dias: 4, alimentacao: { ativo: true, qtdPessoas: 5, valorRefeicao: 20, modo: 'cheio' } })
    )
    expect(r.custoTotal).toBe(100)
  })

  it('combustível cheio e diário', () => {
    const cheio = calcularCustoServico(
      base({ dias: 4, combustivel: { ativo: true, distanciaKm: 100, custoPorKm: 2.5, modo: 'cheio' } })
    )
    expect(cheio.custoTotal).toBe(250)
    const diario = calcularCustoServico(
      base({ dias: 4, combustivel: { ativo: true, distanciaKm: 50, custoPorKm: 2.5, modo: 'diario' } })
    )
    expect(diario.custoTotal).toBe(500) // 50*4*2.5
  })

  it('estadia por diária', () => {
    const r = calcularCustoServico(
      base({ dias: 3, estadia: { ativo: true, qtdPessoas: 2, valorPorPessoa: 80, modo: 'diario' } })
    )
    expect(r.custoTotal).toBe(480)
  })

  it('ferramentas: insumo diário + manutenção fechada', () => {
    const r = calcularCustoServico(
      base({
        dias: 5,
        ferramentas: [
          { id: 'f1', descricao: 'gasolina motoserra', tipo: 'insumo', valor: 30, modo: 'diario' },
          { id: 'f2', descricao: 'roçadeira', tipo: 'manutencao', valor: 200, modo: 'cheio' }
        ]
      })
    )
    expect(r.custoTotal).toBe(350) // 30*5 + 200
  })

  it('custos avulsos', () => {
    const r = calcularCustoServico(
      base({
        dias: 2,
        avulsos: [
          { id: 'x', descricao: 'EPI', valor: 300, modo: 'cheio' },
          { id: 'y', descricao: 'extra diário', valor: 50, modo: 'diario' }
        ]
      })
    )
    expect(r.custoTotal).toBe(400) // 300 + 50*2
  })
})

describe('margem e imposto', () => {
  it('aplica margem de lucro', () => {
    const r = calcularCustoServico(
      base({ maoDeObra: [{ id: 'a', qtdFuncionarios: 1, regime: 'valor_cheio', valor: 1000 }], margemLucroPercent: 30 })
    )
    expect(r.custoTotal).toBe(1000)
    expect(r.valorMargem).toBe(300)
    expect(r.precoComMargem).toBe(1300)
    expect(r.precoFinal).toBe(1300)
  })

  it('imposto gross-up preserva a margem', () => {
    const r = calcularCustoServico(
      base({
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, regime: 'valor_cheio', valor: 1000 }],
        margemLucroPercent: 30,
        emitirNota: true,
        aliquotaNotaPercent: 6,
        modoImposto: 'gross_up'
      })
    )
    expect(r.precoFinal).toBe(1382.98) // 1300 / 0.94
    expect(r.impostoNota).toBe(82.98)
  })

  it('imposto simples soma sobre o preço', () => {
    const r = calcularCustoServico(
      base({
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, regime: 'valor_cheio', valor: 1000 }],
        margemLucroPercent: 30,
        emitirNota: true,
        aliquotaNotaPercent: 6,
        modoImposto: 'simples'
      })
    )
    expect(r.impostoNota).toBe(78) // 1300 * 6%
    expect(r.precoFinal).toBe(1378)
  })

  it('nota desativada não gera imposto', () => {
    const r = calcularCustoServico(
      base({
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, regime: 'valor_cheio', valor: 1000 }],
        emitirNota: false,
        aliquotaNotaPercent: 6
      })
    )
    expect(r.impostoNota).toBe(0)
    expect(r.precoFinal).toBe(1000)
  })
})

describe('casos de borda', () => {
  it('sem custos resulta em zero', () => {
    const r = calcularCustoServico(base())
    expect(r.custoTotal).toBe(0)
    expect(r.precoFinal).toBe(0)
    expect(r.breakdown).toHaveLength(0)
  })

  it('combinação completa soma todos os componentes', () => {
    const r = calcularCustoServico(
      base({
        dias: 4,
        maoDeObra: [{ id: 'a', qtdFuncionarios: 3, regime: 'diaria', valor: 150 }], // 1800
        alimentacao: { ativo: true, qtdPessoas: 3, valorRefeicao: 20, modo: 'diario' }, // 240
        combustivel: { ativo: true, distanciaKm: 100, custoPorKm: 2.5, modo: 'cheio' }, // 250
        avulsos: [{ id: 'x', descricao: 'EPI', valor: 210, modo: 'cheio' }], // 210
        margemLucroPercent: 20
      })
    )
    expect(r.custoTotal).toBe(2500)
    expect(r.precoFinal).toBe(3000) // 2500 * 1.2
  })
})
