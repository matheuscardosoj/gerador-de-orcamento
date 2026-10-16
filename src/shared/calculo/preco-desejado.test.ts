import { describe, expect, it } from 'vitest'
import { atingirPrecoDesejado, calcularCustoServico, retirarMetaPreco } from './engine'
import type { EntradaCalculo } from './types'
import { validarEntradaCalculo } from '../validacao'
import { round2 } from '../format'
function entrada(): EntradaCalculo {
  return {
    dias: 1,
    maoDeObra: [{ id: 'mao', qtdFuncionarios: 1, base: 'diaria', valor: 1000 }],
    alimentacoes: [],
    ferramentas: [],
    combustiveis: [],
    estadias: [],
    avulsos: [
      {
        id: 'material',
        descricao: 'Materiais',
        valor: 500,
        modo: 'cheio',
        acrescimoPersonalizadoPercent: 50
      }
    ],
    margemLucroPercent: 100,
    emitirNota: false,
    aliquotaNotaPercent: 6,
    modoImposto: 'gross_up',
    parametros: {
      percentualFerias: 0,
      percentualDecimoTerceiro: 0,
      percentualFgts: 0,
      percentualInss: 0,
      percentualMultaRescisao: 0,
      custoContratacao: 0,
      diasBaseMes: 30
    }
  }
}
function fechar(e: EntradaCalculo, alvo: number) {
  const meta = atingirPrecoDesejado(e, alvo)
  expect(meta.alterado).toBe(true)
  const r = calcularCustoServico(meta.entrada)
  expect(r.precoFinal).toBe(round2(alvo))
  expect(
    round2(
      (r.custoServico ?? 0) +
        (r.outrosCustosRepasses ?? 0) +
        (r.lucroServico ?? 0) +
        (r.ajustePreco ?? 0) +
        r.impostoNota
    )
  ).toBe(r.precoFinal)
  expect(
    round2(
      r.breakdown.filter((l) => !l.chave.startsWith('avulso:')).reduce((s, l) => s + l.valor, 0)
    )
  ).toBe(r.custoServico)
  expect(
    round2(
      r.breakdown
        .filter((l) => l.chave.startsWith('avulso:'))
        .reduce((s, l) => s + (l.valorApresentado ?? l.valor), 0)
    )
  ).toBe(r.outrosCustosRepasses)
  expect(validarEntradaCalculo(meta.entrada)).toEqual([])
  expect(meta.entrada.avulsos).toEqual(e.avulsos)
  return meta
}
it('apresenta materiais 750 ou 1000, preservando preços e custos originais', () => {
  const e = entrada(),
    copia = JSON.stringify(e)
  expect(calcularCustoServico(e)).toMatchObject({
    custoTotal: 1500,
    custoServicoExibido: 1750,
    custoServico: 1000,
    outrosCustosRepasses: 750,
    lucroServico: 1000,
    acrescimoGeralExibido: 1000,
    precoFinal: 2750
  })
  expect(
    calcularCustoServico(e).breakdown.find((l) => l.chave === 'avulso:material')
  ).toMatchObject({ valor: 500, valorApresentado: 750, acrescimoAplicado: 250 })
  expect(JSON.stringify(e)).toBe(copia)
  delete e.avulsos[0].acrescimoPersonalizadoPercent
  expect(calcularCustoServico(e)).toMatchObject({
    custoServicoExibido: 2000,
    custoServico: 1000,
    outrosCustosRepasses: 1000,
    lucroServico: 1000,
    acrescimoGeralExibido: 1000,
    precoFinal: 3000
  })
  e.emitirNota = true
  expect(calcularCustoServico(e).precoFinal).toBe(3191.49)
})
it('1500 para 3000 sem imposto resulta em 100%, sem ajuste artificial', () => {
  const e = entrada()
  e.avulsos = []
  e.maoDeObra[0].valor = 1500
  e.margemLucroPercent = 0
  const meta = fechar(e, 3000)
  expect(meta.entrada.margemLucroPercent).toBe(100)
  expect(meta.entrada.ajustePreco).toBe(0)
})
it('meta igual não altera a entrada', () => {
  const e = entrada()
  const meta = atingirPrecoDesejado(e, 2750)
  expect(meta.alterado).toBe(false)
  expect(meta.entrada).toBe(e)
})
it('reduz o lucro geral até a meta e aplica o mínimo quando a meta fica abaixo dele', () => {
  const e = entrada()
  const menor = fechar(e, 2250)
  expect(menor.entrada.margemLucroPercent).toBe(50)
  expect(calcularCustoServico(menor.entrada).outrosCustosRepasses).toBe(750)

  const abaixo = atingirPrecoDesejado(menor.entrada, 1500)
  expect(abaixo.alterado).toBe(true)
  expect(abaixo.entrada.precoFinalDesejado).toBe(1500)
  expect(abaixo.entrada.margemLucroPercent).toBe(0)
  expect(calcularCustoServico(abaixo.entrada).precoFinal).toBe(1750)
  expect(abaixo.mensagem).toMatch(/preço mínimo foi aplicado/)
  expect(validarEntradaCalculo(abaixo.entrada)).toEqual([])
})
it.each(['gross_up', 'simples'] as const)(
  'fecha meta com imposto %s e mantém percentuais próprios e repasses',
  (modo) => {
    const e = entrada()
    e.emitirNota = true
    e.modoImposto = modo
    e.dias = 3
    e.avulsos[0].modo = 'diario'
    e.avulsos.push({
      id: 'frete',
      descricao: 'Frete',
      valor: 123.45,
      modo: 'cheio',
      aplicarAcrescimo: false
    })
    fechar(e, 12000.17)
  }
)
it('sem base geral usa ajuste separado; custo zero também pode atingir a meta', () => {
  const e = entrada()
  e.maoDeObra = []
  const meta = fechar(e, 1000)
  expect(meta.entrada.ajustePreco).toBe(250)
  expect(meta.entrada.avulsos[0].acrescimoPersonalizadoPercent).toBe(50)
  e.avulsos = []
  expect(fechar(e, 500).entrada.ajustePreco).toBe(500)
})
it('sem base geral reduz primeiro o complemento e preserva o mínimo dos itens próprios', () => {
  const e = entrada()
  e.maoDeObra = []
  const meta = atingirPrecoDesejado(e, 500)
  expect(meta.alterado).toBe(true)
  expect(meta.entrada.precoFinalDesejado).toBe(500)
  expect(meta.entrada.ajustePreco).toBe(0)
  expect(meta.entrada.avulsos[0].acrescimoPersonalizadoPercent).toBe(50)
  expect(calcularCustoServico(meta.entrada).precoFinal).toBe(750)
  expect(meta.mensagem).toMatch(/preço mínimo foi aplicado/)
  expect(validarEntradaCalculo(meta.entrada)).toEqual([])
})
it.each(['gross_up', 'simples'] as const)(
  'abaixo do piso no modo de imposto %s preserva os percentuais próprios',
  (modo) => {
    const e = entrada()
    e.emitirNota = true
    e.modoImposto = modo
    e.margemLucroPercent = 35
    const minimo = calcularCustoServico({ ...e, margemLucroPercent: 0 }).precoFinal
    const meta = atingirPrecoDesejado(e, minimo - 0.01)
    const resultado = calcularCustoServico(meta.entrada)
    expect(meta.entrada.margemLucroPercent).toBe(0)
    expect(meta.entrada.avulsos[0].acrescimoPersonalizadoPercent).toBe(50)
    expect(meta.entrada.precoFinalDesejado).toBe(round2(minimo - 0.01))
    expect(resultado.precoFinal).toBe(minimo)
    expect(resultado.outrosCustosRepasses).toBe(750)
    expect(validarEntradaCalculo(meta.entrada)).toEqual([])
  }
)
it('sem base geral reduz o complemento monetário ao acompanhar uma meta menor', () => {
  const e = entrada()
  e.maoDeObra = []
  e.avulsos = []
  const alta = atingirPrecoDesejado(e, 1000)
  expect(alta.entrada.ajustePreco).toBe(1000)
  const menor = atingirPrecoDesejado(alta.entrada, 600)
  expect(menor.alterado).toBe(true)
  expect(menor.entrada.ajustePreco).toBe(600)
  expect(calcularCustoServico(menor.entrada).precoFinal).toBe(600)
})
it('rateia centavos dos itens gerais sem alterar o preço histórico', () => {
  const e = entrada()
  e.maoDeObra = []
  e.margemLucroPercent = 50
  e.avulsos = Array.from({ length: 3 }, (_, i) => ({
    id: String(i),
    descricao: 'Centavo',
    valor: 0.01,
    modo: 'cheio' as const
  }))
  const r = calcularCustoServico(e)
  expect(r.precoFinal).toBe(0.05)
  expect(round2(r.breakdown.reduce((s, l) => s + l.valorApresentado!, 0))).toBe(0.05)
})
it('persiste, reabre e invalida a meta sem perder o percentual calculado', () => {
  const meta = fechar(entrada(), 4500.13).entrada
  const reaberta = JSON.parse(JSON.stringify(meta))
  expect(calcularCustoServico(reaberta).precoFinal).toBe(4500.13)
  const limpa = retirarMetaPreco(reaberta)
  expect(limpa.precoFinalDesejado).toBeUndefined()
  expect(limpa.ajustePreco).toBeUndefined()
  expect(limpa.margemLucroPercent).toBe(meta.margemLucroPercent)
  expect(validarEntradaCalculo({ ...meta, maoDeObra: [] })).toEqual(
    expect.arrayContaining([expect.objectContaining({ campo: 'precoFinalDesejado' })])
  )
})
it('recusa valores inválidos e meta incoerente', () => {
  for (const alvo of [NaN, Infinity, -1, 0])
    expect(() => atingirPrecoDesejado(entrada(), alvo)).toThrow()
  expect(validarEntradaCalculo({ ...entrada(), ajustePreco: -1 })).toEqual(
    expect.arrayContaining([expect.objectContaining({ campo: 'ajustePreco' })])
  )
})
describe.each(['gross_up', 'simples'] as const)('arredondamentos com imposto %s', (modo) => {
  it('fecha exatamente 600 metas, incluindo saltos de centavos e alíquotas distintas', () => {
    for (let i = 1; i <= 600; i++) {
      const e = entrada()
      e.modoImposto = modo
      e.emitirNota = true
      e.aliquotaNotaPercent = [0, 6, 10, 17.5, 99.99][i % 5]
      e.margemLucroPercent = 0
      e.maoDeObra[0].valor = (i % 19) / 100
      e.avulsos[0].valor = (i % 13) / 100
      fechar(e, round2(calcularCustoServico(e).precoFinal + 0.01 + i / 100))
    }
  })
})
