/** Ordena operações do mesmo documento; documentos e sessões diferentes não se bloqueiam. */
export class FilaControleEdicao {
  private filas = new Map<string, { fim: Promise<unknown>; leitura?: Promise<unknown> }>()

  executar<T>(chave: string, leitura: boolean, operacao: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(chave)
    if (leitura && anterior?.leitura) return anterior.leitura as Promise<T>
    const resultado = (anterior?.fim ?? Promise.resolve()).catch(() => undefined).then(operacao)
    const entrada = { fim: resultado, leitura: leitura ? resultado : undefined }
    this.filas.set(chave, entrada)
    void resultado
      .finally(() => {
        if (this.filas.get(chave) === entrada) this.filas.delete(chave)
      })
      .catch(() => undefined)
    return resultado
  }
}
