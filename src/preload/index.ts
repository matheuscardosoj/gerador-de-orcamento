import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, CrudApi } from '@shared/api'

type EventoDados = import('../shared/evolucao').EventoDados
const ouvintesDados = new Set<(dados: EventoDados) => void>()
let escutandoDados = false

const invoke = (canal: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(canal, ...args)

function crud<T, C>(dominio: string): CrudApi<T, C> {
  return {
    list: () => invoke(`${dominio}.list`) as Promise<T[]>,
    create: (dto) => invoke(`${dominio}.create`, dto) as Promise<T>,
    update: (id, patch) => invoke(`${dominio}.update`, id, patch) as Promise<T | null>,
    remove: (id) => invoke(`${dominio}.remove`, id) as Promise<void>
  }
}

const api: AppApi = {
  conta: {
    status: () => invoke('conta.status') as never,
    entrar: (email, senha, lembrar) => invoke('conta.entrar', email, senha, lembrar) as never,
    selecionarEmpresa: (id) => invoke('conta.selecionarEmpresa', id) as never,
    sair: () => invoke('conta.sair') as never,
    atualizarNome: (nome) => invoke('conta.atualizarNome', nome) as never,
    alterarEmail: (atual, novo) => invoke('conta.alterarEmail', atual, novo) as never,
    confirmarAlteracaoEmail: (codigo) => invoke('conta.confirmarAlteracaoEmail', codigo) as never,
    alterarSenha: (atual, nova) => invoke('conta.alterarSenha', atual, nova) as never,
    alterarPapel: (usuario, papel) => invoke('conta.alterarPapel', usuario, papel) as never,
    enviarCodigo: (email, tipo) => invoke('conta.enviarCodigo', email, tipo) as never,
    confirmarCodigo: (email, codigo, tipo, senha) =>
      invoke('conta.confirmarCodigo', email, codigo, tipo, senha) as never,
    convites: () => invoke('conta.convites') as never,
    convidar: (email, nome, papel) => invoke('conta.convidar', email, nome, papel) as never,
    cancelarConvite: (id) => invoke('conta.cancelarConvite', id) as never,
    reenviarConvite: (id) => invoke('conta.reenviarConvite', id) as never,
    atualizarEmpresas: () => invoke('conta.atualizarEmpresas') as never,
    criarEmpresa: (nome, email, admin) => invoke('conta.criarEmpresa', nome, email, admin) as never,
    excluirEmpresa: (id, nome) => invoke('conta.excluirEmpresa', id, nome) as never,
    continuarAposIndisponibilidade: () => invoke('conta.continuarAposIndisponibilidade') as never,
    avisosEmail: () => invoke('conta.avisosEmail') as never
  },
  rascunhos: {
    list: (tipo, id) => invoke('rascunhos.list', tipo, id) as never,
    get: (id) => invoke('rascunhos.get', id) as never,
    create: (tipo, id, documento) => invoke('rascunhos.create', tipo, id, documento) as never,
    save: (id, documento) => invoke('rascunhos.save', id, documento) as never,
    comparar: (id, escolhas) => invoke('rascunhos.comparar', id, escolhas) as never,
    aplicar: (id, revisao, escolhas) => invoke('rascunhos.aplicar', id, revisao, escolhas) as never,
    copiar: (id) => invoke('rascunhos.copiar', id) as never,
    remove: (id) => invoke('rascunhos.remove', id) as never
  },
  rascunhosCadastros: {
    guardar: (tipo, idOrigem, dados) =>
      invoke('rascunhosCadastros.guardar', tipo, idOrigem, dados) as never,
    listar: (tipo) => invoke('rascunhosCadastros.listar', tipo) as never,
    descartar: (tipo, idOrigem) => invoke('rascunhosCadastros.descartar', tipo, idOrigem) as never
  },
  colaboracao: {
    acompanhados: () => invoke('colaboracao.acompanhados') as never,
    revisarRecebimentos: (tipo, id) => invoke('colaboracao.revisarRecebimentos', tipo, id) as never,
    conciliarRecebimentos: (revisao, acao) =>
      invoke('colaboracao.conciliarRecebimentos', revisao, acao) as never,
    acompanhar: (tipo, id, ativo) => invoke('colaboracao.acompanhar', tipo, id, ativo) as never,
    membros: () => invoke('colaboracao.membros') as never,
    vincularMembro: (email, nome) => invoke('colaboracao.vincularMembro', email, nome) as never,
    ativarMembro: (usuario, ativo) => invoke('colaboracao.ativarMembro', usuario, ativo) as never,
    estadoEdicao: (tipo, id, acao, destino) =>
      invoke('colaboracao.estadoEdicao', tipo, id, acao, destino) as never,
    edicao: (tipo, id, acao, destino) =>
      invoke('colaboracao.edicao', tipo, id, acao, destino) as never
  },
  eventos: {
    observarDados: (callback) => {
      // Um único listener do IPC atende todos os componentes: evita o aviso de
      // vazamento do EventEmitter e isola falhas de um observador dos demais.
      if (!escutandoDados) {
        escutandoDados = true
        ipcRenderer.on('dados.alterados', (_evento, dados: EventoDados) => {
          for (const ouvinte of [...ouvintesDados]) {
            try {
              ouvinte(dados)
            } catch (erro) {
              console.error(erro)
            }
          }
        })
      }
      ouvintesDados.add(callback)
      return () => {
        ouvintesDados.delete(callback)
      }
    }
  },
  preferencias: {
    historico: (tipo) => invoke('preferencias.historico', tipo) as never,
    salvarHistorico: (tipo, dados) => invoke('preferencias.salvarHistorico', tipo, dados) as never
  },
  reordenarCadastro: (tipo, ids) => invoke('cadastros.reordenar', tipo, ids) as never,
  recibos: {
    alterarNumero: (id, n) => invoke('recibos.alterarNumero', id, n) as never,
    numeracao: () => invoke('recibos.numeracao') as never,
    definirProximoNumero: (n) => invoke('recibos.definirProximoNumero', n) as never,
    list: () => invoke('recibos.list') as never,
    get: (id) => invoke('recibos.get', id) as never,
    create: (dto) => invoke('recibos.create', dto) as never,
    update: (id, p) => invoke('recibos.update', id, p) as never,
    confirmar: (id) => invoke('recibos.confirmar', id) as never,
    cancelar: (id) => invoke('recibos.cancelar', id) as never,
    remove: (id, estornar) => invoke('recibos.remove', id, estornar) as Promise<void>
  },
  versoes: {
    html: (id) => invoke('versoes.html', id) as never,
    nomear: (id, d) => invoke('versoes.nomear', id, d) as never,
    list: (t, id) => invoke('versoes.list', t, id) as never,
    restaurar: (id, c) => invoke('versoes.restaurar', id, c) as never,
    exportar: (id, f) => invoke('versoes.exportar', id, f) as never
  },
  nuvem: {
    verificarConexao: (origem) => invoke('nuvem.verificarConexao', origem) as Promise<void>,
    copiarInstalacao: () => invoke('nuvem.copiarInstalacao') as never,
    config: () => invoke('nuvem.config') as never,
    status: () => invoke('nuvem.status') as never,
    conectar: (c, s, m) => invoke('nuvem.conectar', c, s, m) as never,
    sincronizar: () => invoke('nuvem.sincronizar') as never,
    restaurarBase: () => invoke('nuvem.restaurarBase') as never,
    tentarNovamente: (id) => invoke('nuvem.tentarNovamente', id) as never,
    finalizarAtualizacao: (revisao) => invoke('nuvem.finalizarAtualizacao', revisao) as never,
    dispositivos: () => invoke('nuvem.dispositivos') as never,
    transferir: (t, id, d) => invoke('nuvem.transferir', t, id, d) as never,
    sair: () => invoke('nuvem.sair') as never,
    aceitarRemoto: (id) => invoke('nuvem.aceitarRemoto', id) as never
  },
  aplicativo: {
    versao: () => invoke('aplicativo.versao') as never,
    alteracoesPendentes: (ativo) => invoke('aplicativo.alteracoesPendentes', ativo) as never,
    definirTema: (modo) => invoke('aplicativo.definirTema', modo) as never,
    exportarDiagnostico: () => invoke('aplicativo.exportarDiagnostico') as never
  },
  empresa: {
    get: () => invoke('empresa.get') as never,
    save: (patch) => invoke('empresa.save', patch) as never
  },
  parametros: {
    get: () => invoke('parametros.get') as never,
    save: (patch) => invoke('parametros.save', patch) as never
  },
  clientes: crud('clientes'),
  servicos: crud('servicos'),
  observacoes: crud('observacoes'),
  pagamentos: crud('pagamentos'),
  orcamentos: {
    list: () => invoke('orcamentos.list') as never,
    get: (id) => invoke('orcamentos.get', id) as never,
    proximoNumero: () => invoke('orcamentos.proximoNumero') as never,
    create: (dto) => invoke('orcamentos.create', dto) as never,
    update: (id, patch) => invoke('orcamentos.update', id, patch) as never,
    remove: (id) => invoke('orcamentos.remove', id) as never,
    duplicate: (id) => invoke('orcamentos.duplicate', id) as never,
    numeracao: () => invoke('orcamentos.numeracao') as never,
    definirProximoNumero: (n) => invoke('orcamentos.definirProximoNumero', n) as never,
    alterarNumero: (id, n) => invoke('orcamentos.alterarNumero', id, n) as never
  },
  relatorios: {
    list: () => invoke('relatorios.list') as never,
    get: (id) => invoke('relatorios.get', id) as never,
    proximoNumero: () => invoke('relatorios.proximoNumero') as never,
    create: (dto) => invoke('relatorios.create', dto) as never,
    update: (id, patch) => invoke('relatorios.update', id, patch) as never,
    remove: (id) => invoke('relatorios.remove', id) as never,
    numeracao: () => invoke('relatorios.numeracao') as never,
    definirProximoNumero: (n) => invoke('relatorios.definirProximoNumero', n) as never,
    alterarNumero: (id, n) => invoke('relatorios.alterarNumero', id, n) as never,
    criarDeOrcamento: (id) => invoke('relatorios.criarDeOrcamento', id) as never
  },
  anexos: {
    imagem: (id) => invoke('anexos.imagem', id) as never
  },
  anexosRelatorio: {
    imagem: (id) => invoke('anexosRelatorio.imagem', id) as never
  },
  ia: {
    revisarTexto: (entrada) => invoke('ia.revisarTexto', entrada) as never,
    cancelarRevisao: (id) => invoke('ia.cancelarRevisao', id) as never,
    get: () => invoke('ia.get') as never,
    save: (patch) => invoke('ia.save', patch) as never,
    status: () => invoke('ia.status') as never,
    sugerirObservacao: (entrada) => invoke('ia.sugerirObservacao', entrada) as never
  },
  logo: {
    selecionar: () => invoke('logo.selecionar') as never
  },
  documentos: {
    gerarReciboPdf: (id) => invoke('documentos.gerarReciboPdf', id) as never,
    gerarReciboDocx: (id) => invoke('documentos.gerarReciboDocx', id) as never,
    gerarPdf: (id) => invoke('documentos.gerarPdf', id) as never,
    gerarDocx: (id) => invoke('documentos.gerarDocx', id) as never,
    gerarRelatorioPdf: (id) => invoke('documentos.gerarRelatorioPdf', id) as never,
    gerarRelatorioDocx: (id) => invoke('documentos.gerarRelatorioDocx', id) as never
  },
  dados: {
    exportar: () => invoke('dados.exportar') as never,
    importar: (modo) => invoke('dados.importar', modo) as never
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error API de compatibilidade exposta no window
  window.api = api
}
