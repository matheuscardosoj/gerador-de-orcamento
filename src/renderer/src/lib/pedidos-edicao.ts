import type { ControleEdicao, TipoDocumento } from '@shared/evolucao'
export function pedidosAtuais(
  empresa: string,
  tipo: TipoDocumento,
  id: string,
  controle: ControleEdicao | null
): string[] {
  if (!controle?.podeEditar) return []
  return (controle.solicitacoes ?? [])
    .filter((p) => p.computador !== controle.computador)
    .map((p) => JSON.stringify([empresa, tipo, id, controle.geracao, p.computador, p.criadoEm]))
}
export class CicloPedidosEdicao {
  private vistos = new Set<string>()
  reconciliar(atuais: Iterable<string>): { novos: string[]; removidos: string[] } {
    const proximo = new Set(atuais)
    const novos = [...proximo].filter((chave) => !this.vistos.has(chave))
    const removidos = [...this.vistos].filter((chave) => !proximo.has(chave))
    this.vistos = proximo
    return { novos, removidos }
  }
}
