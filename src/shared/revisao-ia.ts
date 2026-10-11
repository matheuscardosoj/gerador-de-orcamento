import type { SugestaoObservacaoEntrada } from './api'
export interface RevisaoTextoEntrada {
  id: string
  campo:
    | 'descricaoServico'
    | 'introducao'
    | 'observacao'
    | 'pagamento'
    | 'anotacao'
    | 'descricaoRecibo'
    | 'observacaoRecibo'
  texto: string
  anotacao?: SugestaoObservacaoEntrada
}
export function numerosTexto(texto: string): string[] {
  return (texto.match(/\d+(?:[.,:/-]\d+)*/g) ?? []).sort()
}
export function aguardarComCancelamento<T>(promessa: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cancelar = (): void => reject(signal.reason)
    signal.addEventListener('abort', cancelar, { once: true })
    promessa.then(
      (valor) => {
        signal.removeEventListener('abort', cancelar)
        resolve(valor)
      },
      (erro) => {
        signal.removeEventListener('abort', cancelar)
        reject(erro)
      }
    )
  })
}
export function validarRespostaIA(original: string, sugestao: string, resumo = false): void {
  if (!sugestao.trim()) throw new Error('A IA não retornou uma sugestão. Tente novamente.')
  if (sugestao.length > 8000)
    throw new Error('A sugestão excedeu o tamanho permitido. Tente revisar um trecho menor.')
  const origem = numerosTexto(original),
    destino = numerosTexto(sugestao)
  const disponiveis = [...origem]
  const invalido = destino.some((n) => {
    const pos = disponiveis.indexOf(n)
    if (pos < 0) return true
    disponiveis.splice(pos, 1)
    return false
  })
  if (invalido || (!resumo && disponiveis.length))
    throw new Error(
      'A sugestão alterou números, valores, datas ou quantidades e foi recusada. Tente novamente ou edite o texto manualmente.'
    )
}
