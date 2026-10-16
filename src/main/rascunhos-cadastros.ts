import { all, run, texto } from './db/sqlite'
import type { RascunhoCadastro } from '@shared/evolucao'

export type TipoRascunhoCadastro = 'cliente' | 'servico' | 'observacoes' | 'pagamentos'
const tipos: TipoRascunhoCadastro[] = ['cliente', 'servico', 'observacoes', 'pagamentos']
export function guardarRascunhoCadastro(
  tipo: TipoRascunhoCadastro,
  idOrigem: string,
  dados: Record<string, unknown>
): void {
  if (!tipos.includes(tipo) || !idOrigem || !dados || typeof dados !== 'object')
    throw new Error('Rascunho de cadastro inválido.')
  run(
    `INSERT INTO rascunhos_cadastros VALUES (?,?,?,?)
      ON CONFLICT(tipo,id_origem) DO UPDATE SET dados_json=excluded.dados_json,criado_em=excluded.criado_em`,
    [tipo, idOrigem, JSON.stringify(dados), new Date().toISOString()]
  )
}
export function listarRascunhosCadastro(tipo: TipoRascunhoCadastro): RascunhoCadastro[] {
  if (!tipos.includes(tipo)) throw new Error('Tipo de cadastro inválido.')
  return all('SELECT * FROM rascunhos_cadastros WHERE tipo=? ORDER BY criado_em DESC', [tipo]).map(
    (l) => ({
      tipo,
      idOrigem: texto(l.id_origem),
      dados: JSON.parse(texto(l.dados_json)) as Record<string, unknown>,
      criadoEm: texto(l.criado_em)
    })
  )
}
export function descartarRascunhoCadastro(tipo: TipoRascunhoCadastro, idOrigem: string): void {
  if (!tipos.includes(tipo) || !idOrigem) throw new Error('Rascunho de cadastro inválido.')
  run('DELETE FROM rascunhos_cadastros WHERE tipo=? AND id_origem=?', [tipo, idOrigem])
}
