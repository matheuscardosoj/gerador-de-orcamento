import { all, get, run, tx } from './db/sqlite'
import { normalizarPreferencias, type PreferenciasHistorico } from '@shared/historico-preferencias'
import type { TipoDocumento } from '@shared/types'
import { capturarCadastros } from './nuvem'
function tipoValido(tipo: string): asserts tipo is TipoDocumento {
  if (!['orcamento', 'relatorio', 'recibo'].includes(tipo)) throw new Error('Histórico inválido.')
}
export function lerPreferencias(tipo: string): PreferenciasHistorico {
  tipoValido(tipo)
  const row = get('SELECT valor FROM configuracoes WHERE chave=?', [`historico:${tipo}`])
  try {
    return normalizarPreferencias(tipo, row ? JSON.parse(String(row.valor)) : null)
  } catch {
    return normalizarPreferencias(tipo, null)
  }
}
export function salvarPreferencias(tipo: string, dados: unknown): void {
  tipoValido(tipo)
  run('INSERT OR REPLACE INTO configuracoes VALUES (?,?)', [
    `historico:${tipo}`,
    JSON.stringify(normalizarPreferencias(tipo, dados))
  ])
}
export function reordenarCadastro(tipo: string, ids: string[]): void {
  const tabela = {
    servicos: 'servicos',
    observacoes: 'observacoes_padrao',
    pagamentos: 'pagamentos_padrao'
  }[tipo]
  if (!tabela || !Array.isArray(ids)) throw new Error('Lista inválida.')
  tx(() => {
    const atuais = all(`SELECT id FROM ${tabela}`).map((r) => String(r.id))
    if (
      ids.length !== atuais.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !atuais.includes(id))
    )
      throw new Error('A lista mudou. Atualize a tela antes de reordenar.')
    ids.forEach((id, ordem) => run(`UPDATE ${tabela} SET ordem=? WHERE id=?`, [ordem, id]))
    capturarCadastros()
  })
}
