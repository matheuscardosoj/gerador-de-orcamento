import { all, get, run, texto } from './db/sqlite'

/** Deve ser chamada dentro da mesma transação que enfileira o documento. */
export function vincularAplicacaoRascunho(id: string, operacoes: string[]): void {
  if (!operacoes.length) throw new Error('A aplicação do rascunho não gerou uma operação de envio.')
  run('DELETE FROM rascunhos_envios WHERE rascunho_id=?', [id])
  for (const operacao of operacoes)
    run('INSERT INTO rascunhos_envios (rascunho_id,operacao_id) VALUES (?,?)', [id, operacao])
  run("UPDATE rascunhos_compartilhados SET estado='aguardando_confirmacao' WHERE id=?", [id])
}

/** A confirmação e a retirada da fila compartilham a transação do ACK remoto. */
export function confirmarAplicacoesRascunhos(operacoes: string[]): void {
  for (const id of operacoes)
    run('UPDATE rascunhos_envios SET confirmada=1 WHERE operacao_id=?', [id])
  run(`UPDATE rascunhos_compartilhados SET estado='aplicado'
    WHERE estado='aguardando_confirmacao'
    AND EXISTS (SELECT 1 FROM rascunhos_envios e WHERE e.rascunho_id=rascunhos_compartilhados.id)
    AND NOT EXISTS (SELECT 1 FROM rascunhos_envios e WHERE e.rascunho_id=rascunhos_compartilhados.id AND e.confirmada=0)`)
}

export function atualizarAplicacoesRascunhos(): void {
  for (const r of all(
    "SELECT id FROM rascunhos_compartilhados WHERE estado='aguardando_confirmacao'"
  )) {
    if (
      get(
        `SELECT 1 FROM rascunhos_envios e JOIN fila_nuvem f ON f.id=e.operacao_id
      WHERE e.rascunho_id=? AND f.estado='conflito' LIMIT 1`,
        [r.id]
      )
    )
      run("UPDATE rascunhos_compartilhados SET estado='conflito' WHERE id=?", [texto(r.id)])
    else if (
      get(
        `SELECT 1 FROM rascunhos_envios e JOIN fila_nuvem f ON f.id=e.operacao_id WHERE e.rascunho_id=? AND f.estado IN ('falha','preservada') LIMIT 1`,
        [r.id]
      )
    )
      run("UPDATE rascunhos_compartilhados SET estado='envio_interrompido' WHERE id=?", [
        texto(r.id)
      ])
  }
}
