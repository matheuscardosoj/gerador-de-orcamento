// Tipos do motor de cálculo de custo de serviço.
// Código puro (sem I/O) — compartilhado entre main e renderer.

/** Modo de aplicação de um custo dentro do serviço. */
export type ModoAplicacao = 'cheio' | 'diario'

/** Regime de pagamento de um grupo de mão de obra. */
export type RegimeMaoDeObra = 'diaria' | 'valor_cheio' | 'clt'

/** Como o imposto da nota entra na formação do preço. */
export type ModoImposto = 'gross_up' | 'simples'

/**
 * Grupo de mão de obra. Vários grupos podem coexistir (ex.: 3 diaristas + 2 CLT).
 * O significado de `valor` depende do regime:
 *  - diaria      -> valor da diária por funcionário
 *  - valor_cheio -> valor fechado por funcionário para todo o serviço
 *  - clt         -> salário MENSAL por funcionário
 */
export interface GrupoMaoDeObra {
  id: string
  descricao?: string
  qtdFuncionarios: number
  regime: RegimeMaoDeObra
  valor: number
  /** CLT: houve contratação para este serviço (soma custo de contratação). */
  houveContratacao?: boolean
  /** CLT: será demitido ao fim do serviço (soma custo de rescisão / quebra de contrato). */
  demitidoAoFim?: boolean
}

/** Alimentação (almoço) dos funcionários. */
export interface CustoAlimentacao {
  ativo: boolean
  qtdPessoas: number
  valorRefeicao: number
  /** diario = por dia trabalhado; cheio = valor fechado. */
  modo: ModoAplicacao
}

/** Custo ligado a uma ferramenta: manutenção ou insumo/produto (gasolina, óleo). */
export interface CustoFerramenta {
  id: string
  descricao: string
  tipo: 'manutencao' | 'insumo'
  valor: number
  modo: ModoAplicacao
}

/** Combustível / deslocamento (calculado por consumo do veículo e preço do litro). */
export interface CustoCombustivel {
  ativo: boolean
  /** cheio = distância total do serviço; diario = distância por dia (multiplicada por dias). */
  distanciaKm: number
  /** Consumo do veículo em km por litro. */
  consumoKmL: number
  /** Preço do litro do combustível. */
  precoLitro: number
  modo: ModoAplicacao
}

/** Estadia / hospedagem. */
export interface CustoEstadia {
  ativo: boolean
  qtdPessoas: number
  valorPorPessoa: number
  /** diario = por noite (multiplica por dias); cheio = valor fechado. */
  modo: ModoAplicacao
}

/** Custo avulso/personalizado (dá a maleabilidade). */
export interface CustoAvulso {
  id: string
  descricao: string
  valor: number
  modo: ModoAplicacao
}

/**
 * Percentuais de encargos e custos padrão usados no cálculo de mão de obra CLT.
 * Todos os percentuais são aplicados sobre o custo de mão de obra base do período
 * (aproximação transparente e configurável pelo usuário).
 */
export interface ParametrosEncargos {
  percentualFerias: number
  percentualDecimoTerceiro: number
  percentualFgts: number
  percentualInss: number
  percentualMultaRescisao: number
  custoContratacao: number
  /** Divisor para converter salário mensal em custo por dia (ex.: 30). */
  diasBaseMes: number
}

/** Entrada completa do cálculo de um serviço. */
export interface EntradaCalculo {
  dias: number
  maoDeObra: GrupoMaoDeObra[]
  alimentacao: CustoAlimentacao
  ferramentas: CustoFerramenta[]
  combustivel: CustoCombustivel
  estadia: CustoEstadia
  avulsos: CustoAvulso[]
  margemLucroPercent: number
  emitirNota: boolean
  aliquotaNotaPercent: number
  modoImposto: ModoImposto
  parametros: ParametrosEncargos
}

/** Uma linha do detalhamento (breakdown) do custo. */
export interface LinhaBreakdown {
  chave: string
  descricao: string
  valor: number
  detalhe?: string
}

/** Resultado do cálculo. */
export interface ResultadoCalculo {
  breakdown: LinhaBreakdown[]
  custoTotal: number
  margemLucroPercent: number
  valorMargem: number
  precoComMargem: number
  emitirNota: boolean
  aliquotaNotaPercent: number
  impostoNota: number
  precoFinal: number
}
