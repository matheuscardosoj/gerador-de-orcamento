import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ambiente = vi.hoisted(() => ({ empacotado: true, resposta: 0 }))
const atualizador = vi.hoisted(() => {
  const ouvintes = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    on(evento: string, fn: (...args: unknown[]) => void) {
      ouvintes.set(evento, [...(ouvintes.get(evento) ?? []), fn])
      return this
    },
    emit(evento: string, ...args: unknown[]) {
      for (const fn of ouvintes.get(evento) ?? []) fn(...args)
    },
    limpar: () => ouvintes.clear(),
    contar: (evento: string) => ouvintes.get(evento)?.length ?? 0,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn()
  }
})
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return ambiente.empacotado
    },
    getPath: () => '',
    getVersion: () => '9.9.9'
  },
  dialog: { showMessageBox: vi.fn(async () => ({ response: ambiente.resposta })) }
}))
vi.mock('electron-updater', () => ({ autoUpdater: atualizador }))
import { dialog } from 'electron'
import { atualizacaoDisponivelNesteAmbiente, iniciarAtualizacaoAutomatica } from './atualizacao'

beforeEach(() => {
  vi.useFakeTimers()
  ambiente.empacotado = true
  ambiente.resposta = 0
  delete process.env.GERADOR_USER_DATA_DIR
  atualizador.limpar()
  atualizador.checkForUpdates.mockClear()
  atualizador.downloadUpdate.mockClear()
  atualizador.quitAndInstall.mockClear()
  vi.mocked(dialog.showMessageBox).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('atualização automática', () => {
  it('não roda em desenvolvimento, nos ensaios nem com perfil isolado', () => {
    ambiente.empacotado = false
    expect(atualizacaoDisponivelNesteAmbiente()).toBe(false)
    ambiente.empacotado = true
    process.env.GERADOR_USER_DATA_DIR = 'C:\\perfil'
    expect(atualizacaoDisponivelNesteAmbiente()).toBe(false)
    iniciarAtualizacaoAutomatica()
    expect(atualizador.contar('update-available')).toBe(0)
  })

  it('consulta depois da abertura e a cada 6 horas, sem baixar sozinho', async () => {
    iniciarAtualizacaoAutomatica()
    expect(atualizador.autoDownload).toBe(false)
    expect(atualizador.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(atualizador.checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(atualizador.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(atualizador.downloadUpdate).not.toHaveBeenCalled()
  })

  it('só baixa se o usuário aceitar e não insiste na versão recusada', async () => {
    iniciarAtualizacaoAutomatica()
    ambiente.resposta = 1
    atualizador.emit('update-available', { version: '1.7.0' })
    await vi.advanceTimersByTimeAsync(0)
    expect(atualizador.downloadUpdate).not.toHaveBeenCalled()
    atualizador.emit('update-available', { version: '1.7.0' })
    await vi.advanceTimersByTimeAsync(0)
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    ambiente.resposta = 0
    atualizador.emit('update-available', { version: '1.7.1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(atualizador.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('instala na hora só quando o usuário pede; senão, ao fechar', async () => {
    iniciarAtualizacaoAutomatica()
    ambiente.resposta = 1
    atualizador.emit('update-downloaded', { version: '1.7.0' })
    await vi.advanceTimersByTimeAsync(0)
    expect(atualizador.quitAndInstall).not.toHaveBeenCalled()
    expect(atualizador.autoInstallOnAppQuit).toBe(true)
    ambiente.resposta = 0
    atualizador.emit('update-downloaded', { version: '1.7.0' })
    await vi.advanceTimersByTimeAsync(0)
    expect(atualizador.quitAndInstall).toHaveBeenCalledOnce()
  })
})
