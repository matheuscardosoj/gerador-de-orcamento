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
  const personalizados = new Map<string, number>(
    e.avulsos
      .filter((a) => a.aplicarAcrescimo !== false && a.acrescimoPersonalizadoPercent != null)
      .map((a) => [`avulso:${a.id}`, a.acrescimoPersonalizadoPercent!] as const)
  )
  const custoPersonalizado = round2(
    linhas.filter((l) => personalizados.has(l.chave)).reduce((s, l) => s + l.valor, 0)
  )
  const valorMargemGeral = round2(
    (custoComAcrescimo - custoPersonalizado) * (margemLucroPercent / 100)
  )
  const valorMargemPersonalizada = round2(
    linhas.reduce((s, l) => s + round2(l.valor * ((personalizados.get(l.chave) ?? 0) / 100)), 0)
  )
  const valorMargem = round2(valorMargemGeral + valorMargemPersonalizada)
  const ajustePreco = Math.max(0, round2(e.ajustePreco ?? 0))
  const precoComMargem = round2(custoTotal + valorMargem + ajustePreco)

  // Rateio em centavos preserva o total histórico do acréscimo geral, inclusive
  // quando arredondar cada item isoladamente produziria um centavo a mais.
  const avulsos = new Map(e.avulsos.map((a) => [`avulso:${a.id}`, a]))
  const gruposGerais = linhas.filter((l) => !repasses.has(l.chave) && !personalizados.has(l.chave))
  const rateio = gruposGerais.map((l) => {
    const exato = l.valor * margemLucroPercent
    return {
      chave: l.chave,
      centavos: Math.floor(exato + 1e-8),
      fracao: exato - Math.floor(exato + 1e-8)
    }
  })
  let restantes = Math.round(valorMargemGeral * 100) - rateio.reduce((s, l) => s + l.centavos, 0)
  for (const item of [...rateio].sort(
    (a, b) => b.fracao - a.fracao || a.chave.localeCompare(b.chave)
  )) {
    if (restantes <= 0) break
    item.centavos++
    restantes--
  }
  const geraisPorLinha = new Map(rateio.map((l) => [l.chave, l.centavos / 100]))
  let acrescimoAvulsos = 0
  const linhasApresentadas = linhas.map((l) => {
    const avulso = avulsos.get(l.chave)
    if (!avulso) return { ...l, valorApresentado: l.valor }
    const percentual =
      avulso.aplicarAcrescimo === false
        ? 0
        : (avulso.acrescimoPersonalizadoPercent ?? margemLucroPercent)
    const acrescimo = personalizados.has(l.chave)
      ? round2((l.valor * percentual) / 100)
      : (geraisPorLinha.get(l.chave) ?? 0)
    acrescimoAvulsos += acrescimo
    return {
      ...l,
      valorApresentado: round2(l.valor + acrescimo),
      acrescimoAplicado: acrescimo,
      detalhe: `${l.detalhe}. Custo original: ${formatMoeda(l.valor)}; lucro aplicado de ${percentual}%: ${formatMoeda(acrescimo)}.`
    }
  })
  const custoServicoExibido = round2(custoTotal + acrescimoAvulsos)
  const acrescimoGeralExibido = round2(valorMargem - acrescimoAvulsos)
  const custoServico = round2(
    linhas.filter((l) => !avulsos.has(l.chave)).reduce((s, l) => s + l.valor, 0)
  )
  const outrosCustosRepasses = round2(
    linhasApresentadas
      .filter((l) => avulsos.has(l.chave))
      .reduce((s, l) => s + (l.valorApresentado ?? l.valor), 0)
  )
  const lucroServico = round2(
    [...geraisPorLinha]
      .filter(([chave]) => !avulsos.has(chave))
      .reduce((s, [, valor]) => s + valor, 0)
  )

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

  // Na meta explícita, o imposto é extraído do preço desejado. Assim os
  // arredondamentos fecham a decomposição em centavos, mesmo nos saltos do gross-up.
  let metaAplicada = false
  if (Number.isFinite(e.precoFinalDesejado) && (e.precoFinalDesejado ?? 0) >= 0) {
    const alvo = round2(e.precoFinalDesejado!)
    const impostoAlvo = impostoParaMeta(e, alvo)
    if (round2(precoComMargem + impostoAlvo) === alvo) {
      impostoNota = impostoAlvo
      precoFinal = alvo
      metaAplicada = true
    }
  }
  return {
    acrescimoGeralExibido,
    ajustePreco,
    lucroItensAdicionais: round2(acrescimoAvulsos),
    metaAplicada,
    valorMargemGeral,
    valorMargemPersonalizada,
    custoComAcrescimo,
    custoRepassado,
    custoServico,
    outrosCustosRepasses,
    lucroServico,
    custoServicoExibido,
    breakdown: linhasApresentadas,
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

/** Imposto contido na meta final, respeitando a modalidade já escolhida. */
function impostoParaMeta(e: EntradaCalculo, alvo: number): number {
  if (!e.emitirNota || e.aliquotaNotaPercent <= 0) return 0
  const taxa = e.aliquotaNotaPercent / 100
  return round2(e.modoImposto === 'gross_up' ? alvo * taxa : (alvo * taxa) / (1 + taxa))
}

/** Invalida somente o ajuste por meta; mantém o percentual geral calculado. */
export function retirarMetaPreco(e: EntradaCalculo): EntradaCalculo {
  const { precoFinalDesejado: _meta, ajustePreco: _ajuste, ...resto } = e
  return resto
}

export type ResultadoMetaPreco = { alterado: boolean; entrada: EntradaCalculo; mensagem: string }
/** Ajusta somente o percentual geral. Percentuais próprios e repasses são preservados. */
export function atingirPrecoDesejado(
  entrada: EntradaCalculo,
  desejado: number
): ResultadoMetaPreco {
  if (
    !Number.isFinite(desejado) ||
    desejado <= 0 ||
    !Number.isSafeInteger(Math.round(desejado * 100))
  )
    throw new Error('Informe um preço desejado válido, maior que zero.')
  if (
    !Number.isFinite(entrada.aliquotaNotaPercent) ||
    entrada.aliquotaNotaPercent < 0 ||
    entrada.aliquotaNotaPercent > 100 ||
    (entrada.emitirNota && entrada.modoImposto === 'gross_up' && entrada.aliquotaNotaPercent >= 100)
  )
    throw new Error('Revise a alíquota do imposto antes de calcular o preço desejado.')
  const alvo = round2(desejado)
  const atual = calcularCustoServico(entrada)
  if (atual.precoFinal === alvo)
    return {
      alterado: false,
      entrada,
      mensagem: 'O preço atual já é igual ao desejado. Nenhuma alteração foi feita.'
    }
  const limpa = retirarMetaPreco(normalizarEntrada(entrada))
  const semGeral = calcularCustoServico({ ...limpa, margemLucroPercent: 0 })
  const baseGeral = round2(
    (semGeral.custoComAcrescimo ?? 0) -
      limpa.avulsos
        .filter((a) => a.aplicarAcrescimo !== false && a.acrescimoPersonalizadoPercent != null)
        .reduce((s, a) => s + round2(a.valor * (a.modo === 'diario' ? limpa.dias : 1)), 0)
  )
  const liquido = round2(alvo - impostoParaMeta(limpa, alvo))
  const disponivel = round2(liquido - semGeral.precoComMargem)
  if (alvo < semGeral.precoFinal) {
    const nova = {
      ...limpa,
      margemLucroPercent: 0,
      precoFinalDesejado: alvo,
      ajustePreco: 0
    }
    return {
      alterado: true,
      entrada: nova,
      mensagem: `A meta não cobre o custo do serviço, os outros custos e repasses com seus percentuais próprios e o imposto. O preço mínimo foi aplicado: ${formatMoeda(semGeral.precoFinal)}.`
    }
  }
  let percentual =
    baseGeral > 0
      ? Math.max(0, Math.floor((disponivel / baseGeral) * 100 * 1e10) / 1e10)
      : limpa.margemLucroPercent
  if (!Number.isFinite(percentual))
    throw new Error('O percentual calculado excede o limite numérico. Revise os valores.')
  let calculado = calcularCustoServico({ ...limpa, margemLucroPercent: percentual })
  // Protege a fronteira de arredondamento sem reduzir percentuais próprios.
  if (calculado.precoComMargem > liquido && baseGeral > 0) {
    let inferior = 0,
      superior = percentual
    for (let i = 0; i < 64; i++) {
      const meio = (inferior + superior) / 2
      if (calcularCustoServico({ ...limpa, margemLucroPercent: meio }).precoComMargem <= liquido)
        inferior = meio
      else superior = meio
    }
    percentual = Math.floor(inferior * 1e10) / 1e10
    calculado = calcularCustoServico({ ...limpa, margemLucroPercent: percentual })
  }
  const nova = {
    ...limpa,
    margemLucroPercent: percentual,
    precoFinalDesejado: alvo,
    ajustePreco: Math.max(0, round2(liquido - calculado.precoComMargem))
  }
  const resultado = calcularCustoServico(nova)
  if (!resultado.metaAplicada || resultado.precoFinal !== alvo)
    throw new Error('Não foi possível fechar o preço desejado. Revise os valores.')
  return {
    alterado: true,
    entrada: nova,
    mensagem: 'Preço desejado aplicado. Os percentuais próprios e repasses foram preservados.'
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
