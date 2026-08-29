import { describe, it, expect } from 'vitest'
import { calcularCustoServico, normalizarEntrada } from './engine'
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
    alimentacoes: [],
    ferramentas: [],
    combustiveis: [],
    estadias: [],
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
        maoDeObra: [{ id: 'a', qtdFuncionarios: 3, base: 'diaria', valor: 150 }]
      })
    )
    expect(r.custoTotal).toBe(1800)
    expect(r.precoFinal).toBe(1800)
  })

  it('valor fechado: valor × funcionários (ignora dias)', () => {
    const r = calcularCustoServico(
      base({
        dias: 10,
        maoDeObra: [{ id: 'a', qtdFuncionarios: 2, base: 'valor_cheio', valor: 500 }]
      })
    )
    expect(r.custoTotal).toBe(1000)
  })

  it('mensal sem CLT: rateia o valor pelos dias do serviço', () => {
    const r = calcularCustoServico(
      base({ dias: 15, maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'mensal', valor: 3000 }] })
    )
    expect(r.custoTotal).toBe(1500)
    expect(r.breakdown).toHaveLength(1)
  })

  it('CLT mensal: salário proporcional + encargos + contratação + rescisão', () => {
    const r = calcularCustoServico(
      base({
        dias: 15,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 1,
            base: 'mensal',
            valor: 3000,
            clt: true,
            salarioCarteira: 3000,
            houveContratacao: true,
            demitidoAoFim: true
          }
        ]
      })
    )
    // salário: 3000/30*15 = 1500; encargos 48% = 720; contratação 100; rescisão 10% = 150
    expect(r.custoTotal).toBe(2470)
    expect(r.breakdown).toHaveLength(4)
  })

  it('CLT sem contratação e sem rescisão: só salário + encargos', () => {
    const r = calcularCustoServico(
      base({
        dias: 30,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 1,
            base: 'mensal',
            valor: 2000,
            clt: true,
            salarioCarteira: 2000
          }
        ]
      })
    )
    // salário 2000 + encargos 48% (960) = 2960
    expect(r.custoTotal).toBe(2960)
    expect(r.breakdown).toHaveLength(2)
  })

  it('CLT pago por diária: encargos incidem sobre o salário da carteira', () => {
    const r = calcularCustoServico(
      base({
        dias: 15,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 2,
            base: 'diaria',
            valor: 170,
            clt: true,
            salarioCarteira: 1800,
            houveContratacao: true,
            demitidoAoFim: true
          }
        ]
      })
    )
    // pago: 170 × 15 × 2 = 5100
    // base de encargos: 1800/30 × 15 × 2 = 1800 -> encargos 48% = 864; rescisão 10% = 180
    // contratação: 100 × 2 = 200
    expect(r.custoTotal).toBe(5100 + 864 + 200 + 180)
  })

  it('CLT com valor fechado: encargos ainda saem da carteira', () => {
    const r = calcularCustoServico(
      base({
        dias: 30,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 1,
            base: 'valor_cheio',
            valor: 4000,
            clt: true,
            salarioCarteira: 2000
          }
        ]
      })
    )
    expect(r.custoTotal).toBe(4000 + 960)
  })

  it('sem CLT não gera encargos mesmo com contratação marcada', () => {
    const r = calcularCustoServico(
      base({
        dias: 10,
        maoDeObra: [
          {
            id: 'a',
            qtdFuncionarios: 1,
            base: 'diaria',
            valor: 100,
            houveContratacao: true,
            demitidoAoFim: true
          }
        ]
      })
    )
    expect(r.custoTotal).toBe(1000)
    expect(r.breakdown).toHaveLength(1)
  })

  it('usa a descrição personalizada na linha do breakdown', () => {
    const r = calcularCustoServico(
      base({
        dias: 2,
        maoDeObra: [
          { id: 'a', descricao: 'Diária a R$ 170', qtdFuncionarios: 1, base: 'diaria', valor: 170 }
        ]
      })
    )
    expect(r.breakdown[0].descricao).toBe('Diária a R$ 170')
  })
})

describe('componentes de custo', () => {
  it('alimentação diária', () => {
    const r = calcularCustoServico(
      base({
        dias: 4,
        alimentacoes: [{ id: 'a1', qtdPessoas: 5, valorRefeicao: 20, modo: 'diario' }]
      })
    )
    expect(r.custoTotal).toBe(400)
  })

  it('alimentação valor fechado ignora dias', () => {
    const r = calcularCustoServico(
      base({
        dias: 4,
        alimentacoes: [{ id: 'a1', qtdPessoas: 5, valorRefeicao: 20, modo: 'cheio' }]
      })
    )
    expect(r.custoTotal).toBe(100)
  })

  it('várias alimentações somam e mantêm suas descrições', () => {
    const r = calcularCustoServico(
      base({
        dias: 3,
        alimentacoes: [
          { id: 'a1', descricao: 'Café da manhã', qtdPessoas: 4, valorRefeicao: 8, modo: 'diario' }, // 96
          { id: 'a2', descricao: 'Almoço', qtdPessoas: 4, valorRefeicao: 25, modo: 'diario' } // 300
        ]
      })
    )
    expect(r.custoTotal).toBe(396)
    expect(r.breakdown.map((l) => l.descricao)).toEqual(['Café da manhã', 'Almoço'])
  })

  it('combustível por consumo: cheio e diário', () => {
    // 100 km ÷ 10 km/l = 10 L × R$ 6 = R$ 60
    const cheio = calcularCustoServico(
      base({
        dias: 4,
        combustiveis: [{ id: 'c1', distanciaKm: 100, consumoKmL: 10, precoLitro: 6, modo: 'cheio' }]
      })
    )
    expect(cheio.custoTotal).toBe(60)
    // 50 km/dia × 4 dias = 200 km ÷ 10 = 20 L × R$ 6 = R$ 120
    const diario = calcularCustoServico(
      base({
        dias: 4,
        combustiveis: [{ id: 'c1', distanciaKm: 50, consumoKmL: 10, precoLitro: 6, modo: 'diario' }]
      })
    )
    expect(diario.custoTotal).toBe(120)
  })

  it('dois veículos somam', () => {
    const r = calcularCustoServico(
      base({
        dias: 4,
        combustiveis: [
          {
            id: 'c1',
            descricao: 'Caminhonete',
            distanciaKm: 100,
            consumoKmL: 10,
            precoLitro: 6,
            modo: 'cheio'
          }, // 60
          {
            id: 'c2',
            descricao: 'Carro de apoio',
            distanciaKm: 50,
            consumoKmL: 10,
            precoLitro: 6,
            modo: 'diario'
          } // 120
        ]
      })
    )
    expect(r.custoTotal).toBe(180)
    expect(r.breakdown.map((l) => l.descricao)).toEqual(['Caminhonete', 'Carro de apoio'])
  })

  it('estadia por diária', () => {
    const r = calcularCustoServico(
      base({
        dias: 3,
        estadias: [
          { id: 'e1', tipo: 'por_pessoa', qtdPessoas: 2, valorPorPessoa: 80, modo: 'diario' }
        ]
      })
    )
    expect(r.custoTotal).toBe(480)
  })

  it('estadia por aluguel: mensal × meses, independente de pessoas e dias', () => {
    const r = calcularCustoServico(
      base({
        dias: 40,
        estadias: [
          {
            id: 'e1',
            descricao: 'Casa alugada',
            tipo: 'aluguel',
            qtdPessoas: 0,
            valorPorPessoa: 0,
            modo: 'diario',
            valorMensal: 1200,
            qtdMeses: 1.5
          }
        ]
      })
    )
    expect(r.custoTotal).toBe(1800)
    expect(r.breakdown[0].descricao).toBe('Casa alugada')
  })

  it('duas estadias de tipos diferentes somam', () => {
    const r = calcularCustoServico(
      base({
        dias: 5,
        estadias: [
          { id: 'e1', tipo: 'por_pessoa', qtdPessoas: 2, valorPorPessoa: 80, modo: 'diario' }, // 800
          {
            id: 'e2',
            tipo: 'aluguel',
            qtdPessoas: 0,
            valorPorPessoa: 0,
            modo: 'diario',
            valorMensal: 1000,
            qtdMeses: 2
          } // 2000
        ]
      })
    )
    expect(r.custoTotal).toBe(2800)
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
      base({
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'valor_cheio', valor: 1000 }],
        margemLucroPercent: 30
      })
    )
    expect(r.custoTotal).toBe(1000)
    expect(r.valorMargem).toBe(300)
    expect(r.precoComMargem).toBe(1300)
    expect(r.precoFinal).toBe(1300)
  })

  it('imposto gross-up preserva a margem', () => {
    const r = calcularCustoServico(
      base({
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'valor_cheio', valor: 1000 }],
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
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'valor_cheio', valor: 1000 }],
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
        maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'valor_cheio', valor: 1000 }],
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
        maoDeObra: [{ id: 'a', qtdFuncionarios: 3, base: 'diaria', valor: 150 }], // 1800
        alimentacoes: [{ id: 'a1', qtdPessoas: 3, valorRefeicao: 20, modo: 'diario' }], // 240
        combustiveis: [
          { id: 'c1', distanciaKm: 100, consumoKmL: 10, precoLitro: 6, modo: 'cheio' }
        ], // 60
        avulsos: [{ id: 'x', descricao: 'EPI', valor: 200, modo: 'cheio' }], // 200
        margemLucroPercent: 20
      })
    )
    expect(r.custoTotal).toBe(2300) // 1800 + 240 + 60 + 200
    expect(r.precoFinal).toBe(2760) // 2300 * 1.2
  })
})

describe('compatibilidade com entradas salvas antes da 1.1', () => {
  /** Monta uma entrada no formato antigo (item único + `regime`). */
  function legado(over: Record<string, unknown> = {}): EntradaCalculo {
    return {
      dias: 1,
      maoDeObra: [],
      alimentacao: { ativo: false, qtdPessoas: 0, valorRefeicao: 0, modo: 'diario' },
      ferramentas: [],
      combustivel: { ativo: false, distanciaKm: 0, consumoKmL: 10, precoLitro: 0, modo: 'cheio' },
      estadia: { ativo: false, qtdPessoas: 0, valorPorPessoa: 0, modo: 'diario' },
      avulsos: [],
      margemLucroPercent: 0,
      emitirNota: false,
      aliquotaNotaPercent: 0,
      modoImposto: 'gross_up',
      parametros: params,
      ...over
    } as unknown as EntradaCalculo
  }

  it('converte os itens únicos em listas, respeitando o "ativo"', () => {
    const n = normalizarEntrada(
      legado({
        alimentacao: { ativo: true, qtdPessoas: 5, valorRefeicao: 20, modo: 'diario' },
        combustivel: {
          ativo: false,
          distanciaKm: 100,
          consumoKmL: 10,
          precoLitro: 6,
          modo: 'cheio'
        },
        estadia: { ativo: true, qtdPessoas: 2, valorPorPessoa: 80, modo: 'diario' }
      })
    )
    expect(n.alimentacoes).toHaveLength(1)
    expect(n.combustiveis).toHaveLength(0) // estava desligado
    expect(n.estadias).toEqual([
      { id: 'legado', tipo: 'por_pessoa', qtdPessoas: 2, valorPorPessoa: 80, modo: 'diario' }
    ])
    expect(n.alimentacao).toBeUndefined()
    expect(n.estadia).toBeUndefined()
  })

  it('converte o regime da mão de obra', () => {
    const n = normalizarEntrada(
      legado({
        maoDeObra: [
          { id: 'a', qtdFuncionarios: 1, regime: 'clt', valor: 3000 },
          { id: 'b', qtdFuncionarios: 2, regime: 'diaria', valor: 150 }
        ]
      })
    )
    expect(n.maoDeObra[0]).toEqual({
      id: 'a',
      qtdFuncionarios: 1,
      base: 'mensal',
      clt: true,
      salarioCarteira: 3000,
      valor: 3000
    })
    expect(n.maoDeObra[1]).toEqual({
      id: 'b',
      qtdFuncionarios: 2,
      base: 'diaria',
      clt: false,
      valor: 150
    })
  })

  it('é idempotente sobre uma entrada já no formato novo', () => {
    const nova = base({
      dias: 3,
      maoDeObra: [{ id: 'a', qtdFuncionarios: 1, base: 'diaria', valor: 100 }],
      alimentacoes: [{ id: 'a1', qtdPessoas: 2, valorRefeicao: 20, modo: 'diario' }]
    })
    expect(normalizarEntrada(normalizarEntrada(nova))).toEqual(normalizarEntrada(nova))
    expect(normalizarEntrada(nova)).toEqual(nova)
  })

  it('reproduz exatamente o total de um orçamento antigo', () => {
    // Mesmo cenário do teste "combinação completa", no formato antigo.
    const r = calcularCustoServico(
      legado({
        dias: 4,
        maoDeObra: [{ id: 'a', qtdFuncionarios: 3, regime: 'diaria', valor: 150 }],
        alimentacao: { ativo: true, qtdPessoas: 3, valorRefeicao: 20, modo: 'diario' },
        combustivel: {
          ativo: true,
          distanciaKm: 100,
          consumoKmL: 10,
          precoLitro: 6,
          modo: 'cheio'
        },
        avulsos: [{ id: 'x', descricao: 'EPI', valor: 200, modo: 'cheio' }],
        margemLucroPercent: 20
      })
    )
    expect(r.custoTotal).toBe(2300)
    expect(r.precoFinal).toBe(2760)
  })

  it('reproduz o total de um CLT antigo (salário + encargos + contratação + rescisão)', () => {
    const r = calcularCustoServico(
      legado({
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
    expect(r.custoTotal).toBe(2470)
    expect(r.breakdown).toHaveLength(4)
  })
})
