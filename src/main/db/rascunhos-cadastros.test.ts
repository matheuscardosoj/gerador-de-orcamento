import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes, VERSAO_BANCO } from './schema'

const raiz = mkdtempSync(join(tmpdir(), 'gdo-rascunhos-cadastros-'))
vi.mock('electron', () => ({
  app: { getPath: () => raiz, isPackaged: false, getAppPath: () => raiz },
  dialog: {}
}))
let sql: typeof import('./sqlite')
let rascunhos: typeof import('../rascunhos-cadastros')
beforeAll(async () => {
  sql = await import('./sqlite')
  rascunhos = await import('../rascunhos-cadastros')
  sql.abrirBanco()
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})

it('migra a base sem alterar a fila existente', () => {
  const d = new Database(':memory:')
  try {
    aplicarMigracoes(d, 12)
    d.run('INSERT INTO fila_nuvem(id,entidade,base,payload,criado_em) VALUES(?,?,?,?,?)', [
      'op-original',
      'clientes:antigo',
      2,
      '{}',
      '2026-10-14'
    ])
    aplicarMigracoes(d)
    expect((d.get('PRAGMA user_version') as { user_version: number }).user_version).toBe(
      VERSAO_BANCO
    )
    expect(d.get("SELECT id FROM fila_nuvem WHERE id='op-original'")).toEqual({ id: 'op-original' })
    expect(d.get("SELECT name FROM sqlite_master WHERE name='rascunhos_cadastros'")).toEqual({
      name: 'rascunhos_cadastros'
    })
  } finally {
    d.close()
  }
})

it('guarda edição de cadastro excluído apenas no SQLite e permite recuperar', () => {
  rascunhos.guardarRascunhoCadastro('cliente', 'apagado', { nome: 'Cliente editado' })
  expect(rascunhos.listarRascunhosCadastro('cliente')).toMatchObject([
    { idOrigem: 'apagado', dados: { nome: 'Cliente editado' } }
  ])
  expect(sql.get("SELECT 1 FROM fila_nuvem WHERE entidade='clientes:apagado'")).toBeNull()
  rascunhos.descartarRascunhoCadastro('cliente', 'apagado')
  expect(rascunhos.listarRascunhosCadastro('cliente')).toEqual([])
})

it('preserva texto padrão excluído sem recriar a entidade remota', () => {
  const dados = { texto: 'Texto alterado', padrao: true, aplicacao: 'ambos' }
  rascunhos.guardarRascunhoCadastro('observacoes', 'apagada', dados)
  expect(rascunhos.listarRascunhosCadastro('observacoes')).toMatchObject([
    { idOrigem: 'apagada', dados }
  ])
  expect(sql.get("SELECT 1 FROM fila_nuvem WHERE entidade='observacoes_padrao:apagada'")).toBeNull()
  rascunhos.descartarRascunhoCadastro('observacoes', 'apagada')
})
