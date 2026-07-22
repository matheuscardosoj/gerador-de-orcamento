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
  anexos: {
    imagem: (id) => invoke('anexos.imagem', id) as never
  },
  ia: {
    get: () => invoke('ia.get') as never,
    save: (patch) => invoke('ia.save', patch) as never,
    status: () => invoke('ia.status') as never,
    sugerirObservacao: (orc) => invoke('ia.sugerirObservacao', orc) as never
  },
  logo: {
    selecionar: () => invoke('logo.selecionar') as never
  },
  documentos: {
    gerarPdf: (id) => invoke('documentos.gerarPdf', id) as never,
    gerarDocx: (id) => invoke('documentos.gerarDocx', id) as never
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
  // @ts-ignore (define no window)
  window.electron = electronAPI
  // @ts-ignore (define no window)
  window.api = api
}
