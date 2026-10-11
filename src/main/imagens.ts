import { enfileirar } from './versoes'
import { createHash } from 'crypto'
import { get, run, texto } from './db/sqlite'
export function registrarImagem(
  dataUrl: string | null | undefined,
  miniatura: string | null | undefined,
  largura: number,
  altura: number,
  legado = false
): string | null {
  if (!dataUrl) return null
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) throw new Error('Formato de imagem inválido. Use JPEG ou PNG.')
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length || (!legado && bytes.length > 250 * 1024))
    throw new Error('A foto deve ocupar no máximo 250 KiB após compressão.')
  const mini = miniatura?.split(',')[1] ?? null
  if (!legado && mini && Buffer.from(mini, 'base64').length > 20 * 1024)
    throw new Error('A miniatura deve ocupar no máximo 20 KiB.')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const existe = get('SELECT 1 FROM imagens WHERE hash=?', [hash])
  run('INSERT OR IGNORE INTO imagens VALUES (?,?,?,?,?,?,?)', [
    hash,
    m[1],
    m[2],
    mini,
    bytes.length,
    largura,
    altura
  ])
  if (!existe)
    enfileirar(`imagens:${hash}`, {
      tabela: 'imagens',
      id: hash,
      row: get('SELECT * FROM imagens WHERE hash=?', [hash])
    })
  return hash
}
export function imagemDataUrl(hash: string, miniatura = false): string | undefined {
  const a = get('SELECT * FROM imagens WHERE hash = ?', [hash])
  if (!a) return undefined
  const base64 = miniatura ? a.miniatura_base64 || a.base64 : a.base64
  return `data:${texto(a.mime)};base64,${texto(base64)}`
}
