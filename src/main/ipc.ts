import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { extname } from 'path'
import {
  empresaRepo,
  parametrosRepo,
  clientesRepo,
  servicosRepo,
  observacoesRepo,
  pagamentosRepo,
  orcamentosRepo
} from './repositories'

async function selecionarLogo(): Promise<string | null> {
  const r = await dialog.showOpenDialog({
    title: 'Selecionar logo',
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (r.canceled || !r.filePaths[0]) return null
  const caminho = r.filePaths[0]
  const buf = readFileSync(caminho)
  const ext = extname(caminho).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${buf.toString('base64')}`
}

// Mapa canal -> função. Registrado em loop via ipcMain.handle.
// A geração de documentos (documentos.*) é registrada na Fase 5.
const handlers: Record<string, (...args: unknown[]) => unknown> = {
  'empresa.get': () => empresaRepo.get(),
  'empresa.save': (patch) => empresaRepo.save(patch as never),

  'parametros.get': () => parametrosRepo.get(),
  'parametros.save': (patch) => parametrosRepo.save(patch as never),

  'clientes.list': () => clientesRepo.list(),
  'clientes.create': (dto) => clientesRepo.create(dto as never),
  'clientes.update': (id, patch) => clientesRepo.update(id as string, patch as never),
  'clientes.remove': (id) => clientesRepo.remove(id as string),

  'servicos.list': () => servicosRepo.list(),
  'servicos.create': (dto) => servicosRepo.create(dto as never),
  'servicos.update': (id, patch) => servicosRepo.update(id as string, patch as never),
  'servicos.remove': (id) => servicosRepo.remove(id as string),

  'observacoes.list': () => observacoesRepo.list(),
  'observacoes.create': (dto) => observacoesRepo.create(dto as never),
  'observacoes.update': (id, patch) => observacoesRepo.update(id as string, patch as never),
  'observacoes.remove': (id) => observacoesRepo.remove(id as string),

  'pagamentos.list': () => pagamentosRepo.list(),
  'pagamentos.create': (dto) => pagamentosRepo.create(dto as never),
  'pagamentos.update': (id, patch) => pagamentosRepo.update(id as string, patch as never),
  'pagamentos.remove': (id) => pagamentosRepo.remove(id as string),

  'orcamentos.list': () => orcamentosRepo.list(),
  'orcamentos.get': (id) => orcamentosRepo.get(id as string),
  'orcamentos.proximoNumero': () => orcamentosRepo.proximoNumero(),
  'orcamentos.create': (dto) => orcamentosRepo.create(dto as never),
  'orcamentos.update': (id, patch) => orcamentosRepo.update(id as string, patch as never),
  'orcamentos.remove': (id) => orcamentosRepo.remove(id as string),
  'orcamentos.duplicate': (id) => orcamentosRepo.duplicate(id as string),

  'logo.selecionar': () => selecionarLogo()
}

export function registrarIpc(): void {
  for (const [canal, fn] of Object.entries(handlers)) {
    ipcMain.handle(canal, (_evento, ...args) => fn(...args))
  }
}
