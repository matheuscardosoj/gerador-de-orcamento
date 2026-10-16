import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes } from './schema'

const raiz = mkdtempSync(join(tmpdir(), 'gdo-confirmacao-'))
vi.mock('electron', () => ({ app: { getPath: () => raiz, isPackaged: false }, dialog: {} }))
let sql: typeof import('./sqlite')
let envio: typeof import('../rascunhos-envio')
beforeAll(async () => {
  sql = await import('./sqlite')
  envio = await import('../rascunhos-envio')
  sql.abrirBanco()
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})

it('migra v13 preservando rascunho e fila', () => {
  const d = new Database(':memory:')
  try {
    aplicarMigracoes(d, 13)
    d.run(
      "INSERT INTO rascunhos_compartilhados VALUES ('r','recibo','d',NULL,'pc',1,'{}','{}','agora','agora','local')"
    )
    d.run(
      "INSERT INTO fila_nuvem(id,entidade,base,payload,criado_em) VALUES ('op','recibo:d',1,'{}','agora')"
    )
    aplicarMigracoes(d)
    expect(d.get("SELECT estado FROM rascunhos_compartilhados WHERE id='r'")).toEqual({
      estado: 'local'
    })
    expect(d.get("SELECT id FROM fila_nuvem WHERE id='op'")).toEqual({ id: 'op' })
  } finally {
    d.close()
  }
})
it('só confirma quando todas as operações vinculadas recebem ACK; falhas externas não viram conflito', () => {
  sql.run(
    "INSERT INTO rascunhos_compartilhados VALUES ('r','recibo','d',NULL,'pc',1,'{}','{}','agora','agora','local')"
  )
  sql.tx(() => envio.vincularAplicacaoRascunho('r', ['op1', 'op2']))
  sql.run(
    "INSERT INTO fila_nuvem(id,entidade,base,payload,criado_em,estado) VALUES ('outro','clientes:x',1,'{}','agora','falha')"
  )
  sql.tx(() => envio.confirmarAplicacoesRascunhos(['op1']))
  envio.atualizarAplicacoesRascunhos()
  expect(sql.get("SELECT estado FROM rascunhos_compartilhados WHERE id='r'")?.estado).toBe(
    'aguardando_confirmacao'
  )
  sql.tx(() => envio.confirmarAplicacoesRascunhos(['op2']))
  expect(sql.get("SELECT estado FROM rascunhos_compartilhados WHERE id='r'")?.estado).toBe(
    'aplicado'
  )
})
