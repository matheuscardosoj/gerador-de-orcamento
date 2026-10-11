import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  statfsSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { VERSAO_BANCO } from './schema'

export function verificarBanco(d: Database): void {
  const resultado = String(
    (d.get('PRAGMA integrity_check') as { integrity_check?: string } | null)?.integrity_check ?? ''
  )
  if (resultado.toLowerCase() !== 'ok' || d.all('PRAGMA foreign_key_check').length)
    throw new Error(`Falha na integridade do banco: ${resultado || 'referências inválidas'}`)
}

/** Estima o espaço antes de gravar ou converter imagens; não altera o banco original. */
export function prepararMigracao(caminho: string): string | null {
  if (!existsSync(caminho)) return null
  const fonte = new Database(caminho)
  let versao = 0
  let imagensTextoBytes = 0
  let imagensOriginaisBytes = 0
  const hashes = new Set<string>()
  try {
    verificarBanco(fonte)
    versao = Number(
      (fonte.get('PRAGMA user_version') as { user_version?: number } | null)?.user_version ?? 0
    )
    if (versao >= VERSAO_BANCO) return null
    for (const tabela of ['anexos', 'relatorio_anexos']) {
      if (
        !fonte.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [tabela] as never)
      )
        continue
      for (const linha of fonte.all(`SELECT imagem,miniatura FROM ${tabela}`) as Array<{
        imagem: Uint8Array | null
        miniatura: Uint8Array | null
      }>) {
        if (!linha.imagem || typeof linha.imagem === 'string') continue
        const bytes = Buffer.from(linha.imagem)
        const hash = createHash('sha256').update(bytes).digest('hex')
        imagensOriginaisBytes += bytes.length + (linha.miniatura?.length ?? 0)
        if (hashes.has(hash)) continue
        hashes.add(hash)
        imagensTextoBytes +=
          4 * Math.ceil(bytes.length / 3) + 4 * Math.ceil((linha.miniatura?.length ?? 0) / 3)
      }
    }
  } finally {
    fonte.close()
  }
  const bytesBanco = statSync(caminho).size
  // Cópia de segurança, crescimento do banco, journal e folga para metadados/versões.
  const bytesNecessarios = bytesBanco * 3 + imagensTextoBytes * 2 + 16 * 1024 * 1024
  const disco = statfsSync(dirname(caminho))
  const bytesDisponiveis = disco.bavail * disco.bsize
  if (bytesDisponiveis < bytesNecessarios)
    throw new Error(
      `A atualização precisa de aproximadamente ${Math.ceil(bytesNecessarios / 1048576)} MiB livres. Libere espaço e abra o aplicativo novamente. O banco original foi preservado.`
    )
  const pasta = join(dirname(caminho), 'backups')
  mkdirSync(pasta, { recursive: true })
  const hash = (arquivo: string): string =>
    createHash('sha256').update(readFileSync(arquivo)).digest('hex')
  const hashOriginal = hash(caminho)
  let backup = join(pasta, `banco-pre-v${VERSAO_BANCO}.db`)
  if (existsSync(backup) && hash(backup) !== hashOriginal)
    backup = join(pasta, `banco-pre-v${VERSAO_BANCO}-${Date.now()}.db`)
  if (!existsSync(backup)) copyFileSync(caminho, backup)
  const copia = new Database(backup)
  try {
    verificarBanco(copia)
  } finally {
    copia.close()
  }
  if (hash(backup) !== hashOriginal)
    throw new Error(
      'O backup anterior à atualização não passou na verificação. O banco original foi preservado.'
    )
  writeFileSync(
    `${backup}.json`,
    JSON.stringify(
      {
        versaoOrigem: versao,
        versaoDestino: VERSAO_BANCO,
        hashOriginal,
        bytesBanco,
        imagensOriginaisBytes,
        imagensTextoBytes,
        imagensUnicas: hashes.size,
        bytesNecessarios,
        bytesDisponiveis,
        verificadoEm: new Date().toISOString()
      },
      null,
      2
    )
  )
  return backup
}
