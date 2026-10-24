// Captura as telas principais (claro e escuro) contra a API de demonstração, para comparar a
// aparência antes e depois de uma atualização de estilos ou de dependências.
// Uso: node scripts/capturar-telas.mjs <pasta-de-saida>
//      node scripts/capturar-telas.mjs --comparar <pasta-a> <pasta-b>   (diferença por tela)
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import sharp from 'sharp'
import { _electron } from 'playwright'

if (process.argv[2] === '--comparar') {
  const [a, b] = [resolve(process.argv[3]), resolve(process.argv[4])]
  let pior = 0
  for (const nome of readdirSync(a).filter((n) => n.endsWith('.png'))) {
    const [x, y] = await Promise.all(
      [a, b].map((p) =>
        sharp(join(p, nome)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      )
    )
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
      console.log(`${nome}: tamanhos diferentes`)
      pior = 100
      continue
    }
    let diferentes = 0
    for (let i = 0; i < x.data.length; i += 4) {
      const d =
        Math.abs(x.data[i] - y.data[i]) +
        Math.abs(x.data[i + 1] - y.data[i + 1]) +
        Math.abs(x.data[i + 2] - y.data[i + 2])
      if (d > 24) diferentes++
    }
    const pct = (diferentes / (x.data.length / 4)) * 100
    pior = Math.max(pior, pct)
    console.log(`${nome}: ${pct.toFixed(3)}% dos pixels diferem`)
  }
  process.exit(pior > 0.5 ? 1 : 0)
}

const saida = resolve(process.argv[2] ?? 'capturas')
mkdirSync(saida, { recursive: true })
const raiz = resolve('.')
const servidor = await createServer({
  root: join(raiz, 'src/renderer'),
  configFile: false,
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: { '@renderer': join(raiz, 'src/renderer/src'), '@shared': join(raiz, 'src/shared') }
  },
  css: { postcss: raiz },
  server: { port: 5199, strictPort: true }
})
await servidor.listen()
const pasta = mkdtempSync(join(tmpdir(), 'gdo-telas-'))
writeFileSync(
  join(pasta, 'main.cjs'),
  `const { app, BrowserWindow } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { sandbox: true } })
  w.loadURL('http://localhost:5199/')
})`
)
const app = await _electron.launch({ args: [join(pasta, 'main.cjs')] })
try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined)
  await page.waitForLoadState('domcontentloaded')
  for (const tema of ['claro', 'escuro']) {
    await page.evaluate((t) => localStorage.setItem('gdo:tema', t), tema)
    await page.reload()
    await page.waitForTimeout(1200)
    const foto = async (nome) => {
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(saida, `${tema}-${nome}.png`) })
    }
    await foto('01-entrada')
    await page
      .getByRole('button', { name: 'Entrar', exact: true })
      .click()
      .catch(() => undefined)
    const campo = page.locator('input[type=email]').first()
    if (await campo.count()) {
      await campo.fill('pessoa@example.com')
      await page.locator('input[type=password]').first().fill('12345678')
      await page.getByRole('button', { name: 'Entrar', exact: true }).last().click()
    }
    await page.waitForTimeout(800)
    const empresa = page.getByRole('button', { name: /Empresa de demonstração/ })
    if (await empresa.count()) {
      await foto('02-escolher-empresa')
      await empresa.first().click()
    }
    await page.waitForTimeout(800)
    for (const [nome, rotulo] of [
      ['03-orcamentos', /^Orçamentos/],
      ['04-relatorios', /^Relatórios/],
      ['05-recibos', /^Recibos/],
      ['06-cadastros', /^Cadastros/],
      ['07-configuracoes', /^Configurações/]
    ]) {
      await page
        .getByRole('button', { name: rotulo })
        .first()
        .click()
        .catch(() => undefined)
      await foto(nome)
    }
    await page
      .getByRole('button', { name: /^Orçamentos/ })
      .first()
      .click()
    await page
      .getByRole('button', { name: /Novo orçamento/ })
      .first()
      .click()
      .catch(() => undefined)
    await foto('08-editor-orcamento')
  }
  console.log(`Capturas em ${saida}: ${readdirSync(saida).length} arquivos`)
} finally {
  await app.close()
  await servidor.close()
  rmSync(pasta, { recursive: true, force: true })
}
