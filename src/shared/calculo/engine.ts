// Motor de cálculo de custo de serviço (puro, sem I/O).
import { round2, formatMoeda } from '../format'
import type {
  EntradaCalculo,
  ResultadoCalculo,
  LinhaBreakdown,
  ParametrosEncargos,
  GrupoMaoDeObra
} from './types'

/** Custo de um grupo de mão de obra, já detalhado em linhas de breakdown. */
function custoMaoDeObra(
  g: GrupoMaoDeObra,
  dias: number,
  p: ParametrosEncargos
): LinhaBreakdown[] {
  const linhas: LinhaBreakdown[] = []
  const qtd = Math.max(0, g.qtdFuncionarios || 0)
  const nome = g.descricao?.trim() || 'Mão de obra'

  if (g.regime === 'diaria') {
    const valor = g.valor * dias * qtd
    linhas.push({
      chave: `mo:${g.id}`,
      descricao: `${nome} (diária)`,
      valor,
      detalhe: `${qtd} func. × ${dias} dia(s) × ${formatMoeda(g.valor)}`
    })
  } else if (g.regime === 'valor_cheio') {
    const valor = g.valor * qtd
    linhas.push({
      chave: `mo:${g.id}`,
      descricao: `${nome} (valor fechado)`,
      valor,
      detalhe: `${qtd} func. × ${formatMoeda(g.valor)}`
    })
  } else {
    // CLT: salário mensal proporcional ao período + encargos + contratação/rescisão.
    const custoSalario = (g.valor / (p.diasBaseMes || 30)) * dias * qtd
    linhas.push({
      chave: `mo:${g.id}:sal`,
      descricao: `${nome} (CLT — salário proporcional)`,
      valor: custoSalario,
      detalhe: `${qtd} func. × ${dias}/${p.diasBaseMes} do salário ${formatMoeda(g.valor)}`
    })

    const encPct =
      (p.percentualFerias || 0) +
      (p.percentualDecimoTerceiro || 0) +
      (p.percentualFgts || 0) +
      (p.percentualInss || 0)
    if (encPct > 0) {
      linhas.push({
        chave: `mo:${g.id}:enc`,
        descricao: `Encargos CLT (${round2(encPct)}%)`,
        valor: custoSalario * (encPct / 100),
        detalhe: 'Férias, 13º, FGTS e INSS sobre o salário do período'
      })
    }
    if (g.houveContratacao && p.custoContratacao > 0) {
      linhas.push({
        chave: `mo:${g.id}:contr`,
        descricao: 'Custo de contratação',
        valor: p.custoContratacao * qtd,
        detalhe: `${qtd} func. × ${formatMoeda(p.custoContratacao)}`
      })
    }
    if (g.demitidoAoFim && p.percentualMultaRescisao > 0) {
      linhas.push({
        chave: `mo:${g.id}:resc`,
        descricao: `Rescisão / quebra de contrato (${round2(p.percentualMultaRescisao)}%)`,
        valor: custoSalario * (p.percentualMultaRescisao / 100),
        detalhe: 'Aviso e multa sobre o salário do período'
      })
    }
  }

  return linhas
}

/**
 * Calcula o custo total de um serviço, aplica a margem de lucro e o imposto da
 * nota (quando houver), retornando o preço final e o detalhamento.
 */
export function calcularCustoServico(e: EntradaCalculo): ResultadoCalculo {
  const dias = Math.max(0, e.dias || 0)
  const breakdown: LinhaBreakdown[] = []

  // 1) Mão de obra
  for (const g of e.maoDeObra ?? []) {
    breakdown.push(...custoMaoDeObra(g, dias, e.parametros))
  }

  // 2) Alimentação
  if (e.alimentacao?.ativo) {
    const a = e.alimentacao
    const mult = a.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: 'alimentacao',
      descricao: 'Alimentação',
      valor: a.valorRefeicao * a.qtdPessoas * mult,
      detalhe: `${a.qtdPessoas} pessoa(s) × ${a.modo === 'diario' ? `${dias} dia(s)` : 'valor fechado'} × ${formatMoeda(a.valorRefeicao)}`
    })
  }

  // 3) Ferramentas (manutenção / insumos)
  for (const f of e.ferramentas ?? []) {
    const mult = f.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: `ferramenta:${f.id}`,
      descricao: `${f.tipo === 'manutencao' ? 'Manutenção' : 'Insumo'} — ${f.descricao || 'ferramenta'}`,
      valor: f.valor * mult,
      detalhe: f.modo === 'diario' ? `${formatMoeda(f.valor)} × ${dias} dia(s)` : 'valor fechado'
    })
  }

  // 4) Combustível / deslocamento (litros = distância / consumo; custo = litros × preço)
  if (e.combustivel?.ativo) {
    const c = e.combustivel
    const km = c.modo === 'diario' ? c.distanciaKm * dias : c.distanciaKm
    const litros = c.consumoKmL > 0 ? km / c.consumoKmL : 0
    breakdown.push({
      chave: 'combustivel',
      descricao: 'Combustível / deslocamento',
      valor: litros * c.precoLitro,
      detalhe: `${km} km ÷ ${c.consumoKmL} km/l = ${litros.toFixed(1)} L × ${formatMoeda(c.precoLitro)}${c.modo === 'diario' ? ` (${c.distanciaKm} km/dia × ${dias} dia(s))` : ''}`
    })
  }

  // 5) Estadia / hospedagem
  if (e.estadia?.ativo) {
    const s = e.estadia
    const mult = s.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: 'estadia',
      descricao: 'Estadia / hospedagem',
      valor: s.valorPorPessoa * s.qtdPessoas * mult,
      detalhe: `${s.qtdPessoas} pessoa(s) × ${s.modo === 'diario' ? `${dias} diária(s)` : 'valor fechado'} × ${formatMoeda(s.valorPorPessoa)}`
    })
  }

  // 6) Custos avulsos
  for (const av of e.avulsos ?? []) {
    const mult = av.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: `avulso:${av.id}`,
      descricao: av.descricao?.trim() || 'Custo avulso',
      valor: av.valor * mult,
      detalhe: av.modo === 'diario' ? `${formatMoeda(av.valor)} × ${dias} dia(s)` : 'valor fechado'
    })
  }

  // Normaliza valores e remove linhas zeradas.
  const linhas = breakdown
    .map((l) => ({ ...l, valor: round2(l.valor) }))
    .filter((l) => l.valor !== 0)

  const custoTotal = round2(linhas.reduce((s, l) => s + l.valor, 0))

  const margemLucroPercent = e.margemLucroPercent || 0
  const valorMargem = round2(custoTotal * (margemLucroPercent / 100))
  const precoComMargem = round2(custoTotal + valorMargem)

  // Imposto da nota: incide sobre o faturamento.
  //  - gross_up: divide por (1 - alíquota) para preservar a margem líquida (padrão).
  //  - simples: soma a alíquota sobre o preço com margem.
  const aliquotaNotaPercent = e.aliquotaNotaPercent || 0
  let impostoNota = 0
  let precoFinal = precoComMargem
  if (e.emitirNota && aliquotaNotaPercent > 0) {
    if (e.modoImposto === 'gross_up' && aliquotaNotaPercent < 100) {
      const bruto = round2(precoComMargem / (1 - aliquotaNotaPercent / 100))
      impostoNota = round2(bruto - precoComMargem)
      precoFinal = bruto
    } else {
      impostoNota = round2(precoComMargem * (aliquotaNotaPercent / 100))
      precoFinal = round2(precoComMargem + impostoNota)
    }
  }

  return {
    breakdown: linhas,
    custoTotal,
    margemLucroPercent,
    valorMargem,
    precoComMargem,
    emitirNota: !!e.emitirNota,
    aliquotaNotaPercent,
    impostoNota,
    precoFinal
  }
}

/** Cria uma entrada de cálculo vazia com os padrões dos parâmetros financeiros. */
export function criarEntradaCalculo(
  parametros: ParametrosEncargos & {
    margemLucroPadrao: number
    aliquotaNotaPadrao: number
    consumoVeiculoPadrao: number
    precoCombustivelPadrao: number
    valorRefeicaoPadrao: number
    modoImpostoPadrao: 'gross_up' | 'simples'
  }
): EntradaCalculo {
  return {
    dias: 1,
    maoDeObra: [],
    alimentacao: { ativo: false, qtdPessoas: 0, valorRefeicao: parametros.valorRefeicaoPadrao, modo: 'diario' },
    ferramentas: [],
    combustivel: {
      ativo: false,
      distanciaKm: 0,
      consumoKmL: parametros.consumoVeiculoPadrao,
      precoLitro: parametros.precoCombustivelPadrao,
      modo: 'cheio'
    },
    estadia: { ativo: false, qtdPessoas: 0, valorPorPessoa: 0, modo: 'diario' },
    avulsos: [],
    margemLucroPercent: parametros.margemLucroPadrao,
    emitirNota: false,
    aliquotaNotaPercent: parametros.aliquotaNotaPadrao,
    modoImposto: parametros.modoImpostoPadrao,
    parametros: {
      percentualFerias: parametros.percentualFerias,
      percentualDecimoTerceiro: parametros.percentualDecimoTerceiro,
      percentualFgts: parametros.percentualFgts,
      percentualInss: parametros.percentualInss,
      percentualMultaRescisao: parametros.percentualMultaRescisao,
      custoContratacao: parametros.custoContratacao,
      diasBaseMes: parametros.diasBaseMes
    }
  }
}
