import type { Cliente, EmpresaConfig, Orcamento, Relatorio } from './types'
export interface EnderecoCliente {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}
export type CampoCliente = 'documento' | 'endereco' | 'telefone' | 'email' | 'pessoaContato'
export interface DocumentoMetadados {
  versao?: number
  clienteSnapshot?: Cliente | null
  empresaSnapshot?: EmpresaConfig
  camposCliente?: CampoCliente[]
  computadorResponsavel?: string
}
export type TipoDocumento = 'orcamento' | 'relatorio' | 'recibo'
export interface Recibo extends DocumentoMetadados {
  id: string
  numero: number
  data: string
  clienteId?: string | null
  destinatario: string
  descricao: string
  valor: number
  local: string
  formaPagamento: string
  status: 'rascunho' | 'pendente' | 'recebido' | 'cancelado'
  quitacao: 'parcial' | 'total'
  origemTipo?: 'orcamento' | 'relatorio'
  origemId?: string | null
  adiantamentoId?: string | null
  observacao: string
  criadoEm: string
  atualizadoEm: string
}
export type Documento = Orcamento | Relatorio | Recibo
export interface VersaoDocumento {
  id: string
  tipo: TipoDocumento
  documentoId: string
  numero: number
  anteriorId: string | null
  criadoEm: string
  computador: string
  descricao: string
  documento: Documento
}
export interface ConfigNuvem {
  url: string
  chavePublica: string
  email: string
}
export interface StatusNuvem {
  configurada: boolean
  autenticada: boolean
  computador: string
  pendentes: number
  conflitos: Array<{ id: string; entidade: string; detalhe: string }>
  ultimaSincronizacao: string | null
  erro: string | null
  bytesBanco: number
  reservas: Record<TipoDocumento, number>
}
