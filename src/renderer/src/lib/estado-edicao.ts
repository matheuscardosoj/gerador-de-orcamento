import type { EstadoControleEdicao } from '@shared/evolucao'
/** Relógio lógico do main; nunca compara relógios físicos dos computadores. */
export class EstadosEdicao {
  private sessao = -1
  private estados = new Map<string, EstadoControleEdicao>()
  obter(empresaId: string, tipo: string, documentoId: string): EstadoControleEdicao | undefined {
    return this.estados.get(JSON.stringify([empresaId, tipo, documentoId]))
  }
  aceitar(estado: EstadoControleEdicao): EstadoControleEdicao | null {
    if (estado.sessao < this.sessao) return null
    if (estado.sessao > this.sessao) {
      this.estados.clear()
      this.sessao = estado.sessao
    }
    const chave = JSON.stringify([estado.empresaId, estado.tipo, estado.documentoId])
    const anterior = this.estados.get(chave)
    if (anterior && anterior.sequencia > estado.sequencia) return anterior
    this.estados.set(chave, estado)
    return estado
  }
}
