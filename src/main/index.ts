import { documentoJaVersionado, registrarVersao } from './versoes'
import { orcamentosRepo, relatoriosRepo } from './repositories'
import { mensagemErro } from '@shared/erros'
import { recibosRepo } from './recibos'
import { concluirCallbackEmail, inicializarContas } from './contas/servico'
import { callbacksNosArgumentos } from './contas/callback-email'
import { registrarAvisoEmail } from './contas/avisos-email'
import { pararTempoReal, solicitarRecuperacaoNuvem } from './tempo-real'
import { observarDados } from './eventos'
import { app, shell, dialog, BrowserWindow, powerMonitor } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { abrirBanco, fecharBanco } from './db/sqlite'
import { migrarJsonSeExistir } from './db/migrar-json'
import { bancoVazio, semear } from './repositories'
import { encerrarIA } from './ia'
import { haAlteracoesPendentes, liberarAlteracoesPendentes, registrarIpc } from './ipc'
import { urlDoAplicativo } from './origem-janela'
import { registrarDiagnostico } from './diagnostico'
import { exportarDiagnostico } from './diagnostico-exportar'

// Falhas que nenhuma tela mostra ficam registradas para o suporte (sem mudar o comportamento).
process.on('unhandledRejection', (motivo) => registrarDiagnostico('promessa-rejeitada', motivo))
process.on('uncaughtExceptionMonitor', (erro) => registrarDiagnostico('excecao-nao-tratada', erro))

// Usado só por testes automatizados e validações de pacote. Nunca é definido
// pelo instalador, portanto o perfil normal do usuário continua inalterado.
if (process.env.GERADOR_USER_DATA_DIR) {
  app.setPath('userData', process.env.GERADOR_USER_DATA_DIR)
}

const temTrava = app.requestSingleInstanceLock()
if (!temTrava) app.quit()
if (temTrava && !process.env.GERADOR_USER_DATA_DIR) {
  if (process.defaultApp && process.argv[1])
    app.setAsDefaultProtocolClient('geradororcamento', process.execPath, [process.argv[1]])
  else app.setAsDefaultProtocolClient('geradororcamento')
}
const callbacksPendentes = callbacksNosArgumentos(process.argv)
let prontoParaCallback = false
let processandoCallback = false
async function processarCallbacks(): Promise<void> {
  if (!prontoParaCallback || processandoCallback) return
  processandoCallback = true
  try {
    while (callbacksPendentes.length) {
      const url = callbacksPendentes.shift()!
      registrarAvisoEmail(await concluirCallbackEmail(url))
    }
  } finally {
    processandoCallback = false
  }
}

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
      `Não foi possível importar os dados antigos:\n\n${mensagemErro(e)}\n\n` +
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
      sandbox: true,
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

  // A janela só exibe o próprio aplicativo: nada a redireciona para conteúdo externo,
  // que herdaria o acesso do preload ao IPC.
  const bloquearNavegacaoExterna = (evento: { preventDefault: () => void }, url: string): void => {
    if (!urlDoAplicativo(url, process.env['ELECTRON_RENDERER_URL'])) evento.preventDefault()
  }
  mainWindow.webContents.on('will-navigate', bloquearNavegacaoExterna)
  mainWindow.webContents.on('will-redirect', bloquearNavegacaoExterna)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (temTrava)
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.gerador.orcamentos')
    powerMonitor.on('resume', () => solicitarRecuperacaoNuvem('resume'))
    powerMonitor.on('unlock-screen', () => solicitarRecuperacaoNuvem('unlock'))
    app.on('browser-window-focus', () => solicitarRecuperacaoNuvem('focus'))

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
          // Evita montar o documento completo (com imagens) quando já há versão.
          if (documentoJaVersionado(tipo, d.id)) continue
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
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    const contasProntas = inicializarContas()
    createWindow()
    try {
      await contasProntas
    } catch (erro) {
      registrarDiagnostico('recuperar-contas', erro)
      const escolha = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Não foi possível recuperar seu acesso',
        message: 'Não foi possível recuperar seu acesso',
        detail: mensagemErro(erro),
        buttons: ['OK', 'Exportar diagnóstico'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      if (escolha === 1) await exportarDiagnostico()
    }
    app.once('before-quit', pararTempoReal)

    prontoParaCallback = true
    void processarCallbacks()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

app.on('second-instance', (_evento, args) => {
  callbacksPendentes.push(...callbacksNosArgumentos(args))
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
  void processarCallbacks()
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
