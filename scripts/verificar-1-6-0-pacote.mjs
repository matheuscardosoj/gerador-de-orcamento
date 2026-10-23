// Valida o executável final da 1.6.0 com um perfil novo e descartável: abertura, versão,
// recursos empacotados (IA, migração 013 e rollback), tema escuro salvo ao reabrir e o
// bloqueio de navegação externa da janela.
// Uso: node scripts/verificar-1-6-0-pacote.mjs [pasta-do-pacote]  (padrão: release/1.6.0)
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { _electron } from 'playwright'

const pasta = resolve(process.argv[2] ?? 'release/1.6.0')
const desempacotado = join(pasta, 'win-unpacked')
const executavel = join(desempacotado, 'Gerador de Orçamentos.exe')
const recursos = join(desempacotado, 'resources')
const perfil = mkdtempSync(join(tmpdir(), 'gdo-validacao-1.6.0-'))
mkdirSync(pasta, { recursive: true })

// Recursos que precisam estar dentro do instalador.
assert.ok(existsSync(executavel), `executável ausente: ${executavel}`)
const ia = join(recursos, 'ia')
assert.ok(existsSync(join(ia, 'llama-server.exe')), 'llama-server.exe ausente')
const modelos = readdirSync(ia).filter((f) => f.endsWith('.gguf'))
assert.deepEqual(modelos, ['qwen2.5-1.5b-instruct-q4_k_m.gguf'])
assert.ok(statSync(join(ia, modelos[0])).size > 1_000_000_000, 'modelo de IA incompleto')
assert.ok(existsSync(join(recursos, 'servico.json')), 'servico.json ausente')
assert.ok(existsSync(join(recursos, 'supabase', 'migrations', '013_realtime_sem_renovacao.sql')))
assert.ok(
  existsSync(join(recursos, 'supabase', 'rollbacks', '013_desfazer_realtime_sem_renovacao.sql'))
)

async function abrir() {
  return _electron.launch({
    executablePath: executavel,
    env: { ...process.env, GERADOR_USER_DATA_DIR: perfil },
    args: []
  })
}

const resultado = { perfil, erros: [] }
try {
  const app = await abrir()
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (erro) => resultado.erros.push(erro.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => document.body.innerText.length > 20, null, { timeout: 20_000 })
    resultado.titulo = await page.title()
    resultado.versao = await page.evaluate(() => window.api.aplicativo.versao())
    assert.match(resultado.titulo, /Gerador de Orçamentos/)
    assert.equal(resultado.versao, '1.6.0')
    assert.match(await page.locator('body').innerText(), /Bem-vindo/)

    // Janela endurecida: navegar para fora é bloqueado e o IPC aceita o próprio app.
    assert.equal(await page.evaluate(() => typeof window.api.aplicativo.definirTema), 'function')
    await page.evaluate(() => window.api.aplicativo.definirTema('claro'))
    await page.evaluate(() => {
      location.href = 'https://example.com/'
    })
    await page.waitForTimeout(1500)
    assert.match(page.url(), /renderer\/index\.html/)

    // Tema escuro: aplica a classe e guarda a escolha no perfil.
    await page.evaluate(() => {
      localStorage.setItem('gdo:tema', 'escuro')
      location.reload()
    })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    resultado.fundoEscuro = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    )
    assert.equal(resultado.fundoEscuro, 'rgb(10, 10, 10)')
    await page.screenshot({ path: join(pasta, '1.6.0-abertura-escuro.png'), fullPage: true })
  } finally {
    await app.close()
  }

  // Reabre: a escolha do tema deve voltar sozinha.
  const novamente = await abrir()
  try {
    const page = await novamente.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => document.body.innerText.length > 20, null, { timeout: 20_000 })
    resultado.escuroAoReabrir = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    )
    assert.equal(resultado.escuroAoReabrir, true)
    await page.evaluate(() => {
      localStorage.setItem('gdo:tema', 'claro')
      location.reload()
    })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
    await page.screenshot({ path: join(pasta, '1.6.0-abertura-claro.png'), fullPage: true })
  } finally {
    await novamente.close()
  }

  assert.deepEqual(resultado.erros, [])
  resultado.ok = true
  writeFileSync(join(pasta, 'abertura-1.6.0.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} finally {
  rmSync(perfil, { recursive: true, force: true })
}
