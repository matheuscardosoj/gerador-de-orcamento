import { get, run } from './db/sqlite'

export type TipoCodigoCadastro = 'cliente' | 'servico'

/** Os códigos permanecem registrados mesmo após a exclusão do cadastro. */
export function proximoCodigoCadastro(tipo: TipoCodigoCadastro, id: string): number {
  const existente = get(
    'SELECT codigo FROM codigos_cadastros WHERE tipo=? AND id=? ORDER BY codigo LIMIT 1',
    [tipo, id]
  )
  if (existente) return Number(existente.codigo)
  const maior = Number(
    get('SELECT COALESCE(MAX(codigo),0) AS codigo FROM codigos_cadastros WHERE tipo=?', [tipo])
      ?.codigo ?? 0
  )
  const codigo = maior + 1
  run('INSERT INTO codigos_cadastros(tipo,codigo,id) VALUES (?,?,?)', [tipo, codigo, id])
  return codigo
}

/** Importa o código atribuído pela nuvem sem liberar o código local anterior. */
export function registrarCodigoRemoto(tipo: TipoCodigoCadastro, codigo: unknown, id: string): void {
  const n = Number(codigo)
  if (!Number.isSafeInteger(n) || n < 1) return
  run('INSERT OR IGNORE INTO codigos_cadastros(tipo,codigo,id) VALUES (?,?,?)', [tipo, n, id])
}
