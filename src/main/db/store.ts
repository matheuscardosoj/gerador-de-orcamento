import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { bancoInicial } from './seeds'
import type { BancoDados } from '@shared/types'

let cache: BancoDados | null = null
let dbPath = ''

function resolveDbPath(): string {
  if (!dbPath) {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    dbPath = join(dir, 'banco.json')
  }
  return dbPath
}

/** Preenche campos novos ausentes com os defaults dos seeds (migração leve de schema). */
function mergeDefaults(parsed: Partial<BancoDados>): BancoDados {
  const base = bancoInicial()
  return {
    ...base,
    ...parsed,
    empresa: { ...base.empresa, ...(parsed.empresa ?? {}) },
    parametros: { ...base.parametros, ...(parsed.parametros ?? {}) }
  }
}

export function getDb(): BancoDados {
  if (cache) return cache
  const p = resolveDbPath()
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<BancoDados>
      cache = mergeDefaults(parsed)
    } catch {
      // Arquivo corrompido: preserva backup e recomeça com o banco inicial.
      try {
        copyFileSync(p, p + `.corrompido-${Date.now()}.bak`)
      } catch {
        /* ignore */
      }
      cache = bancoInicial()
      persist()
    }
  } else {
    cache = bancoInicial()
    persist()
  }
  return cache
}

/** Escrita atômica: grava em arquivo temporário e renomeia por cima. */
export function persist(): void {
  if (!cache) return
  const p = resolveDbPath()
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8')
  renameSync(tmp, p)
}

/** Aplica uma mutação no banco em memória e persiste. */
export function mutate<T>(fn: (db: BancoDados) => T): T {
  const db = getDb()
  const result = fn(db)
  persist()
  return result
}
