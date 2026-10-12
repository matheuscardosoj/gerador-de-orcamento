import type { Recibo } from './types'

export function rotuloExclusaoRecibo(status?: Recibo['status']): string {
  return status === 'recebido' ? 'Excluir e estornar' : 'Excluir'
}
export function descricaoExclusaoRecibo(numero: number, status?: Recibo['status']): string {
  const base = `O recibo Nº ${String(numero).padStart(6, '0')} será excluído da lista. Seu número e as versões salvas serão preservados.`
  return status === 'recebido'
    ? `${base} O pagamento será estornado na mesma operação, preservando seu registro. Se houver relatório vinculado, o saldo será ajustado. Adiantamentos preexistentes serão mantidos.`
    : base
}
