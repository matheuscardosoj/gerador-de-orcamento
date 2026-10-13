// Conexão SQLite (node-sqlite3-wasm: WebAssembly com acesso real ao arquivo,
// sem nenhuma dependência nativa/node-gyp — ver memória `ambiente-build-windows`).
import { app } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes } from './schema'
import { prepararMigracao, verificarBanco } from './pre-migracao'

export type Linha = Record<string, string | number | Uint8Array | null>

let conexao: Database | null = null
let grupoAtual: string | null = null
export function grupoTransacao(): string | null {
  return grupoAtual
}
let trava: { caminho: string; fd: number } | null = null
let perfilDados: string | null = null

export function selecionarPerfilDados(perfil: string | null): void {
  if (conexao || trava) throw new Error('Feche a base atual antes de trocar de conta.')
  if (perfil && !/^[a-f0-9]{64}$/.test(perfil)) throw new Error('Perfil de acesso inválido.')
  perfilDados = perfil
}

/** Pasta `userData/data`, onde ficam o banco e os backups. */
export function pastaDados(): string {
  const dir = perfilDados
    ? join(app.getPath('userData'), 'perfis', perfilDados, 'data')
    : join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function caminhoBanco(): string {
  return join(pastaDados(), 'banco.db')
}

function adquirirTrava(): void {
  const caminho = join(pastaDados(), 'banco.lock')
  try {
    const fd = openSync(caminho, 'wx')
    writeFileSync(fd, `${process.pid}\n`, 'utf8')
    trava = { caminho, fd }
  } catch (erro) {
    if (!existsSync(caminho)) throw erro
    let pid = 0
    try {
      pid = Number.parseInt(readFileSync(caminho, 'utf8').trim(), 10)
    } catch {
      pid = 0
    }
    let vivo = false
    if (pid > 0) {
      try {
        process.kill(pid, 0)
        vivo = true
      } catch {
        vivo = false
      }
    }
    if (vivo) throw new Error('O banco de dados já está aberto por outra instância do aplicativo.')
    try {
      unlinkSync(caminho)
    } catch {
      throw new Error('Não foi possível obter a trava do banco de dados.')
    }
    const fd = openSync(caminho, 'wx')
    writeFileSync(fd, `${process.pid}\n`, 'utf8')
    trava = { caminho, fd }
  }
}

function liberarTrava(): void {
  if (!trava) return
  try {
    closeSync(trava.fd)
  } catch {
    /* já fechado */
  }
  try {
    unlinkSync(trava.caminho)
  } catch {
    /* a limpeza não impede o encerramento */
  }
  trava = null
}

export function caminhoBackupPreV2(): string {
  return join(pastaDados(), 'backups', 'banco-pre-v2.db')
}

/**
 * Abre (e cria, se necessário) o banco. `bancoNovo` informa se o arquivo ainda
 * não existia — o boot usa isso para decidir se importa o `banco.json` legado.
 */
export function abrirBanco(): { db: Database; bancoNovo: boolean } {
  if (conexao) return { db: conexao, bancoNovo: false }
  adquirirTrava()
  const caminho = caminhoBanco()
  const bancoNovo = !existsSync(caminho)
  let backup: string | null = null
  // O VFS do node-sqlite3-wasm não suporta WAL (o pragma seria ignorado): fica
  // no journal `delete` padrão, que é durável e suficiente para um app local.
  try {
    backup = bancoNovo ? null : prepararMigracao(caminho)
    conexao = new Database(caminho)
    conexao.run('PRAGMA foreign_keys = ON')
    verificarBanco(conexao)
    aplicarMigracoes(conexao)
    verificarBanco(conexao)
  } catch (e) {
    conexao?.close()
    conexao = null
    liberarTrava()
    const sufixo = backup ? `\nBackup preservado em: ${backup}` : ''
    throw new Error(`${String(e).replace(/^Error:\s*/, '')}${sufixo}`)
  }
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
  liberarTrava()
}

/** Executa `fn` dentro de uma transação (commit no sucesso, rollback no erro). */
export function tx<T>(fn: () => T): T {
  const d = db()
  // Transações não aninham: se já estamos dentro de uma, apenas executa.
  if (d.inTransaction) return fn()
  grupoAtual = randomUUID()
  d.run('BEGIN')
  try {
    const resultado = fn()
    d.run('COMMIT')
    return resultado
  } catch (e) {
    d.run('ROLLBACK')
    throw e
  } finally {
    grupoAtual = null
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
