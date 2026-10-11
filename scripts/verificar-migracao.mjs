// Cópia do banco em uso para perfil isolado; nunca abre ou altera o arquivo original.
import { _electron as electron } from 'playwright'
import sqlite from 'node-sqlite3-wasm'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
const { Database } = sqlite

const origem = resolve(
  process.argv[2] ?? join(process.env.APPDATA, 'gerador-de-orcamento', 'data', 'banco.db')
)
const executavel = process.argv[3] ? resolve(process.argv[3]) : undefined
const saida = resolve('output/playwright', `migracao-${Date.now()}`)
const perfil = join(saida, 'perfil')
mkdirSync(join(perfil, 'data'), { recursive: true })
const hash = (arquivo) => createHash('sha256').update(readFileSync(arquivo)).digest('hex')
const originalHash = hash(origem)
const copia = join(perfil, 'data', 'banco.db')
copyFileSync(origem, copia)
assert.equal(hash(copia), originalHash)
const antigo = new Database(copia)
assert.equal(antigo.get('PRAGMA integrity_check').integrity_check, 'ok')
const versaoOrigem = antigo.get('PRAGMA user_version').user_version
const contagens = Object.fromEntries(
  ['clientes', 'orcamentos', 'relatorios'].map((t) => [
    t,
    antigo.get(`SELECT count(*) AS n FROM ${t}`).n
  ])
)
const fotos = [
  ...antigo.all('SELECT imagem FROM anexos'),
  ...antigo.all('SELECT imagem FROM relatorio_anexos')
]
  .map((r) => r.imagem)
  .filter((i) => i instanceof Uint8Array)
  .map((i) => createHash('sha256').update(i).digest('hex'))
antigo.close()
const app = await electron.launch({
  executablePath: executavel,
  args: executavel ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
})
const erros = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  const resultado = await page.evaluate(async () => {
    const clientes = await window.api.clientes.list(),
      propostas = await window.api.orcamentos.list(),
      relatorios = await window.api.relatorios.list()
    const versoes = []
    for (const [tipo, documentos] of [
      ['orcamento', propostas],
      ['relatorio', relatorios]
    ])
      for (const d of documentos) versoes.push((await window.api.versoes.list(tipo, d.id)).length)
    return {
      clientes: clientes.length,
      orcamentos: propostas.length,
      relatorios: relatorios.length,
      versoes,
      versaoApp: await window.api.aplicativo.versao()
    }
  })
  for (const [tipo, numero] of Object.entries(contagens)) assert.equal(resultado[tipo], numero)
  assert.ok(resultado.versoes.every((n) => n >= 1))
  assert.deepEqual(erros, [])
  await page.screenshot({ path: join(saida, 'migracao-local.png') })
  await app.close()
  const atualizado = new Database(copia)
  assert.equal(atualizado.get('PRAGMA integrity_check').integrity_check, 'ok')
  for (const foto of fotos) {
    const row = atualizado.get('SELECT base64 FROM imagens WHERE hash=?', [foto])
    assert.ok(row)
    assert.equal(createHash('sha256').update(Buffer.from(row.base64, 'base64')).digest('hex'), foto)
  }
  atualizado.close()
  if (versaoOrigem < 8) {
    const pasta = join(perfil, 'data', 'backups')
    const backup = readdirSync(pasta).find((n) => n.startsWith('banco-pre-v8') && n.endsWith('.db'))
    assert.equal(hash(join(pasta, backup)), originalHash)
    assert.ok(JSON.parse(readFileSync(join(pasta, `${backup}.json`), 'utf8')).bytesNecessarios > 0)
  }
  assert.equal(hash(origem), originalHash)
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify(
      {
        origemHash: originalHash,
        versaoOrigem,
        contagens,
        fotosConferidas: fotos.length,
        ...resultado,
        erros
      },
      null,
      2
    )
  )
  console.log(`MIGRAÇÃO CONFERIDA EM CÓPIA: ${saida}`)
} finally {
  await app.close().catch(() => {})
}
