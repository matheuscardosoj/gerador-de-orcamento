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
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify(
      {
        errosAmigaveis: true,
        recuperacaoVisivel: true,
        confirmacao: true,
        pendenciasPreservadas: 37,
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
