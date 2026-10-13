// Interface de recuperação/erros em perfil isolado; nenhuma conexão externa.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const pasta = resolve('output/playwright', `recuperacao-interface-${Date.now()}`)
mkdirSync(pasta, { recursive: true })
const exe = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath: exe,
  args: exe ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(pasta, 'perfil') }
})
try {
  const page = await app.firstWindow()
  await app.evaluate(({ ipcMain }) => {
    const status = {
      configurada: true,
      autenticada: false,
      computador: 'computador-de-teste',
      pendentes: 37,
      conflitos: [],
      ultimaSincronizacao: null,
      erro: null,
      bytesBanco: 0,
      reservas: { orcamento: 0, relatorio: 0, recibo: 0 },
      protocolo: 2,
      tempoReal: 'desconectado'
    }
    let primeira = true
    for (const c of [
      'nuvem.config',
      'nuvem.status',
      'nuvem.conectar',
      'nuvem.finalizarAtualizacao'
    ])
      ipcMain.removeHandler(c)
    ipcMain.handle('nuvem.config', () => ({
      url: 'https://exemplo.supabase.co',
      chavePublica: 'sb_publishable_exemplo',
      email: 'teste@example.com'
    }))
    ipcMain.handle('nuvem.status', () => status)
    ipcMain.handle('nuvem.conectar', () => {
      if (primeira) {
        primeira = false
        throw Error(
          "Error invoking remote method 'nuvem.conectar': Error: Invalid login credentials"
        )
      }
      status.autenticada = true
      status.erro =
        'Existem alterações locais anteriores à atualização. Confira os registros abaixo.'
      status.atualizacaoPendente = {
        revisao: 'conferencia-teste',
        total: 37,
        equivalentes: 0,
        divergentes: 37,
        registros: Array.from({ length: 37 }, (_, i) => ({
          id: String(i),
          entidade: 'clientes:' + i,
          rotulo: 'Cliente de teste ' + (i + 1),
          situacao: 'divergente'
        }))
      }
      return status
    })
    ipcMain.handle('nuvem.finalizarAtualizacao', (_e, revisao) => {
      if (revisao !== 'conferencia-teste') throw Error('Conferência desatualizada')
      status.atualizacaoPendente = null
      status.erro = null
      status.pendentes = 0
      status.pendenciasPreservadas = 37
      status.protocolo = 3
      return status
    })
  })
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.getByRole('tab', { name: 'Nuvem / Sincronização', exact: true }).click()
  await page.getByLabel('Senha', { exact: true }).fill('senha-de-teste')
  const conectar = async () => {
    await page.getByRole('button', { name: 'Conectar', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Conectar', exact: true }).click()
  }
  await conectar()
  await page
    .getByText('E-mail ou senha incorretos. Confira os dados e tente conectar novamente.', {
      exact: true
    })
    .waitFor()
  assert.ok(!(await page.locator('main').innerText()).includes('Error invoking'))
  await page.screenshot({ path: join(pasta, 'erro-amigavel.png'), fullPage: true })
  await conectar()
  await page
    .getByRole('heading', { name: 'Atualizar a cópia deste computador', exact: true })
    .waitFor()
  for (const largura of [1024, 1440]) {
    await app.evaluate(({ BrowserWindow }, l) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.unmaximize()
      w.setContentSize(l, 1000)
    }, largura)
    const g = await page.locator('main').evaluate((e) => ({ w: e.clientWidth, s: e.scrollWidth }))
    assert.ok(g.s <= g.w + 1)
    await page.screenshot({ path: join(pasta, `recuperacao-${largura}.png`), fullPage: true })
  }
  await page
    .getByRole('button', { name: 'Preservar pendências e atualizar base', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar e atualizar', exact: true })
    .click()
  await page
    .getByText(
      '37 operações anteriores guardadas separadamente neste computador. Elas não foram publicadas na nuvem.',
      { exact: true }
    )
    .waitFor()
  assert.equal(
    await page
      .getByRole('heading', { name: 'Atualizar a cópia deste computador', exact: true })
      .count(),
    0
  )
  await app.evaluate(({ ipcMain }) => {
    const status = {
      configurada: true,
      autenticada: true,
      computador: 'computador-de-teste',
      pendentes: 1,
      pendenciasPreservadas: 37,
      conflitos: [],
      ultimaSincronizacao: new Date().toISOString(),
      erro: 'Uma alteração não pôde ser enviada. Confira as operações abaixo; os demais dados continuam sincronizando.',
      bytesBanco: 0,
      reservas: { orcamento: 0, relatorio: 0, recibo: 0 },
      protocolo: 3,
      tempoReal: 'conectado',
      falhas: [
        {
          id: 'exclusao-teste',
          entidade: 'clientes:teste',
          detalhe:
            'Excluir cliente. O formato desta alteração não foi aceito pela nuvem. A operação foi preservada neste computador.'
        }
      ]
    }
    ipcMain.removeHandler('nuvem.sincronizar')
    ipcMain.removeHandler('nuvem.status')
    ipcMain.handle('nuvem.status', () => status)
    ipcMain.removeHandler('nuvem.tentarNovamente')
    ipcMain.handle('nuvem.sincronizar', () => status)
    ipcMain.handle('nuvem.tentarNovamente', (_e, id) => {
      if (id !== 'exclusao-teste') throw Error('Operação incorreta')
      status.pendentes = 0
      status.falhas = []
      status.erro = null
      return status
    })
  })
  await page.getByRole('button', { name: 'Sincronizar agora', exact: true }).click()
  await page
    .getByText(
      'A operação continua guardada neste computador. Outras alterações podem ser recebidas e enviadas.',
      { exact: true }
    )
    .waitFor()
  await page
    .getByRole('button', { name: 'Uma alteração precisa de atenção', exact: true })
    .waitFor()
  await page.screenshot({ path: join(pasta, 'falha-isolada.png'), fullPage: true })
  await page.getByRole('button', { name: 'Tentar enviar novamente', exact: true }).click()
  await page.getByText('Conta conectada · 0 alterações aguardando envio', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Tentar enviar novamente', exact: true }).count(),
    0
  )
  await page.getByRole('button', { name: 'Nuvem sincronizada', exact: true }).waitFor()
  await page.screenshot({ path: join(pasta, 'pendencias-resolvidas.png'), fullPage: true })
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify(
      {
        errosAmigaveis: true,
        recuperacaoVisivel: true,
        confirmacao: true,
        pendenciasPreservadas: 37,
        falhaIsolada: true,
        novaTentativa: true,
        larguras: [1024, 1440]
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ pasta, validado: true }))
} finally {
  await app.close()
}
