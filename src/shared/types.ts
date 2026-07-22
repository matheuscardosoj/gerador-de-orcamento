// Entidades de domínio compartilhadas entre main e renderer.
import type { EntradaCalculo, ResultadoCalculo, ParametrosEncargos, ModoImposto } from './calculo/types'

export * from './calculo/types'

/** Cabeçalho / dados fixos da empresa (singleton). */
export interface EmpresaConfig {
  nome: string
  razaoSocial: string
  endereco: string
  telefones: string
  email: string
  site: string
  cnpj: string
  /** Logo embutida como data URL (evita depender de caminho de arquivo). */
  logoDataUrl: string | null
  /** Texto que aparece no rodapé/assinatura (nome da empresa). */
  textoAssinatura: string
  /** Cor da faixa do rodapé (verde-petróleo por padrão). */
  corFaixaRodape: string
  /** Qual nome exibir no menu do aplicativo: nome fantasia ou razão social. */
  nomeExibicao: 'nome' | 'razaoSocial'
}

/** Parâmetros financeiros globais (singleton). Estende os encargos com os padrões de preço. */
export interface ParametrosFinanceiros extends ParametrosEncargos {
  aliquotaNotaPadrao: number
  margemLucroPadrao: number
  /** Consumo padrão do veículo, em km por litro. */
  consumoVeiculoPadrao: number
  /** Preço padrão do litro do combustível. */
  precoCombustivelPadrao: number
  valorRefeicaoPadrao: number
  modoImpostoPadrao: ModoImposto
}

export interface Cliente {
  id: string
  nome: string
  /** Tratamento no documento: "A", "Ao Sr.", "À Sra.", "Aos cuidados de"... */
  tratamento: string
  contato?: string
  observacao?: string
  criadoEm: string
}

export interface ServicoCatalogo {
  id: string
  nome: string
  descricaoPadrao: string
  /** Unidade de medida: "metro linear", "m²", "unidade", "diária"... */
  unidade: string
  precoReferencia: number | null
}

export interface ObservacaoPadrao {
  id: string
  texto: string
  /** Se vem marcada por padrão em novos orçamentos. */
  padrao: boolean
}

export interface FormaPagamentoPadrao {
  id: string
  texto: string
  padrao: boolean
}

export type FormatoOrcamento = 'carta' | 'tabela'
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado'

/** Detalhamento do cálculo salvo junto ao item (permite reabrir e reeditar). */
export interface CalculoServico {
  entrada: EntradaCalculo
  resultado: ResultadoCalculo
}

export interface ItemServico {
  id: string
  servicoId?: string | null
  descricao: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  /** Presente quando o valor veio do motor de cálculo; ausente quando digitado à mão. */
  calculo?: CalculoServico | null
}

export interface ItemMaterial {
  id: string
  quantidade: number
  unidade: string
  especificacao: string
}

export interface ItemTexto {
  id: string
  texto: string
}

export interface Orcamento {
  id: string
  /** Índice sequencial, começando em 1 (incrementa conforme o último criado). */
  numero: number
  data: string
  clienteId?: string | null
  /** Texto do destinatário renderizado no documento (ex.: "A TMG,"). */
  destinatario: string
  formato: FormatoOrcamento
  titulo: string
  introducao?: string
  itensServico: ItemServico[]
  materiais: ItemMaterial[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
  prazoDias?: number | null
  valorTotal: number
  status: StatusOrcamento
  criadoEm: string
  atualizadoEm: string
}

/** Estrutura completa do banco em JSON. */
export interface BancoDados {
  empresa: EmpresaConfig
  parametros: ParametrosFinanceiros
  clientes: Cliente[]
  servicos: ServicoCatalogo[]
  observacoesPadrao: ObservacaoPadrao[]
  pagamentosPadrao: FormaPagamentoPadrao[]
  orcamentos: Orcamento[]
}
