import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { aplicarMigracoes } from './schema'
const raiz = mkdtempSync(join(tmpdir(), 'gdo-fila-estados-'))
vi.mock('electron', () => ({
  app: { getPath: () => raiz, isPackaged: false, getAppPath: () => raiz },
  dialog: {}
}))
let sql: typeof import('./sqlite'),
  fila: typeof import('../fila-nuvem'),
  versoes: typeof import('../versoes')
beforeAll(async () => {
  sql = await import('./sqlite')
  fila = await import('../fila-nuvem')
  versoes = await import('../versoes')
  sql.abrirBanco()
})
beforeEach(() => sql.run('DELETE FROM fila_nuvem'))
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})
function inserir(id: string, estado: string, grupo = id, base = 0): void {
  sql.run(
    'INSERT INTO fila_nuvem(id,entidade,base,payload,criado_em,grupo,estado) VALUES(?,?,?,?,?,?,?)',
    [id, 'clientes:teste', base, '{"tabela":"clientes","id":"teste"}', '2026-10-12', grupo, estado]
  )
}
it('migra a lista antiga para estados explícitos preservando todas as identidades e payloads', () => {
  const d = new Database(':memory:')
  try {
    aplicarMigracoes(d, 10)
    for (let n = 0; n < 37; n++)
      d.run('INSERT INTO fila_nuvem VALUES(?,?,?,?,?,?,?)', [
        String(n),
        'clientes:teste',
        n,
        '{"row":null}',
        '2026-10-12',
        null,
        String(n)
      ])
    d.run('INSERT INTO configuracoes VALUES(?,?)', [
      'operacoesAnterioresSuspensas',
      JSON.stringify(Array.from({ length: 37 }, (_, n) => String(n)))
    ])
    const antes = d.all('SELECT * FROM fila_nuvem ORDER BY rowid')
    aplicarMigracoes(d)
    expect(
      d.all(
        'SELECT id,entidade,base,payload,criado_em,geracao,grupo FROM fila_nuvem ORDER BY rowid'
      )
    ).toEqual(antes)
    expect(d.get("SELECT COUNT(*) AS n FROM fila_nuvem WHERE estado='preservada'")).toEqual({
      n: 37
    })
    expect(
      d.get("SELECT 1 FROM configuracoes WHERE chave='operacoesAnterioresSuspensas'")
    ).toBeNull()
  } finally {
    d.close()
  }
})
it('uma operação preservada não altera a revisão de uma nova edição', () => {
  inserir('antiga', 'preservada', 'antigo', 120)
  sql.run('INSERT INTO configuracoes VALUES(?,?)', ['nuvem', '{}'])
  sql.run('INSERT INTO sincronizacao VALUES(?,?)', ['clientes:teste', 7])
  versoes.enfileirar('clientes:teste', { tabela: 'clientes', id: 'teste' })
  expect(fila.filaParaEnvio()).toMatchObject([{ base: 7, estado: 'pendente' }])
  expect(fila.ultimaBaseAtiva('clientes:teste')).toBe(7)
  expect(sql.get("SELECT base FROM fila_nuvem WHERE id='antiga'")?.base).toBe(120)
})
it('não envia metade de um grupo e tenta novamente preservando opid, base e payload', () => {
  inserir('financeiro', 'falha', 'grupo', 3)
  inserir('documento', 'pendente', 'grupo', 4)
  inserir('preservada', 'preservada')
  const antes = sql.all("SELECT id,base,payload,grupo FROM fila_nuvem WHERE grupo='grupo'")
  expect(fila.filaParaEnvio()).toEqual([])
  fila.tentarNovamenteOperacao('financeiro')
  expect(fila.filaParaEnvio()).toHaveLength(2)
  expect(sql.all("SELECT id,base,payload,grupo FROM fila_nuvem WHERE grupo='grupo'")).toEqual(antes)
  expect(() => fila.tentarNovamenteOperacao('preservada')).toThrow('não está')
})
