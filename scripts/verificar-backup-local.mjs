import sqlite from 'node-sqlite3-wasm'

if (!process.argv[2]) throw new Error('Informe o caminho do backup.')
const banco = new sqlite.Database(process.argv[2])
try {
  console.log(
    JSON.stringify({
      integrity: banco.get('PRAGMA integrity_check').integrity_check,
      foreignKeys: banco.all('PRAGMA foreign_key_check').length,
      tables: banco.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").length,
      userVersion: banco.get('PRAGMA user_version').user_version
    })
  )
} finally {
  banco.close()
}
