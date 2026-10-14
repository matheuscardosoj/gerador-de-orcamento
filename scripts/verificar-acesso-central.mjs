// Exercita as telas de acesso em um perfil descartável, sem enviar e-mail real.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const pasta = resolve('output/playwright', `acesso-central-${Date.now()}`)
mkdirSync(pasta, { recursive: true })
const exe = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath: exe,
  args: exe ? [] : ['.'],
  env: {
    ...process.env,
    GERADOR_USER_DATA_DIR: join(pasta, 'perfil'),
    ...(exe
      ? {}
      : {
          GERADOR_SERVICO_URL: 'https://exemplo.supabase.co',
          GERADOR_SERVICO_CHAVE: 'sb_publishable_teste'
        })
  }
})
try {
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Bem-vindo' }).waitFor()
  await page.getByRole('button', { name: 'Recebi um convite' }).click()
  await page.getByRole('heading', { name: 'Aceitar convite' }).waitFor()
  await page.getByLabel('E-mail', { exact: true }).fill('convidado@example.com')
  assert.equal(await page.getByLabel('Código recebido por e-mail').count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Reenviar código' }).count(), 1)
  await page.screenshot({ path: join(pasta, 'convite.png'), fullPage: true })

  await page.getByRole('button', { name: 'Voltar para entrar' }).click()
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com')
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('conta.enviarCodigo')
    ipcMain.handle('conta.enviarCodigo', () => undefined)
  })
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await page.getByRole('button', { name: /Reenviar em \d+s/ }).waitFor()
  assert.equal(await page.getByLabel('E-mail', { exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: 'Corrigir e-mail' }).click()
  assert.equal(await page.getByLabel('E-mail', { exact: true }).isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Enviar código' }).count(), 1)
  for (const largura of [1024, 1440]) {
    await app.evaluate(({ BrowserWindow }, valor) => {
      BrowserWindow.getAllWindows()[0].setContentSize(valor, 900)
    }, largura)
    const dimensoes = await page.locator('main').evaluate((elemento) => ({
      visivel: elemento.clientWidth,
      conteudo: elemento.scrollWidth
    }))
    assert.ok(dimensoes.conteudo <= dimensoes.visivel + 1, `Tela excede ${largura}px`)
    await page.screenshot({ path: join(pasta, `recuperacao-${largura}.png`), fullPage: true })
  }
  console.log(`Telas de acesso verificadas. Capturas: ${pasta}`)
} finally {
  await app.close()
}
