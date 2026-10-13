// Exporta uma cópia estável da base escolhida e verifica sua restauração.
// A origem nunca é aberta pelo SQLite nem modificada pelo aplicativo de teste.
import { _electron as electron } from 'playwright'
import sqlite from 'node-sqlite3-wasm'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const { Database } = sqlite
assert.ok(process.argv[2] && process.argv[3], 'Informe o banco de origem e o executável.')
const origem = resolve(process.argv[2]),
  executablePath = resolve(process.argv[3])
const versao = process.argv[4] ?? '1.5.0-rc.1'
const pasta = resolve('output/backups-corrigidos', `base-atual-${Date.now()}`)
const perfil = join(pasta, 'exportacao'),
  destino = join(pasta, `Base atual - compatível ${versao}.gdo-backup`)
mkdirSync(join(perfil, 'data'), { recursive: true })
const hash = (b) => createHash('sha256').update(b).digest('hex')
const bytes = readFileSync(origem)
writeFileSync(join(perfil, 'data/banco.db'), bytes)
assert.equal(
  hash(readFileSync(origem)),
  hash(bytes),
  'A origem mudou durante a cópia; repita com as edições concluídas.'
)
const locais = new Set([
  'reservas',
  'fila_nuvem',
  'sincronizacao',
  'conflitos_nuvem',
  'edicoes_documento'
])
const chaveLocal = (k) =>
  [
    'computadorId',
    'sessaoNuvem',
    'nuvem',
    'usuarioNuvem',
    'contextoNuvem',
    'empresaNuvem',
    'membrosCache',
    'pedidosEdicaoCache',
    'cursorNuvem',
    'ultimaNuvem',
    'erroNuvem',
    'bytesNuvem',
    'restauracaoLocal',
    'idOrigemDados',
    'atualizacaoNumeracaoPendente',
    'operacoesAnterioresSuspensas',
    'backupAtualizacaoNumeracao',
    'renumeracaoPendente'
  ].includes(k) ||
  k.startsWith('estado:') ||
  k.startsWith('transferencia:') ||
  k.startsWith('computadorUsuario:') ||
  k.startsWith('numeracaoNuvem:')
function ler(caminho) {
  const db = new Database(caminho)
  try {
    assert.equal(db.get('PRAGMA integrity_check').integrity_check, 'ok')
    assert.deepEqual(db.all('PRAGMA foreign_key_check'), [])
    return Object.fromEntries(
      db
        .all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map(({ name }) => [name, db.all(`SELECT * FROM ${name} ORDER BY rowid`)])
    )
  } finally {
    db.close()
  }
}
const antes = ler(join(perfil, 'data/banco.db'))
const isolada = new Database(join(perfil, 'data/banco.db'))
try {
  for (const r of isolada.all('SELECT chave FROM configuracoes'))
    if (chaveLocal(r.chave) && r.chave !== 'idOrigemDados')
      isolada.run('DELETE FROM configuracoes WHERE chave=?', [r.chave])
  // A exportação do aplicativo arquiva fila/conflitos na auditoria antes de
  // sanitizar o backup. Preserva as evidências da fonte sem publicar nada.
  for (const t of locais)
    if (!['fila_nuvem', 'conflitos_nuvem'].includes(t)) isolada.exec(`DELETE FROM ${t}`)
} finally {
  isolada.close()
}
const conferir = (depois) => {
  for (const [t, linhas] of Object.entries(antes)) {
    if (locais.has(t)) continue
    if (t === 'auditoria_colaboracao') {
      for (const linha of linhas)
        assert.ok(
          depois[t].some((l) => JSON.stringify(l) === JSON.stringify(linha)),
          'Auditoria anterior perdida.'
        )
      continue
    }
    if (t === 'configuracoes') {
      for (const r of linhas.filter((r) => !chaveLocal(r.chave)))
        assert.equal(depois[t].find((d) => d.chave === r.chave)?.valor, r.valor, r.chave)
    } else assert.deepEqual(depois[t], linhas, t)
  }
}
let app
try {
  app = await electron.launch({
    executablePath,
    args: [],
    env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
  })
  await app.evaluate(({ dialog }, destino) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destino })
  }, destino)
  let page = await app.firstWindow()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.api.aplicativo.versao()), versao)
  await page.evaluate(() => window.api.dados.exportar())
  conferir(ler(destino))
  const seguro = new Database(destino)
  try {
    assert.equal(
      seguro.get(
        "SELECT count(*) AS n FROM configuracoes WHERE chave IN ('sessaoNuvem','nuvem','computadorId','contextoNuvem')"
      ).n,
      0
    )
    assert.equal(seguro.get('SELECT count(*) AS n FROM edicoes_documento').n, 0)
    assert.equal(seguro.get('SELECT count(*) AS n FROM reservas').n, 0)
  } finally {
    seguro.close()
  }
  await app.close()
  app = undefined
  const restauracao = join(pasta, 'restauracao')
  app = await electron.launch({
    executablePath,
    args: [],
    env: { ...process.env, GERADOR_USER_DATA_DIR: restauracao }
  })
  await app.evaluate(({ dialog }, destino) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destino] })
    dialog.showMessageBoxSync = () => 1
  }, destino)
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  await page.evaluate(() => window.api.dados.importar('restaurar'))
  await app.close()
  app = undefined
  conferir(ler(join(restauracao, 'data/banco.db')))
  assert.equal(
    hash(readFileSync(origem)),
    hash(bytes),
    'A base de origem recebeu edições durante a verificação; preserve uma cópia atualizada antes da troca.'
  )
  const resultado = {
    destino,
    hashOrigem: hash(bytes),
    hashBackup: hash(readFileSync(destino)),
    originalPreservado: true,
    restauracaoVerificada: true,
    contagens: Object.fromEntries(
      Object.entries(antes)
        .filter(([t]) => !locais.has(t))
        .map(([t, r]) => [t, r.length])
    )
  }
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} finally {
  if (app) await app.close()
}
