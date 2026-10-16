// Valida o executável empacotado com um perfil temporário, sem tocar nos dados reais.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { _electron } from 'playwright'

const pasta = resolve('output/instalacao-teste-1.5.0-rc.19')
const perfil = join(pasta, 'perfil-validacao')
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
  assert.equal(versao, '1.5.0-rc.19')
  assert.match(texto, /Bem-vindo/)
  assert.deepEqual(erros, [])
  await page.screenshot({ path: join(pasta, 'rc19-abertura.png'), fullPage: true })
  const resultado = { ok: true, titulo, versao, perfil, erros }
  writeFileSync(join(pasta, 'abertura.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} finally {
  await app.close()
}
