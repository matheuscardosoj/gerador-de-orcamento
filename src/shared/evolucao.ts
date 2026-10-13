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
  usuarioCriador?: string | null
  alteradoPor?: string | null
  autorNome?: string | null
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
export interface AtualizacaoNumeracaoPendente {
  revisao: string
  total: number
  equivalentes: number
  divergentes: number
  registros: Array<{
    id: string
    entidade: string
    rotulo: string
    situacao: 'equivalente' | 'divergente' | 'ausente'
  }>
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
  atualizandoNumeracao?: boolean
  atualizacaoPendente?: AtualizacaoNumeracaoPendente | null
  backupAtualizacao?: string | null
  pendenciasPreservadas?: number
  falhas?: Array<{ id: string; entidade: string; detalhe: string }>
  reservas: Record<TipoDocumento, number>
  empresaId?: string
  usuarioId?: string
  protocolo?: number
  tempoReal?: 'desconectado' | 'conectando' | 'conectado' | 'indisponivel'
  erroTempoReal?: string | null
}

export interface EventoDados {
  origem: 'local' | 'nuvem'
  entidades: string[]
  status?: boolean
}
export interface MembroEmpresa {
  papel?: import('./conta').PapelConta
  usuarioId: string
  nome: string
  email: string
  ativo: boolean
}
export interface ControleEdicao {
  solicitacoes?: Array<{ usuarioNome: string; computador: string; criadoEm: string }>
  tipo: TipoDocumento
  documentoId: string
  usuarioId: string
  usuarioNome: string
  computador: string
  geracao: number
  expiraEm: string | null
  offline: boolean
  revisao: number
  podeEditar: boolean
}
export interface RascunhoCompartilhado {
  id: string
  tipo: TipoDocumento
  documentoId: string
  baseRevisao: number
  base: Documento
  documento: Documento
  criadoEm: string
  atualizadoEm: string
  estado: 'local' | 'conflito' | 'aplicado'
}
export interface ComparacaoRascunho {
  rascunho: RascunhoCompartilhado
  remoto: Documento | null
  revisaoRemota: number
  documento: Documento
  conflitos: import('./conciliacao').ConflitoCampo[]
}
export interface RevisaoRecebimentos {
  tipo: TipoDocumento
  documentoId: string
  revisoes: Record<string, number>
  operacoes: Array<{
    reciboId: string
    numero: number
    cliente: string
    valor: number
    acao: 'confirmar' | 'estornar'
    situacao: 'pendente' | 'aplicada' | 'divergente'
    detalhe: string
    excluir?: boolean
  }>
}
