import { app, shell, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { abrirBanco, fecharBanco } from './db/sqlite'
import { migrarJsonSeExistir } from './db/migrar-json'
import { bancoVazio, semear } from './repositories'
import { encerrarIA } from './ia'
import { registrarIpc } from './ipc'

const temTrava = app.requestSingleInstanceLock()
if (!temTrava) app.quit()

/**
 * Abre o banco e, quando ele ainda está vazio, importa o `banco.json` legado.
 * Só semeia os dados iniciais se não houver nada a importar. Se a importação
 * falhar, o JSON é preservado intacto (a transação sofre rollback) e uma nova
 * tentativa acontece no próximo início — por isso o critério é "banco vazio",
 * não "arquivo recém-criado".
 */
function iniciarBanco(): void {
  abrirBanco()
  if (!bancoVazio()) return
  let importou = false
  try {
    importou = migrarJsonSeExistir()
  } catch (e) {
    dialog.showErrorBox(
      'Falha ao importar os dados antigos',
      `Não foi possível migrar o banco.json para o novo formato:\n\n${String(e)}\n\n` +
        'O arquivo antigo foi preservado. O aplicativo vai abrir com os dados iniciais.'
    )
  }
  if (!importou && bancoVazio()) semear()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Gerador de Orçamentos',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (temTrava) app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gerador.orcamentos')

  // Inicializa o banco (cria arquivo, migra o JSON ou semeia) e registra o IPC.
  try {
    iniciarBanco()
  } catch (e) {
    dialog.showErrorBox(
      'Não foi possível atualizar o banco de dados',
      `${String(e).replace(/^Error:\s*/, '')}\n\nNenhum dado novo foi gravado. O aplicativo será encerrado.`
    )
    app.quit()
    return
  }
  registrarIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Encerra o servidor de IA e fecha o banco de forma limpa.
app.on('before-quit', () => {
  encerrarIA()
  fecharBanco()
})
