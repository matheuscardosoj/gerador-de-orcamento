// Valida a abertura do executável final com um perfil novo e descartável.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { _electron } from 'playwright'

const pasta = resolve('release/candidato-1.5.4-revisado')
const perfil = join(pasta, 'perfil-validacao-1.5.4')
const executavel = join(pasta, 'win-unpacked', 'Gerador de Orçamentos.exe')
mkdirSync(pasta, { recursive: true })

const app = await _electron.launch({
  executablePath: executavel,
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil },
  args: []
})

try {
  const page = await app.firstWindow()
  const erros = []
  page.on('pageerror', (erro) => erros.push(erro.message))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('body').waitFor({ state: 'visible', timeout: 20_000 })
  await page.waitForFunction(() => document.body.innerText.length > 20, null, {
    timeout: 20_000
  })
  const titulo = await page.title()
  const texto = await page.locator('body').innerText()
  const versao = await page.evaluate(() => window.api.aplicativo.versao())
  assert.match(titulo, /Gerador de Orçamentos/)
  assert.equal(versao, '1.5.4')
  assert.equal(await page.evaluate(() => typeof window.api.nuvem.verificarConexao), 'function')
  await assert.rejects(
    page.evaluate(() => window.api.nuvem.verificarConexao()),
    /Entre na sua conta/
  )
  const eventos = await app.evaluate(({ powerMonitor, app }) => ({
    resume: powerMonitor.listenerCount('resume'),
    foco: app.listenerCount('browser-window-focus')
  }))
  assert.ok(eventos.resume > 0 && eventos.foco > 0)
  assert.match(texto, /Bem-vindo/)
  assert.deepEqual(erros, [])
  await page.screenshot({ path: join(pasta, '1.5.4-abertura.png'), fullPage: true })
  const resultado = { ok: true, titulo, versao, perfil, erros }
  writeFileSync(join(pasta, 'abertura-1.5.4.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} finally {
  await app.close()
}
