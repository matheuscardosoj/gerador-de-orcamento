import { afterAll, expect, it } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { aplicarMigracoes } from './schema'

const raiz = mkdtempSync(join(tmpdir(), 'gdo-v9-'))
afterAll(() => rmSync(raiz, { recursive: true, force: true }))
it('preserva recibos, números oficiais e snapshots ao acrescentar metadados de colaboração', () => {
  const d = new Database(join(raiz, 'migracao.db'))
  try {
    aplicarMigracoes(d, 8)
    const documento = JSON.stringify({
      id: 'r',
      numero: 4,
      valor: 123.45,
      descricao: 'Descrição original',
      status: 'recebido'
    })
    d.run('INSERT INTO recibos VALUES (?,?,?)', ['r', 4, documento])
    d.run("INSERT INTO numeros_usados VALUES ('recibo',4)")
    d.run('INSERT INTO versoes VALUES (?,?,?,?,?,?,?,?,?)', [
      'v',
      'recibo',
      'r',
      1,
      null,
      '2026-10-12',
      'PC',
      '',
      documento
    ])
    const antes = ['recibos', 'versoes', 'numeros_usados'].map((t) => d.all(`SELECT * FROM ${t}`))
    aplicarMigracoes(d, 9)
    expect(
      ['recibos', 'versoes', 'numeros_usados'].map((t) => d.all(`SELECT * FROM ${t}`))
    ).toEqual(antes)
    expect(d.all('SELECT * FROM identificadores_documento')).toEqual([])
    expect(d.get('PRAGMA user_version')?.user_version).toBe(9)
    aplicarMigracoes(d, 9)
    expect(d.all('SELECT * FROM versoes')).toEqual(antes[1])
  } finally {
    d.close()
  }
})
it('acrescenta as duas colunas sem apagar filtros e escolhas existentes', () => {
  const d = new Database(join(raiz, 'preferencias.db'))
  try {
    aplicarMigracoes(d, 8)
    d.run('INSERT INTO configuracoes VALUES (?,?)', [
      'historico:recibo',
      JSON.stringify({ busca: 'João', campo: 'data', direcao: 'asc', colunas: ['status', 'valor'] })
    ])
    aplicarMigracoes(d, 9)
    expect(
      JSON.parse(
        String(d.get("SELECT valor FROM configuracoes WHERE chave='historico:recibo'")?.valor)
      )
    ).toEqual({
      busca: 'João',
      campo: 'data',
      direcao: 'asc',
      colunas: ['ordem', 'idInterno', 'status', 'valor']
    })
  } finally {
    d.close()
  }
})
it('mantém a identidade técnica e impede dois IDs internos iguais no mesmo tipo', () => {
  const d = new Database(join(raiz, 'identificadores.db'))
  try {
    aplicarMigracoes(d, 9)
    d.run('INSERT INTO identificadores_documento VALUES (?,?,?,?,?)', [
      'recibo',
      'uuid-1',
      1,
      'usuario',
      'usuario'
    ])
    expect(() =>
      d.run('INSERT INTO identificadores_documento VALUES (?,?,?,?,?)', [
        'recibo',
        'uuid-2',
        1,
        'usuario',
        'usuario'
      ])
    ).toThrow()
    d.run('INSERT INTO identificadores_documento VALUES (?,?,?,?,?)', [
      'orcamento',
      'uuid-3',
      1,
      'usuario',
      'usuario'
    ])
    expect(
      d.get("SELECT documento_id FROM identificadores_documento WHERE tipo='recibo'")?.documento_id
    ).toBe('uuid-1')
  } finally {
    d.close()
  }
})
