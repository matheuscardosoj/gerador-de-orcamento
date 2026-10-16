import type { StatusNuvem } from '@shared/types'

type Estado = Pick<
  StatusNuvem,
  'conexao' | 'falhaSincronizacao' | 'sincronizando' | 'recuperandoConexao'
>
export type TransicaoConexao = 'indisponivel' | 'retomando' | 'concluida' | 'encerrada' | null

/** Cada interrupção pode anunciar retomada e conclusão uma única vez. */
export class CicloAvisoConexao {
  private fase: 'normal' | 'indisponivel' | 'retomando' = 'normal'

  atualizar(s: Estado): TransicaoConexao {
    if (s.falhaSincronizacao && !s.falhaSincronizacao.temporaria) {
      this.fase = 'normal'
      return 'encerrada'
    }
    if (s.conexao === 'inacessivel' || s.falhaSincronizacao?.temporaria) {
      this.fase = 'indisponivel'
      return 'indisponivel'
    }
    if (s.conexao !== 'acessivel' || this.fase === 'normal') return null
    if (s.sincronizando || s.recuperandoConexao) {
      if (this.fase === 'retomando') return null
      this.fase = 'retomando'
      return 'retomando'
    }
    this.fase = 'normal'
    return 'concluida'
  }
}
