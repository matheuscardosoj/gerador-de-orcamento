// Contrato tipado da API exposta ao renderer via preload (window.api).
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento,
  Relatorio,
  ConfigIA,
  StatusIA,
  ResumoOrcamento,
  ResumoRelatorio
} from './types'

export interface CrudApi<T, C> {
  list(): Promise<T[]>
  create(dto: C): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T | null>
  remove(id: string): Promise<void>
}

/**
 * `numero` é opcional: só vem preenchido quando o usuário digitou um número
 * específico no editor. Sem ele, o main usa o próximo número livre.
 */
export type NovoOrcamento = Omit<Orcamento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'> & {
  numero?: number
}

export type NovoRelatorio = Omit<Relatorio, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'> & {
  numero?: number
}

/**
 * Resultado de uma operação de numeração. Conflito de número é validação, não
 * erro de programa — por isso volta como dado, com a mensagem pronta para exibir.
 */
export interface ResultadoNumeracao {
  ok: boolean
  erro?: string
  /** Sugestão de número livre, quando o pedido está ocupado. */
  proximoLivre?: number
}

export interface InfoNumeracao {
  /** Número que o próximo documento desse tipo receberá. */
  proximoNumero: number
  maiorEmUso: number
  /** Menor número ainda não usado (útil para fechar buracos na sequência). */
  menorLivre: number
  totalDocumentos: number
  /** A numeração oficial vem das reservas exclusivas do computador. */
  usaReservas?: boolean
  atribuicaoServidor?: boolean
  ultimoNumero?: number
  proximoBloco?: number
  minimoProximo?: number
}

export type SugestaoObservacaoEntrada =
  { tipo: 'orcamento'; documento: Orcamento } | { tipo: 'relatorio'; documento: Relatorio }

export interface DocumentoResultado {
  /** Caminho do arquivo salvo, ou null se o usuário cancelou. */
  caminho: string | null
}

export interface ResultadoImportacaoDados {
  modo: 'restaurar' | 'mesclar'
  backupAntes: string
  importados: Record<string, number>
  ignorados: Record<string, number>
  renumerados: { orcamentos: number; relatorios: number }
  reiniciarNecessario: boolean
}

export interface AppApi {
  conta: import('./conta').ContaApi
  rascunhosCadastros: {
    guardar(
      tipo: 'cliente' | 'servico' | 'observacoes' | 'pagamentos',
      idOrigem: string,
      dados: Record<string, unknown>
    ): Promise<void>
    listar(
      tipo: 'cliente' | 'servico' | 'observacoes' | 'pagamentos'
    ): Promise<import('./evolucao').RascunhoCadastro[]>
    descartar(
      tipo: 'cliente' | 'servico' | 'observacoes' | 'pagamentos',
      idOrigem: string
    ): Promise<void>
  }
  rascunhos: {
    list(
      tipo?: import('./evolucao').TipoDocumento,
      id?: string
    ): Promise<import('./evolucao').RascunhoCompartilhado[]>
    get(id: string): Promise<import('./evolucao').RascunhoCompartilhado>
    create(
      tipo: import('./evolucao').TipoDocumento,
      id: string,
      documento?: import('./evolucao').Documento
    ): Promise<import('./evolucao').RascunhoCompartilhado>
    save(
      id: string,
      documento: import('./evolucao').Documento
    ): Promise<import('./evolucao').RascunhoCompartilhado>
    comparar(
      id: string,
      escolhas?: Record<string, 'local' | 'remoto'>
    ): Promise<import('./evolucao').ComparacaoRascunho>
    aplicar(
      id: string,
      revisao: number,
      escolhas: Record<string, 'local' | 'remoto'>
    ): Promise<import('./evolucao').Documento>
    copiar(id: string): Promise<import('./evolucao').Documento>
    remove(id: string): Promise<void>
  }
  colaboracao: {
    acompanhados(): Promise<Array<{ tipo: import('./evolucao').TipoDocumento; id: string }>>
    revisarRecebimentos(
      tipo: import('./evolucao').TipoDocumento,
      id: string
    ): Promise<import('./evolucao').RevisaoRecebimentos>
    conciliarRecebimentos(
      revisao: import('./evolucao').RevisaoRecebimentos,
      acao: 'reaplicar' | 'arquivar'
    ): Promise<void>
    acompanhar(tipo: import('./evolucao').TipoDocumento, id: string, ativo: boolean): Promise<void>
    membros(): Promise<import('./evolucao').MembroEmpresa[]>
    vincularMembro(email: string, nome: string): Promise<import('./evolucao').MembroEmpresa[]>
    ativarMembro(usuarioId: string, ativo: boolean): Promise<import('./evolucao').MembroEmpresa[]>
    estadoEdicao(
      tipo: import('./evolucao').TipoDocumento,
      id: string,
      acao?: Parameters<AppApi['colaboracao']['edicao']>[2],
      destino?: string
    ): Promise<import('./evolucao').EstadoControleEdicao>
    edicao(
      tipo: import('./evolucao').TipoDocumento,
      id: string,
      acao?:
        | 'obter'
        | 'adquirir'
        | 'offline'
        | 'liberar'
        | 'transferir'
        | 'recuperar'
        | 'solicitar'
        | 'cancelarPedido',
      destino?: string
    ): Promise<import('./evolucao').ControleEdicao | null>
  }
  eventos: {
    observarDados(callback: (evento: import('./evolucao').EventoDados) => void): () => void
  }
  preferencias: {
    historico(
      tipo: import('./types').TipoDocumento
    ): Promise<import('./historico-preferencias').PreferenciasHistorico>
    salvarHistorico(
      tipo: import('./types').TipoDocumento,
      dados: import('./historico-preferencias').PreferenciasHistorico
    ): Promise<void>
  }
  reordenarCadastro(tipo: 'servicos' | 'observacoes' | 'pagamentos', ids: string[]): Promise<void>
  recibos: {
    alterarNumero(
      id: string,
      numero: number
    ): Promise<ResultadoNumeracao & { recibo?: import('./types').Recibo }>
    numeracao(): Promise<InfoNumeracao>
    definirProximoNumero(numero: number): Promise<ResultadoNumeracao>
    list(): Promise<import('./types').Recibo[]>
    get(id: string): Promise<import('./types').Recibo | null>
    create(
      dto: Omit<import('./types').Recibo, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'>
    ): Promise<import('./types').Recibo>
    update(
      id: string,
      patch: Partial<import('./types').Recibo>
    ): Promise<import('./types').Recibo | null>
    confirmar(id: string): Promise<import('./types').Recibo>
    cancelar(id: string): Promise<import('./types').Recibo>
    remove(id: string, estornar?: boolean): Promise<void>
  }
  versoes: {
    html(id: string): Promise<string>
    nomear(id: string, descricao: string): Promise<void>
    list(
      tipo: import('./types').TipoDocumento,
      id: string
    ): Promise<import('./types').VersaoDocumento[]>
    restaurar(id: string, copiar: boolean): Promise<import('./types').Documento>
    exportar(id: string, formato: 'pdf' | 'docx'): Promise<DocumentoResultado>
  }
  nuvem: {
    verificarConexao(): Promise<void>
    copiarInstalacao(): Promise<void>
    config(): Promise<import('./types').ConfigNuvem>
    status(): Promise<import('./types').StatusNuvem>
    conectar(
      config: import('./types').ConfigNuvem,
      senha: string,
      modo: 'publicar' | 'baixar'
    ): Promise<import('./types').StatusNuvem>
    sincronizar(): Promise<import('./types').StatusNuvem>
    restaurarBase(): Promise<{ backup: string; status: import('./types').StatusNuvem } | null>
    tentarNovamente(id: string): Promise<import('./types').StatusNuvem>
    finalizarAtualizacao(revisao: string): Promise<import('./types').StatusNuvem>
    dispositivos(): Promise<Array<{ id: string; nome: string }>>
    transferir(tipo: import('./types').TipoDocumento, id: string, destino: string): Promise<void>
    sair(): Promise<void>
    aceitarRemoto(id: string): Promise<void>
  }
  aplicativo: {
    versao(): Promise<string>
    alteracoesPendentes(ativo: boolean): Promise<void>
  }
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
    list(): Promise<ResumoOrcamento[]>
    get(id: string): Promise<Orcamento | null>
    proximoNumero(): Promise<number>
    create(dto: NovoOrcamento): Promise<Orcamento>
    update(id: string, patch: Partial<Orcamento>): Promise<Orcamento | null>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<Orcamento | null>
    /** Panorama da numeração, usado na aba Numeração das Configurações. */
    numeracao(): Promise<InfoNumeracao>
    /** Define o número que o próximo orçamento receberá. */
    definirProximoNumero(numero: number): Promise<ResultadoNumeracao>
    /** Troca o número de um orçamento existente. Nada muda se `ok` for false. */
    alterarNumero(
      id: string,
      numero: number
    ): Promise<ResultadoNumeracao & { orcamento?: Orcamento }>
  }
  relatorios: {
    list(): Promise<ResumoRelatorio[]>
    get(id: string): Promise<Relatorio | null>
    proximoNumero(): Promise<number>
    create(dto: NovoRelatorio): Promise<Relatorio>
    update(id: string, patch: Partial<Relatorio>): Promise<Relatorio | null>
    remove(id: string): Promise<void>
    numeracao(): Promise<InfoNumeracao>
    definirProximoNumero(numero: number): Promise<ResultadoNumeracao>
    alterarNumero(
      id: string,
      numero: number
    ): Promise<ResultadoNumeracao & { relatorio?: Relatorio }>
    criarDeOrcamento(orcamentoId: string): Promise<Relatorio | null>
  }
  anexos: {
    /** Imagem em tamanho cheio (data URL), carregada sob demanda. */
    imagem(id: string): Promise<string | null>
  }
  anexosRelatorio: {
    imagem(id: string): Promise<string | null>
  }
  ia: {
    revisarTexto(entrada: import('./revisao-ia').RevisaoTextoEntrada): Promise<string>
    cancelarRevisao(id: string): Promise<void>
    get(): Promise<ConfigIA>
    save(patch: Partial<ConfigIA>): Promise<ConfigIA>
    status(): Promise<StatusIA>
    /** Gera uma sugestão de anotação interna adequada ao tipo do documento. */
    sugerirObservacao(entrada: SugestaoObservacaoEntrada): Promise<string>
  }
  logo: {
    /** Abre um seletor de imagem e retorna a logo como data URL. */
    selecionar(): Promise<string | null>
  }
  documentos: {
    gerarReciboPdf(id: string): Promise<DocumentoResultado>
    gerarReciboDocx(id: string): Promise<DocumentoResultado>
    gerarPdf(orcamentoId: string): Promise<DocumentoResultado>
    gerarDocx(orcamentoId: string): Promise<DocumentoResultado>
    gerarRelatorioPdf(relatorioId: string): Promise<DocumentoResultado>
    gerarRelatorioDocx(relatorioId: string): Promise<DocumentoResultado>
  }
  dados: {
    exportar(): Promise<{ caminho: string | null }>
    importar(modo: 'restaurar' | 'mesclar'): Promise<ResultadoImportacaoDados | null>
  }
}
