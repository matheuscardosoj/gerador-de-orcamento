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
function custoMaoDeObra(g: GrupoMaoDeObra, dias: number, p: ParametrosEncargos): LinhaBreakdown[] {
  const linhas: LinhaBreakdown[] = []
  const qtd = Math.max(0, g.qtdFuncionarios || 0)
  const nome = g.descricao?.trim() || 'Mão de obra'
  const diasMes = p.diasBaseMes || 30

  // 1) O que é efetivamente pago, conforme a forma de pagamento combinada.
  if (g.base === 'valor_cheio') {
    linhas.push({
      chave: `mo:${g.id}`,
      descricao: g.descricao?.trim() ? nome : `${nome} (valor fechado)`,
      valor: g.valor * qtd,
      detalhe: `${qtd} func. × ${formatMoeda(g.valor)}`
    })
  } else if (g.base === 'mensal') {
    linhas.push({
      chave: `mo:${g.id}`,
      descricao: g.descricao?.trim() ? nome : `${nome} (salário proporcional)`,
      valor: (g.valor / diasMes) * dias * qtd,
      detalhe: `${qtd} func. × ${dias}/${diasMes} do valor mensal ${formatMoeda(g.valor)}`
    })
  } else {
    linhas.push({
      chave: `mo:${g.id}`,
      descricao: g.descricao?.trim() ? nome : `${nome} (diária)`,
      valor: g.valor * dias * qtd,
      detalhe: `${qtd} func. × ${dias} dia(s) × ${formatMoeda(g.valor)}`
    })
  }

  if (!g.clt) return linhas

  // 2) CLT: encargos incidem sobre o salário registrado na carteira (que pode ser
  // diferente do valor pago), proporcional ao período do serviço.
  const salarioCarteira = g.salarioCarteira ?? (g.base === 'mensal' ? g.valor : 0)
  const baseEncargos = (salarioCarteira / diasMes) * dias * qtd

  const encPct =
    (p.percentualFerias || 0) +
    (p.percentualDecimoTerceiro || 0) +
    (p.percentualFgts || 0) +
    (p.percentualInss || 0)
  if (encPct > 0) {
    linhas.push({
      chave: `mo:${g.id}:enc`,
      descricao: `Encargos CLT (${round2(encPct)}%)`,
      valor: baseEncargos * (encPct / 100),
      detalhe: `Férias, 13º, FGTS e INSS sobre a carteira de ${formatMoeda(salarioCarteira)}/mês no período`
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
      descricao: `Provisão rescisória estimada (${round2(p.percentualMultaRescisao)}%)`,
      valor: baseEncargos * (p.percentualMultaRescisao / 100),
      detalhe: 'Estimativa configurável sobre a base salarial do período'
    })
  }

  return linhas
}

/**
 * Adapta entradas salvas antes da 1.1 (item único de alimentação/combustível/estadia
 * e `regime` de mão de obra) para o formato atual. É idempotente: uma entrada já no
 * formato novo passa inalterada.
 */
export function normalizarEntrada(e: EntradaCalculo): EntradaCalculo {
  const alimentacoes = e.alimentacoes ? [...e.alimentacoes] : []
  const combustiveis = e.combustiveis ? [...e.combustiveis] : []
  const estadias = e.estadias ? [...e.estadias] : []

  if (e.alimentacao && e.alimentacao.ativo !== false) {
    const { ativo: _ativo, ...resto } = e.alimentacao
    alimentacoes.unshift({ ...resto, id: resto.id || 'legado' })
  }
  if (e.combustivel && e.combustivel.ativo !== false) {
    const { ativo: _ativo, ...resto } = e.combustivel
    combustiveis.unshift({ ...resto, id: resto.id || 'legado' })
  }
  if (e.estadia && e.estadia.ativo !== false) {
    const { ativo: _ativo, ...resto } = e.estadia
    estadias.unshift({ ...resto, id: resto.id || 'legado', tipo: resto.tipo ?? 'por_pessoa' })
  }

  const maoDeObra = (e.maoDeObra ?? []).map((g) => {
    if (g.base) return g
    const { regime: _regime, ...resto } = g
    return g.regime === 'clt'
      ? { ...resto, base: 'mensal' as const, clt: true, salarioCarteira: g.valor }
      : { ...resto, base: (g.regime ?? 'diaria') as 'diaria' | 'valor_cheio', clt: false }
  })

  const { alimentacao: _a, combustivel: _c, estadia: _es, ...resto } = e
  return {
    ...resto,
    maoDeObra,
    alimentacoes,
    combustiveis,
    estadias,
    ferramentas: e.ferramentas ?? [],
    avulsos: e.avulsos ?? []
  }
}

/**
 * Calcula o custo total de um serviço, aplica o acréscimo sobre custo e o imposto da
 * nota (quando houver), retornando o preço final e o detalhamento.
 */
export function calcularCustoServico(entrada: EntradaCalculo): ResultadoCalculo {
  const e = normalizarEntrada(entrada)
  const dias = Math.max(0, e.dias || 0)
  const breakdown: LinhaBreakdown[] = []

  // 1) Mão de obra
  for (const g of e.maoDeObra) {
    breakdown.push(...custoMaoDeObra(g, dias, e.parametros))
  }

  // 2) Alimentações
  for (const a of e.alimentacoes) {
    const mult = a.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: `alimentacao:${a.id}`,
      descricao: a.descricao?.trim() || 'Alimentação',
      valor: a.valorRefeicao * a.qtdPessoas * mult,
      detalhe: `${a.qtdPessoas} pessoa(s) × ${a.modo === 'diario' ? `${dias} dia(s)` : 'valor fechado'} × ${formatMoeda(a.valorRefeicao)}`
    })
  }

  // 3) Ferramentas (manutenção / insumos)
  for (const f of e.ferramentas) {
    const mult = f.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: `ferramenta:${f.id}`,
      descricao: `${f.tipo === 'manutencao' ? 'Manutenção' : 'Insumo'} — ${f.descricao || 'ferramenta'}`,
      valor: f.valor * mult,
      detalhe: f.modo === 'diario' ? `${formatMoeda(f.valor)} × ${dias} dia(s)` : 'valor fechado'
    })
  }

  // 4) Combustível / deslocamento (litros = distância / consumo; custo = litros × preço)
  for (const c of e.combustiveis) {
    const km = c.modo === 'diario' ? c.distanciaKm * dias : c.distanciaKm
    const litros = c.consumoKmL > 0 ? km / c.consumoKmL : 0
    breakdown.push({
      chave: `combustivel:${c.id}`,
      descricao: c.descricao?.trim() || 'Combustível / deslocamento',
      valor: litros * c.precoLitro,
      detalhe: `${km} km ÷ ${c.consumoKmL} km/l = ${litros.toFixed(1)} L × ${formatMoeda(c.precoLitro)}${c.modo === 'diario' ? ` (${c.distanciaKm} km/dia × ${dias} dia(s))` : ''}`
    })
  }

  // 5) Estadias / hospedagem (por pessoa ou aluguel de imóvel por mês)
  for (const s of e.estadias) {
    if (s.tipo === 'aluguel') {
      const meses = s.qtdMeses ?? 0
      breakdown.push({
        chave: `estadia:${s.id}`,
        descricao: s.descricao?.trim() || 'Aluguel de imóvel',
        valor: (s.valorMensal ?? 0) * meses,
        detalhe: `${meses} mês(es) × ${formatMoeda(s.valorMensal ?? 0)}/mês`
      })
      continue
    }
    const mult = s.modo === 'diario' ? dias : 1
    breakdown.push({
      chave: `estadia:${s.id}`,
      descricao: s.descricao?.trim() || 'Estadia / hospedagem',
      valor: s.valorPorPessoa * s.qtdPessoas * mult,
      detalhe: `${s.qtdPessoas} pessoa(s) × ${s.modo === 'diario' ? `${dias} diária(s)` : 'valor fechado'} × ${formatMoeda(s.valorPorPessoa)}`
    })
  }

  // 6) Custos avulsos
  for (const av of e.avulsos) {
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
  const repasses = new Set(
    e.avulsos.filter((a) => a.aplicarAcrescimo === false).map((a) => `avulso:${a.id}`)
  )
  const custoRepassado = round2(
    linhas.filter((l) => repasses.has(l.chave)).reduce((s, l) => s + l.valor, 0)
  )
  const custoComAcrescimo = round2(custoTotal - custoRepassado)
  const valorMargem = round2(custoComAcrescimo * (margemLucroPercent / 100))
  const precoComMargem = round2(custoTotal + valorMargem)

  // Imposto da nota: incide sobre o faturamento.
  //  - gross_up: divide por (1 - alíquota) para preservar o valor líquido (padrão).
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
    custoComAcrescimo,
    custoRepassado,
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
    alimentacoes: [],
    ferramentas: [],
    combustiveis: [],
    estadias: [],
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
