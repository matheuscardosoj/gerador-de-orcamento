import { all, get, run, texto, tx, type Linha } from './db/sqlite'

export type EstadoOperacao = 'pendente' | 'preservada' | 'conflito' | 'falha'
export const filaAtiva = (): Linha[] =>
  all("SELECT * FROM fila_nuvem WHERE estado<>'preservada' ORDER BY rowid")
export const filaParaEnvio = (): Linha[] =>
  all(
    "SELECT * FROM fila_nuvem f WHERE estado='pendente' AND NOT EXISTS (SELECT 1 FROM fila_nuvem g WHERE g.grupo=f.grupo AND g.estado<>'pendente') ORDER BY rowid"
  )
export const temOperacaoAtiva = (entidade: string): boolean =>
  !!get("SELECT 1 FROM fila_nuvem WHERE entidade=? AND estado<>'preservada' LIMIT 1", [entidade])
export const ultimaBaseAtiva = (entidade: string): number | null => {
  const n = get(
    "SELECT MAX(base) AS base FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'",
    [entidade]
  )?.base
  return n == null ? null : Number(n)
}
export function marcarGrupo(
  fila: Linha[],
  estado: EstadoOperacao,
  erro: string | null = null
): void {
  tx(() => {
    for (const l of fila)
      run('UPDATE fila_nuvem SET estado=?,erro=? WHERE id=?', [estado, erro, l.id])
  })
}
export function tentarNovamenteOperacao(id: string): void {
  const op = get("SELECT * FROM fila_nuvem WHERE id=? AND estado='falha'", [id])
  if (!op)
    throw new Error(
      'Esta operação não está aguardando uma nova tentativa. Atualize a lista de pendências.'
    )
  const grupo = all('SELECT * FROM fila_nuvem WHERE grupo=?', [op.grupo])
  if (grupo.some((l) => ['preservada', 'conflito'].includes(texto(l.estado))))
    throw new Error(
      'Este grupo contém alterações preservadas ou em conflito. Confira o grupo antes de tentar novamente.'
    )
  marcarGrupo(grupo, 'pendente')
}
