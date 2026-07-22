// Contrato tipado da API exposta ao renderer via preload (window.api).
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento
} from './types'

export interface CrudApi<T, C> {
  list(): Promise<T[]>
  create(dto: C): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T | null>
  remove(id: string): Promise<void>
}

export type NovoOrcamento = Omit<Orcamento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'>

export interface DocumentoResultado {
  /** Caminho do arquivo salvo, ou null se o usuário cancelou. */
  caminho: string | null
}

export interface AppApi {
  empresa: {
    get(): Promise<EmpresaConfig>
    save(patch: Partial<EmpresaConfig>): Promise<EmpresaConfig>
  }
  parametros: {
    get(): Promise<ParametrosFinanceiros>
    save(patch: Partial<ParametrosFinanceiros>): Promise<ParametrosFinanceiros>
  }
  clientes: CrudApi<Cliente, Omit<Cliente, 'id' | 'criadoEm'>>
  servicos: CrudApi<ServicoCatalogo, Omit<ServicoCatalogo, 'id'>>
  observacoes: CrudApi<ObservacaoPadrao, Omit<ObservacaoPadrao, 'id'>>
  pagamentos: CrudApi<FormaPagamentoPadrao, Omit<FormaPagamentoPadrao, 'id'>>
  orcamentos: {
    list(): Promise<Orcamento[]>
    get(id: string): Promise<Orcamento | null>
    proximoNumero(): Promise<number>
    create(dto: NovoOrcamento): Promise<Orcamento>
    update(id: string, patch: Partial<Orcamento>): Promise<Orcamento | null>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<Orcamento | null>
  }
  logo: {
    /** Abre um seletor de imagem e retorna a logo como data URL. */
    selecionar(): Promise<string | null>
  }
  documentos: {
    gerarPdf(orcamentoId: string): Promise<DocumentoResultado>
    gerarDocx(orcamentoId: string): Promise<DocumentoResultado>
  }
}
