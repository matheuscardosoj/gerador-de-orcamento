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
  /** Clientes inativos ficam fora das sugestões, mas preservam o histórico. */
  ativo: boolean
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

/** Define em quais editores um texto cadastrado pode ser usado. */
export type AplicacaoTextoPadrao = 'ambos' | 'orcamento' | 'relatorio'

export interface ObservacaoPadrao {
  id: string
  texto: string
  /** Se vem marcada por padrão em novos orçamentos. */
  padrao: boolean
  aplicacao: AplicacaoTextoPadrao
}

export interface FormaPagamentoPadrao {
  id: string
  texto: string
  padrao: boolean
  aplicacao: AplicacaoTextoPadrao
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
  /** Preserva a origem para filtrar textos ao converter proposta em relatório. */
  origemPadraoId?: string | null
}

/**
 * Foto anexada ao orçamento. Opcionalmente vinculada a um item de serviço —
 * nesse caso o documento faz uma referência discreta ao item correspondente.
 *
 * A imagem em tamanho cheio fica no banco (BLOB) e NUNCA trafega em lote pelo
 * IPC: a UI e a prévia usam `miniaturaDataUrl`; PDF/DOCX leem o BLOB no main.
 */
export interface AnexoOrcamento {
  id: string
  /** Item de serviço referenciado, ou null para anexo solto. */
  itemServicoId?: string | null
  titulo: string
  descricao: string
  mime: string
  /** Dimensões da imagem cheia, usadas para manter a proporção no documento. */
  largura: number
  altura: number
  /** Miniatura (~320px) em data URL. Sempre presente ao ler do banco. */
  miniaturaDataUrl?: string
  /**
   * Imagem cheia em data URL. Só é enviada do renderer para o main ao salvar
   * um anexo novo; ao ler, vem vazia (o BLOB fica no banco).
   */
  imagemDataUrl?: string | null
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
  /** Fotos anexadas. Quando há alguma, o documento ganha uma seção em página nova. */
  anexos: AnexoOrcamento[]
  prazoDias?: number | null
  /** Anotação livre do usuário: identifica o orçamento na listagem, não sai no documento. */
  observacaoInterna?: string
  valorTotal: number
  status: StatusOrcamento
  criadoEm: string
  atualizadoEm: string
}

export type StatusRelatorio = 'rascunho' | 'emitido' | 'pago'
export type TipoLancamentoRelatorio = 'adiantamento' | 'reembolso'
export type TipoReferenciaAnexoRelatorio = 'servico' | TipoLancamentoRelatorio | 'solto'

export interface LancamentoRelatorio {
  id: string
  descricao: string
  valor: number
}

/** Foto do relatório, vinculável a serviço, adiantamento ou reembolso. */
export interface AnexoRelatorio {
  id: string
  referenciaTipo: TipoReferenciaAnexoRelatorio
  referenciaId?: string | null
  titulo: string
  descricao: string
  mime: string
  largura: number
  altura: number
  miniaturaDataUrl?: string
  imagemDataUrl?: string | null
}

/** Snapshot sem vínculo vivo com a proposta que originou o relatório. */
export interface OrigemOrcamentoRelatorio {
  id: string
  numero: number
  cliente: string
}

export interface TotaisRelatorio {
  servicos: number
  adiantamentos: number
  reembolsos: number
  saldo: number
  valorFinal: number
  tipoSaldo: 'receber' | 'devolver'
}

export interface Relatorio {
  id: string
  numero: number
  data: string
  clienteId?: string | null
  destinatario: string
  formato: FormatoOrcamento
  titulo: string
  introducao?: string
  itensServico: ItemServico[]
  adiantamentos: LancamentoRelatorio[]
  reembolsos: LancamentoRelatorio[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
  anexos: AnexoRelatorio[]
  /** Anotação interna: aparece no histórico e pode ser sugerida pela IA; não sai no documento. */
  observacaoInterna?: string
  status: StatusRelatorio
  origemOrcamento?: OrigemOrcamentoRelatorio | null
  totais: TotaisRelatorio
  criadoEm: string
  atualizadoEm: string
}

/** Origem do modelo de linguagem usado para sugerir a anotação interna. */
export type ModoIA = 'embutida' | 'ollama' | 'desligada'

export interface ConfigIA {
  modo: ModoIA
  /** Usado quando modo = 'ollama'. */
  urlOllama: string
  modeloOllama: string
}

export interface StatusIA {
  modo: ModoIA
  disponivel: boolean
  /** Descrição legível do estado (usada no botão "Testar conexão"). */
  detalhe: string
}

/** Estrutura completa do banco em JSON (formato legado, ainda lido na migração). */
export interface BancoDados {
  empresa: EmpresaConfig
  parametros: ParametrosFinanceiros
  clientes: Cliente[]
  servicos: ServicoCatalogo[]
  observacoesPadrao: ObservacaoPadrao[]
  pagamentosPadrao: FormaPagamentoPadrao[]
  orcamentos: Orcamento[]
  relatorios?: Relatorio[]
  /** Contador sequencial persistente (auto-increment): nunca reutiliza números. */
  seqOrcamento: number
  seqRelatorio?: number
  configIA: ConfigIA
}
