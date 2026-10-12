import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppApi, CrudApi } from '@shared/api'

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
  colaboracao: {
    membros: () => invoke('colaboracao.membros') as never,
    vincularMembro: (email, nome) => invoke('colaboracao.vincularMembro', email, nome) as never,
    ativarMembro: (usuario, ativo) => invoke('colaboracao.ativarMembro', usuario, ativo) as never,
    edicao: (tipo, id, acao, destino) =>
      invoke('colaboracao.edicao', tipo, id, acao, destino) as never
  },
  eventos: {
    observarDados: (callback) => {
      const listener = (_evento: unknown, dados: import('../shared/evolucao').EventoDados): void =>
        callback(dados)
      ipcRenderer.on('dados.alterados', listener)
      return () => {
        ipcRenderer.removeListener('dados.alterados', listener)
      }
    }
  },
  preferencias: {
    historico: (tipo) => invoke('preferencias.historico', tipo) as never,
    salvarHistorico: (tipo, dados) => invoke('preferencias.salvarHistorico', tipo, dados) as never
  },
  reordenarCadastro: (tipo, ids) => invoke('cadastros.reordenar', tipo, ids) as never,
  recibos: {
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
    copiarInstalacao: () => invoke('nuvem.copiarInstalacao') as never,
    config: () => invoke('nuvem.config') as never,
    status: () => invoke('nuvem.status') as never,
    conectar: (c, s, m) => invoke('nuvem.conectar', c, s, m) as never,
    sincronizar: () => invoke('nuvem.sincronizar') as never,
    dispositivos: () => invoke('nuvem.dispositivos') as never,
    transferir: (t, id, d) => invoke('nuvem.transferir', t, id, d) as never,
    sair: () => invoke('nuvem.sair') as never,
    aceitarRemoto: (id) => invoke('nuvem.aceitarRemoto', id) as never
  },
  aplicativo: {
    versao: () => invoke('aplicativo.versao') as never,
    alteracoesPendentes: (ativo) => invoke('aplicativo.alteracoesPendentes', ativo) as never
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
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error API de compatibilidade exposta no window
  window.electron = electronAPI
  // @ts-expect-error API de compatibilidade exposta no window
  window.api = api
}
