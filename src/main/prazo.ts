/** Rejeita se a operação não terminar no prazo; a operação original não é cancelada. */
export function comPrazo<T>(
  promessa: Promise<T>,
  ms = 60_000,
  mensagem = 'A operação demorou mais que o esperado. Tente novamente.'
): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new Error(mensagem)), ms)
  })
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador))
}
