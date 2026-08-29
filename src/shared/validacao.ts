import type {
  EntradaCalculo,
  ItemMaterial,
  ItemServico,
  LancamentoRelatorio,
  Orcamento,
  ParametrosFinanceiros,
  Relatorio
} from './types'
import { normalizarDataCivil } from './format'

export interface ErroValidacao {
  campo: string
  mensagem: string
}

const percentual = (valor: number): boolean => Number.isFinite(valor) && valor >= 0 && valor <= 100
const naoNegativo = (valor: number): boolean => Number.isFinite(valor) && valor >= 0
const positivo = (valor: number): boolean => Number.isFinite(valor) && valor > 0

export function normalizarEspacos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\s+/g, ' ').trim()
}

export function normalizarTextoLivre(valor: string | null | undefined): string {
  return (valor ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

const normalizarServico = (item: ItemServico): ItemServico => ({
  ...item,
  descricao: normalizarEspacos(item.descricao),
  unidade: normalizarEspacos(item.unidade)
})

const normalizarMaterial = (item: ItemMaterial): ItemMaterial => ({
  ...item,
  unidade: normalizarEspacos(item.unidade),
  especificacao: normalizarEspacos(item.especificacao)
})

const normalizarLancamento = (item: LancamentoRelatorio): LancamentoRelatorio => ({
  ...item,
  descricao: normalizarEspacos(item.descricao)
})

export function normalizarOrcamento<T extends Orcamento>(orcamento: T): T {
  return {
    ...orcamento,
    data: normalizarDataCivil(orcamento.data),
    destinatario: normalizarEspacos(orcamento.destinatario),
    titulo: normalizarEspacos(orcamento.titulo),
    introducao: normalizarTextoLivre(orcamento.introducao),
    observacaoInterna: normalizarTextoLivre(orcamento.observacaoInterna),
    itensServico: orcamento.itensServico.map(normalizarServico),
    materiais: orcamento.materiais.map(normalizarMaterial),
    observacoes: orcamento.observacoes.map((item) => ({
      ...item,
      texto: normalizarTextoLivre(item.texto)
    })),
    pagamentos: orcamento.pagamentos.map((item) => ({
      ...item,
      texto: normalizarTextoLivre(item.texto)
    }))
  }
}

export function normalizarRelatorio<T extends Relatorio>(relatorio: T): T {
  return {
    ...relatorio,
    data: normalizarDataCivil(relatorio.data),
    destinatario: normalizarEspacos(relatorio.destinatario),
    titulo: normalizarEspacos(relatorio.titulo),
    introducao: normalizarTextoLivre(relatorio.introducao),
    observacaoInterna: normalizarTextoLivre(relatorio.observacaoInterna),
    itensServico: relatorio.itensServico.map(normalizarServico),
    adiantamentos: relatorio.adiantamentos.map(normalizarLancamento),
    reembolsos: relatorio.reembolsos.map(normalizarLancamento),
    observacoes: relatorio.observacoes.map((item) => ({
      ...item,
      texto: normalizarTextoLivre(item.texto)
    })),
    pagamentos: relatorio.pagamentos.map((item) => ({
      ...item,
      texto: normalizarTextoLivre(item.texto)
    }))
  }
}

function dataValida(data: string): boolean {
  const civil = normalizarDataCivil(data)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civil)) return false
  const [ano, mes, dia] = civil.split('-').map(Number)
  const valor = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    valor.getUTCFullYear() === ano && valor.getUTCMonth() === mes - 1 && valor.getUTCDate() === dia
  )
}

function validarServicos(itens: ItemServico[]): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  if (itens.length === 0) {
    erros.push({ campo: 'itensServico', mensagem: 'Adicione ao menos um serviço válido.' })
    return erros
  }
  itens.forEach((item, indice) => {
    const prefixo = `itensServico.${indice}`
    if (!normalizarEspacos(item.descricao))
      erros.push({
        campo: `${prefixo}.descricao`,
        mensagem: `Informe a descrição do serviço ${indice + 1}.`
      })
    if (!normalizarEspacos(item.unidade))
      erros.push({
        campo: `${prefixo}.unidade`,
        mensagem: `Informe a unidade do serviço ${indice + 1}.`
      })
    if (!positivo(item.quantidade))
      erros.push({
        campo: `${prefixo}.quantidade`,
        mensagem: `A quantidade do serviço ${indice + 1} deve ser maior que zero.`
      })
    if (!naoNegativo(item.valorUnitario))
      erros.push({
        campo: `${prefixo}.valorUnitario`,
        mensagem: `O valor unitário do serviço ${indice + 1} não pode ser negativo.`
      })
    if (!positivo(item.valorTotal))
      erros.push({
        campo: `${prefixo}.valorTotal`,
        mensagem: `O total do serviço ${indice + 1} deve ser maior que zero.`
      })
  })
  return erros
}

function validarMateriais(itens: ItemMaterial[]): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  itens.forEach((item, indice) => {
    const prefixo = `materiais.${indice}`
    if (!positivo(item.quantidade))
      erros.push({
        campo: `${prefixo}.quantidade`,
        mensagem: `A quantidade do material ${indice + 1} deve ser maior que zero.`
      })
    if (!normalizarEspacos(item.unidade))
      erros.push({
        campo: `${prefixo}.unidade`,
        mensagem: `Informe a unidade do material ${indice + 1}.`
      })
    if (!normalizarEspacos(item.especificacao))
      erros.push({
        campo: `${prefixo}.especificacao`,
        mensagem: `Informe a especificação do material ${indice + 1}.`
      })
  })
  return erros
}

function validarLancamentos(
  campo: string,
  nome: string,
  itens: LancamentoRelatorio[]
): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  itens.forEach((item, indice) => {
    if (!normalizarEspacos(item.descricao))
      erros.push({
        campo: `${campo}.${indice}.descricao`,
        mensagem: `Informe a descrição do ${nome} ${indice + 1}.`
      })
    if (!positivo(item.valor))
      erros.push({
        campo: `${campo}.${indice}.valor`,
        mensagem: `O valor do ${nome} ${indice + 1} deve ser maior que zero.`
      })
  })
  return erros
}

function validarCabecalho(
  documento: Pick<Orcamento, 'destinatario' | 'data' | 'titulo'>
): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  if (!normalizarEspacos(documento.destinatario))
    erros.push({ campo: 'destinatario', mensagem: 'Informe o destinatário.' })
  if (!dataValida(documento.data))
    erros.push({ campo: 'data', mensagem: 'Informe uma data válida.' })
  if (!normalizarEspacos(documento.titulo))
    erros.push({ campo: 'titulo', mensagem: 'Informe o título.' })
  return erros
}

export function validarOrcamentoFinal(orcamento: Orcamento): ErroValidacao[] {
  return [
    ...validarCabecalho(orcamento),
    ...validarServicos(orcamento.itensServico),
    ...validarMateriais(orcamento.materiais)
  ]
}

export function validarRelatorioFinal(relatorio: Relatorio): ErroValidacao[] {
  return [
    ...validarCabecalho(relatorio),
    ...validarServicos(relatorio.itensServico),
    ...validarLancamentos('adiantamentos', 'adiantamento', relatorio.adiantamentos),
    ...validarLancamentos('reembolsos', 'reembolso', relatorio.reembolsos)
  ]
}

export function validarParametrosFinanceiros(parametros: ParametrosFinanceiros): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  const percentuais: Array<[keyof ParametrosFinanceiros, string]> = [
    ['percentualFerias', 'Férias'],
    ['percentualDecimoTerceiro', '13º salário'],
    ['percentualFgts', 'FGTS'],
    ['percentualInss', 'INSS patronal'],
    ['percentualMultaRescisao', 'Provisão rescisória'],
    ['margemLucroPadrao', 'Acréscimo sobre o custo'],
    ['aliquotaNotaPadrao', 'Alíquota NFS']
  ]
  for (const [campo, rotulo] of percentuais) {
    if (!percentual(parametros[campo] as number))
      erros.push({ campo, mensagem: `${rotulo} deve estar entre 0% e 100%.` })
  }
  if (parametros.modoImpostoPadrao === 'gross_up' && parametros.aliquotaNotaPadrao >= 100)
    erros.push({
      campo: 'aliquotaNotaPadrao',
      mensagem: 'A alíquota do gross-up deve ser menor que 100%.'
    })
  if (
    !Number.isInteger(parametros.diasBaseMes) ||
    parametros.diasBaseMes < 1 ||
    parametros.diasBaseMes > 31
  )
    erros.push({ campo: 'diasBaseMes', mensagem: 'Os dias-base devem estar entre 1 e 31.' })
  const custos: Array<[keyof ParametrosFinanceiros, string]> = [
    ['custoContratacao', 'Custo de contratação'],
    ['consumoVeiculoPadrao', 'Consumo do veículo'],
    ['precoCombustivelPadrao', 'Preço do combustível'],
    ['valorRefeicaoPadrao', 'Valor da refeição']
  ]
  for (const [campo, rotulo] of custos) {
    if (!naoNegativo(parametros[campo] as number))
      erros.push({ campo, mensagem: `${rotulo} não pode ser negativo.` })
  }
  return erros
}

export function validarEntradaCalculo(entrada: EntradaCalculo): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  if (!positivo(entrada.dias))
    erros.push({ campo: 'dias', mensagem: 'Os dias de serviço devem ser maiores que zero.' })
  if (!percentual(entrada.margemLucroPercent))
    erros.push({
      campo: 'margemLucroPercent',
      mensagem: 'O acréscimo sobre o custo deve estar entre 0% e 100%.'
    })
  if (!percentual(entrada.aliquotaNotaPercent))
    erros.push({
      campo: 'aliquotaNotaPercent',
      mensagem: 'A alíquota da nota deve estar entre 0% e 100%.'
    })
  if (
    entrada.emitirNota &&
    entrada.modoImposto === 'gross_up' &&
    entrada.aliquotaNotaPercent >= 100
  )
    erros.push({
      campo: 'aliquotaNotaPercent',
      mensagem: 'A alíquota do gross-up deve ser menor que 100%.'
    })

  const p = entrada.parametros
  const params: ParametrosFinanceiros = {
    ...p,
    aliquotaNotaPadrao: entrada.aliquotaNotaPercent,
    margemLucroPadrao: entrada.margemLucroPercent,
    consumoVeiculoPadrao: 0,
    precoCombustivelPadrao: 0,
    valorRefeicaoPadrao: 0,
    modoImpostoPadrao: entrada.modoImposto
  }
  erros.push(
    ...validarParametrosFinanceiros(params).filter(
      (erro) =>
        !['consumoVeiculoPadrao', 'precoCombustivelPadrao', 'valorRefeicaoPadrao'].includes(
          erro.campo
        )
    )
  )

  entrada.maoDeObra.forEach((item, indice) => {
    if (!positivo(item.qtdFuncionarios))
      erros.push({
        campo: `maoDeObra.${indice}.qtdFuncionarios`,
        mensagem: `A quantidade de funcionários do item ${indice + 1} deve ser maior que zero.`
      })
    if (!naoNegativo(item.valor))
      erros.push({
        campo: `maoDeObra.${indice}.valor`,
        mensagem: `O custo de mão de obra do item ${indice + 1} não pode ser negativo.`
      })
    if (item.clt && !naoNegativo(item.salarioCarteira ?? 0))
      erros.push({
        campo: `maoDeObra.${indice}.salarioCarteira`,
        mensagem: `O salário registrado do item ${indice + 1} não pode ser negativo.`
      })
  })
  const custos = [
    ...entrada.alimentacoes.map((item) => [item.qtdPessoas, item.valorRefeicao] as const),
    ...entrada.ferramentas.map((item) => [1, item.valor] as const),
    ...entrada.combustiveis.map(
      (item) => [item.consumoKmL, item.precoLitro, item.distanciaKm] as const
    ),
    ...entrada.avulsos.map((item) => [1, item.valor] as const)
  ]
  custos.forEach((valores, indice) => {
    if (valores.some((valor) => !naoNegativo(valor)))
      erros.push({
        campo: `custos.${indice}`,
        mensagem: `Os custos e quantidades utilizados não podem ser negativos.`
      })
  })
  entrada.estadias.forEach((item, indice) => {
    const valores =
      item.tipo === 'aluguel'
        ? [item.qtdMeses ?? 0, item.valorMensal ?? 0]
        : [item.qtdPessoas, item.valorPorPessoa]
    if (valores.some((valor) => !naoNegativo(valor)))
      erros.push({
        campo: `estadias.${indice}`,
        mensagem: `Os custos e quantidades da estadia ${indice + 1} não podem ser negativos.`
      })
  })
  return erros
}

export function mensagemValidacao(erros: ErroValidacao[]): string {
  return erros.map((erro) => erro.mensagem).join(' ')
}

export function exigirValidacao(erros: ErroValidacao[]): void {
  if (erros.length) throw new Error(mensagemValidacao(erros))
}

export function validarUrlOllamaLocal(valor: string): ErroValidacao[] {
  try {
    const url = new URL(valor)
    const locais = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
    if (url.protocol !== 'http:' || !locais.has(url.hostname) || url.username || url.password)
      throw new Error()
    return []
  } catch {
    return [
      {
        campo: 'urlOllama',
        mensagem: 'O Ollama deve usar uma URL HTTP local (localhost, 127.0.0.1 ou ::1).'
      }
    ]
  }
}
