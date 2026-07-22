// Tipos do motor de cálculo de custo de serviço.
// Código puro (sem I/O) — compartilhado entre main e renderer.

/** Modo de aplicação de um custo dentro do serviço. */
export type ModoAplicacao = 'cheio' | 'diario'

/**
 * Regime de pagamento de um grupo de mão de obra.
 * @deprecated Substituído por `BaseMaoDeObra` + o vínculo `clt`. Mantido para ler
 * entradas de cálculo salvas antes da 1.1 (ver `normalizarEntrada`).
 */
export type RegimeMaoDeObra = 'diaria' | 'valor_cheio' | 'clt'

/** Como o pagamento da mão de obra é informado. */
export type BaseMaoDeObra = 'diaria' | 'valor_cheio' | 'mensal'

/** Como o imposto da nota entra na formação do preço. */
export type ModoImposto = 'gross_up' | 'simples'

/**
 * Grupo de mão de obra. Vários grupos podem coexistir (ex.: 3 diaristas + 2 CLT).
 * O significado de `valor` (o que é efetivamente pago ao funcionário) depende de `base`:
 *  - diaria      -> valor da diária por funcionário
 *  - valor_cheio -> valor fechado por funcionário para todo o serviço
 *  - mensal      -> valor MENSAL por funcionário (rateado pelos dias do serviço)
 * O vínculo CLT é independente da base: um funcionário de carteira assinada pode ser
 * pago por diária. Os encargos incidem sempre sobre `salarioCarteira`.
 */
export interface GrupoMaoDeObra {
  id: string
  descricao?: string
  qtdFuncionarios: number
  base: BaseMaoDeObra
  valor: number
  /** Carteira assinada: habilita encargos, contratação e rescisão. */
  clt?: boolean
  /** Salário MENSAL registrado na carteira — base de cálculo dos encargos. */
  salarioCarteira?: number
  /** CLT: houve contratação para este serviço (soma custo de contratação). */
  houveContratacao?: boolean
  /** CLT: será demitido ao fim do serviço (soma custo de rescisão / quebra de contrato). */
  demitidoAoFim?: boolean
  /** @deprecated formato anterior à 1.1; lido por `normalizarEntrada`. */
  regime?: RegimeMaoDeObra
}

/** Uma alimentação dos funcionários (café, almoço, janta…). */
export interface CustoAlimentacao {
  id: string
  descricao?: string
  qtdPessoas: number
  valorRefeicao: number
  /** diario = por dia trabalhado; cheio = valor fechado. */
  modo: ModoAplicacao
  /** @deprecated formato anterior à 1.1 (item único com liga/desliga). */
  ativo?: boolean
}

/** Custo ligado a uma ferramenta: manutenção ou insumo/produto (gasolina, óleo). */
export interface CustoFerramenta {
  id: string
  descricao: string
  tipo: 'manutencao' | 'insumo'
  valor: number
  modo: ModoAplicacao
}

/**
 * Combustível / deslocamento de um veículo (calculado por consumo e preço do litro).
 * Vários podem coexistir quando o serviço usa mais de um carro.
 */
export interface CustoCombustivel {
  id: string
  descricao?: string
  /** cheio = distância total do serviço; diario = distância por dia (multiplicada por dias). */
  distanciaKm: number
  /** Consumo do veículo em km por litro. */
  consumoKmL: number
  /** Preço do litro do combustível. */
  precoLitro: number
  modo: ModoAplicacao
  /** @deprecated formato anterior à 1.1 (item único com liga/desliga). */
  ativo?: boolean
}

/** Como a estadia é cobrada. */
export type TipoEstadia = 'por_pessoa' | 'aluguel'

/**
 * Estadia / hospedagem. Em `por_pessoa` o custo depende de quantas pessoas ficam;
 * em `aluguel` (casa alugada para a obra) depende só do valor mensal e dos meses.
 */
export interface CustoEstadia {
  id: string
  descricao?: string
  tipo: TipoEstadia
  qtdPessoas: number
  valorPorPessoa: number
  /** diario = por noite (multiplica por dias); cheio = valor fechado. */
  modo: ModoAplicacao
  /** Aluguel: valor mensal do imóvel. */
  valorMensal?: number
  /** Aluguel: quantidade de meses (aceita fração, ex.: 1,5). */
  qtdMeses?: number
  /** @deprecated formato anterior à 1.1 (item único com liga/desliga). */
  ativo?: boolean
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
  alimentacoes: CustoAlimentacao[]
  ferramentas: CustoFerramenta[]
  combustiveis: CustoCombustivel[]
  estadias: CustoEstadia[]
  avulsos: CustoAvulso[]
  margemLucroPercent: number
  emitirNota: boolean
  aliquotaNotaPercent: number
  modoImposto: ModoImposto
  parametros: ParametrosEncargos
  /** @deprecated item único do formato anterior à 1.1; lido por `normalizarEntrada`. */
  alimentacao?: CustoAlimentacao
  /** @deprecated item único do formato anterior à 1.1; lido por `normalizarEntrada`. */
  combustivel?: CustoCombustivel
  /** @deprecated item único do formato anterior à 1.1; lido por `normalizarEntrada`. */
  estadia?: CustoEstadia
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
