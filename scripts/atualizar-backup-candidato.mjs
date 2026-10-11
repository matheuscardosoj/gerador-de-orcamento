// Migração/exportação em cópia isolada; o arquivo de origem permanece intacto.
import { _electron as electron } from 'playwright'
import sqlite from 'node-sqlite3-wasm'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const { Database } = sqlite
assert.ok(process.argv[2] && process.argv[3], 'Informe o backup e o executável candidato.')
const origem = resolve(process.argv[2]),
  exe = resolve(process.argv[3])
const pasta = resolve('output/backups-corrigidos', `compatibilidade-rc2-${Date.now()}`)
const perfil = join(pasta, 'perfil'),
  copia = join(perfil, 'data/banco.db')
const destino = join(pasta, 'D-MATHEUS (atualizado) - compativel 1.4.0-rc.2.gdo-backup')
mkdirSync(join(perfil, 'data'), { recursive: true })
copyFileSync(origem, copia)
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const hashOrigem = hash(origem)
assert.equal(hash(copia), hashOrigem)
const original = new Database(copia)
const tabelas = original.all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name)
const antes = Object.fromEntries(
  tabelas.map((t) => [t, original.all(`SELECT * FROM ${t} ORDER BY rowid`)])
)
assert.equal(original.get('PRAGMA integrity_check').integrity_check, 'ok')
original.close()
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
})
try {
  await app.evaluate(({ dialog }, arquivo) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: arquivo })
    dialog.showMessageBoxSync = () => 1
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arquivo] })
  }, destino)
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.api.aplicativo.versao()), '1.4.0-rc.2')
  await page.evaluate(() => window.api.dados.exportar())
  const atualizado = new Database(destino)
  assert.equal(atualizado.get('PRAGMA user_version').user_version, 8)
  assert.equal(atualizado.get('PRAGMA integrity_check').integrity_check, 'ok')
  assert.deepEqual(atualizado.all('PRAGMA foreign_key_check'), [])
  for (const t of tabelas) {
    const depois = atualizado.all(`SELECT * FROM ${t} ORDER BY rowid`)
    if (t === 'servicos') {
      assert.deepEqual(
        depois.map(({ ordem: _ordem, ...r }) => r),
        antes[t]
      )
      continue
    }
    if (t === 'clientes') {
      assert.deepEqual(
        depois.map((r) => ({ ...r, dados_json: JSON.parse(r.dados_json) })),
        antes[t].map((r) => ({ ...r, dados_json: JSON.parse(r.dados_json) }))
      )
      continue
    }
    if (t === 'configuracoes') {
      for (const r of antes[t])
        if (
          ![
            'computadorId',
            'sessaoNuvem',
            'nuvem',
            'usuarioNuvem',
            'cursorNuvem',
            'ultimaNuvem',
            'erroNuvem',
            'bytesNuvem'
          ].includes(r.chave) &&
          !r.chave.startsWith('estado:') &&
          !r.chave.startsWith('transferencia:')
        )
          assert.equal(
            atualizado.get('SELECT valor FROM configuracoes WHERE chave=?', [r.chave]).valor,
            r.valor
          )
      assert.equal(
        atualizado.get(
          "SELECT count(*) AS n FROM configuracoes WHERE chave IN ('computadorId','sessaoNuvem','nuvem')"
        ).n,
        0
      )
      continue
    }
    assert.deepEqual(depois, antes[t], t)
  }
  const numeros = atualizado
    .all('SELECT numero FROM orcamentos ORDER BY numero')
    .map((r) => r.numero)
  assert.deepEqual(
    numeros,
    Array.from({ length: 17 }, (_, n) => n + 1)
  )
  const resultado = {
    esquema: 8,
    clientes: antes.clientes.length,
    orcamentos: antes.orcamentos.length,
    relatorios: antes.relatorios.length,
    imagens: antes.imagens.length,
    versoes: antes.versoes.length,
    numeros,
    hashOriginal: hashOrigem,
    hashAtualizado: hash(destino),
    destino
  }
  atualizado.close()
  await page.evaluate(() => window.api.dados.importar('restaurar'))
  const restaurado = await page.evaluate(async () => ({
    clientes: (await window.api.clientes.list()).length,
    orcamentos: (await window.api.orcamentos.list()).map((r) => r.numero).sort((a, b) => a - b),
    relatorios: (await window.api.relatorios.list()).length,
    proximoNumero: await window.api.orcamentos.proximoNumero()
  }))
  assert.equal(restaurado.clientes, resultado.clientes)
  assert.deepEqual(restaurado.orcamentos, numeros)
  assert.equal(restaurado.relatorios, resultado.relatorios)
  assert.equal(restaurado.proximoNumero, 18)
  assert.equal(hash(origem), hashOrigem)
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify({ ...resultado, restaurado, originalPreservado: true }, null, 2)
  )
  console.log(JSON.stringify({ ...resultado, originalPreservado: true }))
} finally {
  await app.close()
}
