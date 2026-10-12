import { registrarVersao } from './versoes'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import { mensagemErro } from '@shared/erros'
import { recibosRepo } from './recibos'
import { capturarCadastros, sincronizarNuvem, statusNuvem, inicializarNuvem } from './nuvem'
import { pararTempoReal } from './tempo-real'
import { observarDados } from './eventos'
import { app, shell, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { abrirBanco, fecharBanco } from './db/sqlite'
import { migrarJsonSeExistir } from './db/migrar-json'
import { bancoVazio, semear } from './repositories'
import { encerrarIA } from './ia'
import { haAlteracoesPendentes, liberarAlteracoesPendentes, registrarIpc } from './ipc'

// Usado só por testes automatizados e validações de pacote. Nunca é definido
// pelo instalador, portanto o perfil normal do usuário continua inalterado.
if (process.env.GERADOR_USER_DATA_DIR) {
  app.setPath('userData', process.env.GERADOR_USER_DATA_DIR)
}

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

  mainWindow.on('close', (evento) => {
    if (!haAlteracoesPendentes()) return
    const escolha = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Alterações não salvas',
      message: 'Existem alterações não salvas neste editor.',
      detail: 'Se fechar agora, as alterações serão perdidas.',
      buttons: ['Continuar editando', 'Descartar alterações'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (escolha === 0) evento.preventDefault()
    else liberarAlteracoesPendentes()
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

if (temTrava)
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.gerador.orcamentos')

    // Inicializa o banco (cria arquivo, migra o JSON ou semeia) e registra o IPC.
    try {
      iniciarBanco()
      for (const tipo of ['orcamento', 'relatorio', 'recibo'] as const) {
        const repo =
          tipo === 'orcamento'
            ? orcamentosRepo
            : tipo === 'relatorio'
              ? relatoriosRepo
              : recibosRepo
        for (const d of repo.list()) {
          const completo = repo.get(d.id)
          if (completo && !completo.versao)
            registrarVersao(tipo, completo, 'Versão inicial após migração')
        }
      }
    } catch (e) {
      dialog.showErrorBox(
        'Não foi possível atualizar o banco de dados',
        `${mensagemErro(e)}\n\nO aplicativo será encerrado. Preserve o banco e o backup para conferir o problema antes de tentar novamente.`
      )
      app.quit()
      return
    }
    registrarIpc()
    const pararEventos = observarDados((evento) => {
      for (const janela of BrowserWindow.getAllWindows()) {
        if (!janela.webContents.isDestroyed()) janela.webContents.send('dados.alterados', evento)
      }
    })
    app.once('before-quit', pararEventos)
    capturarCadastros()
    const sincronizarQuandoConectado = (): void => {
      if (statusNuvem().autenticada && (statusNuvem().protocolo ?? 1) < 2) void sincronizarNuvem()
    }
    void inicializarNuvem()
    const intervaloNuvem = setInterval(sincronizarQuandoConectado, 30000)
    app.once('before-quit', () => clearInterval(intervaloNuvem))
    app.once('before-quit', pararTempoReal)

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
