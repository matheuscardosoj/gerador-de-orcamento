// Atualização automática pelos GitHub Releases do projeto. Nada baixa sem a escolha do usuário:
// o aplicativo avisa que há versão nova, baixa só a parte que mudou (blockmap) quando ele aceita e
// instala ao fechar ou no momento que ele escolher.
import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { registrarDiagnostico } from './diagnostico'

const INTERVALO_MS = 6 * 60 * 60 * 1000

/** Só o aplicativo instalado se atualiza: não em desenvolvimento, nos ensaios nem com perfil isolado. */
export function atualizacaoDisponivelNesteAmbiente(): boolean {
  return (
    app.isPackaged && !process.env.GERADOR_USER_DATA_DIR && !process.env.GERADOR_SEM_ATUALIZACAO
  )
}

export function iniciarAtualizacaoAutomatica(): void {
  if (!atualizacaoDisponivelNesteAmbiente()) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  const recusadas = new Set<string>()
  let baixando = false

  autoUpdater.on('update-available', (info) => {
    if (baixando || recusadas.has(info.version)) return
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Nova versão disponível',
        message: `A versão ${info.version} do Gerador de Orçamentos está disponível.`,
        detail:
          'O download traz só o que mudou e o aplicativo continua aberto. Você escolhe depois quando reiniciar.',
        buttons: ['Baixar agora', 'Agora não'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      .then(({ response }) => {
        if (response !== 0) return void recusadas.add(info.version)
        baixando = true
        return autoUpdater.downloadUpdate().then(
          () => undefined,
          (erro) => {
            baixando = false
            registrarDiagnostico('atualizacao-download', erro)
          }
        )
      })
  })
  autoUpdater.on('update-downloaded', (info) => {
    baixando = false
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Atualização pronta',
        message: `A versão ${info.version} foi baixada.`,
        detail:
          'Reiniciar agora instala a atualização. Se preferir, ela é instalada ao fechar o aplicativo.',
        buttons: ['Reiniciar agora', 'Instalar ao fechar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (erro) => registrarDiagnostico('atualizacao', erro))

  const verificar = (): void => {
    autoUpdater
      .checkForUpdates()
      .catch((erro) => registrarDiagnostico('atualizacao-consulta', erro))
  }
  setTimeout(verificar, 30_000)
  setInterval(verificar, INTERVALO_MS).unref()
}
