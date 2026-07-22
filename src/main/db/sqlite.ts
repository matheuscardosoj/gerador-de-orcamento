// Conexão SQLite (node-sqlite3-wasm: WebAssembly com acesso real ao arquivo,
// sem nenhuma dependência nativa/node-gyp — ver memória `ambiente-build-windows`).
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes } from './schema'

export type Linha = Record<string, string | number | Uint8Array | null>

let conexao: Database | null = null

/** Pasta `userData/data`, onde ficam o banco e os backups. */
export function pastaDados(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function caminhoBanco(): string {
  return join(pastaDados(), 'banco.db')
}

/**
 * Abre (e cria, se necessário) o banco. `bancoNovo` informa se o arquivo ainda
 * não existia — o boot usa isso para decidir se importa o `banco.json` legado.
 */
export function abrirBanco(): { db: Database; bancoNovo: boolean } {
  if (conexao) return { db: conexao, bancoNovo: false }
  const caminho = caminhoBanco()
  const bancoNovo = !existsSync(caminho)
  conexao = new Database(caminho)
  // O VFS do node-sqlite3-wasm não suporta WAL (o pragma seria ignorado): fica
  // no journal `delete` padrão, que é durável e suficiente para um app local.
  conexao.run('PRAGMA foreign_keys = ON')
  aplicarMigracoes(conexao)
  return { db: conexao, bancoNovo }
}

export function db(): Database {
  if (!conexao) return abrirBanco().db
  return conexao
}

export function fecharBanco(): void {
  if (conexao) {
    conexao.close()
    conexao = null
  }
}

/** Executa `fn` dentro de uma transação (commit no sucesso, rollback no erro). */
export function tx<T>(fn: () => T): T {
  const d = db()
  // Transações não aninham: se já estamos dentro de uma, apenas executa.
  if (d.inTransaction) return fn()
  d.run('BEGIN')
  try {
    const resultado = fn()
    d.run('COMMIT')
    return resultado
  } catch (e) {
    d.run('ROLLBACK')
    throw e
  }
}

export function all(sql: string, valores?: unknown[]): Linha[] {
  return db().all(sql, valores as never) as Linha[]
}

export function get(sql: string, valores?: unknown[]): Linha | null {
  return db().get(sql, valores as never) as Linha | null
}

export function run(sql: string, valores?: unknown[]): void {
  db().run(sql, valores as never)
}

// ------------------------------------------------------------------ Helpers
// O SQLite não tem boolean nem null tipado; estas funções centralizam a
// conversão nos dois sentidos para não espalhar casts pelos repositórios.

export const bool = (v: unknown): number => (v ? 1 : 0)
export const paraBool = (v: unknown): boolean => v === 1 || v === true
export const texto = (v: unknown): string => (v == null ? '' : String(v))
export const numero = (v: unknown): number => (v == null ? 0 : Number(v))
export const numeroOuNulo = (v: unknown): number | null => (v == null ? null : Number(v))
export const textoOuNulo = (v: unknown): string | null => (v == null ? null : String(v))
