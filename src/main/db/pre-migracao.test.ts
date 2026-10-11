import { it, expect, vi, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes } from './schema'
import { prepararMigracao } from './pre-migracao'

const disco = vi.hoisted(() => ({ livre: Number.MAX_SAFE_INTEGER }))
vi.mock('fs', async (original) => ({
  ...(await original<typeof import('fs')>()),
  statfsSync: () => ({ bavail: disco.livre, bsize: 1 })
}))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-migracao-'))
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

it('verifica backup, calcula Base64 deduplicado e conserva os bytes das imagens legadas', () => {
  const caminho = join(raiz, 'banco.db')
  const d = new Database(caminho)
  aplicarMigracoes(d, 6)
  d.exec(
    "INSERT INTO orcamentos(id,numero,data,criado_em,atualizado_em) VALUES('p',1,'2026-10-11','agora','agora')"
  )
  const foto = Buffer.alloc(350001, 23),
    miniatura = Buffer.alloc(10001, 42)
  for (const id of ['a', 'b'])
    d.run('INSERT INTO anexos(id,orcamento_id,imagem,miniatura) VALUES(?,?,?,?)', [
      id,
      'p',
      foto,
      miniatura
    ] as never)
  d.close()
  const original = readFileSync(caminho)
  const backup = prepararMigracao(caminho)!
  expect(readFileSync(backup)).toEqual(original)
  const estimativa = JSON.parse(readFileSync(`${backup}.json`, 'utf8'))
  expect(estimativa.imagensUnicas).toBe(1)
  expect(estimativa.imagensTextoBytes).toBe(
    4 * Math.ceil(foto.length / 3) + 4 * Math.ceil(miniatura.length / 3)
  )
  const atualizado = new Database(caminho)
  aplicarMigracoes(atualizado)
  const imagens = atualizado.all('SELECT * FROM imagens') as Array<{
    base64: string
    miniatura_base64: string
  }>
  expect(imagens).toHaveLength(1)
  expect(Buffer.from(imagens[0].base64, 'base64')).toEqual(foto)
  expect(Buffer.from(imagens[0].miniatura_base64, 'base64')).toEqual(miniatura)
  expect(
    atualizado.get(
      "SELECT count(*) AS n FROM anexos WHERE typeof(imagem)='text' AND miniatura IS NULL"
    )
  ).toEqual({ n: 2 })
  atualizado.close()
})

it('recusa migração sem espaço antes de gravar e não reutiliza backup incompatível', () => {
  const caminho = join(raiz, 'outro.db')
  const d = new Database(caminho)
  aplicarMigracoes(d, 6)
  d.close()
  const original = readFileSync(caminho)
  disco.livre = 0
  expect(() => prepararMigracao(caminho)).toThrow('livres')
  expect(readFileSync(caminho)).toEqual(original)
  disco.livre = Number.MAX_SAFE_INTEGER
  writeFileSync(join(raiz, 'backups', 'banco-pre-v8.db'), 'backup antigo corrompido')
  const backup = prepararMigracao(caminho)!
  expect(backup).not.toBe(join(raiz, 'backups', 'banco-pre-v8.db'))
  expect(readFileSync(backup)).toEqual(original)
})
