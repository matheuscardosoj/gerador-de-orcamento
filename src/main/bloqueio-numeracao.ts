/** A migração de números afeta documentos; cadastros e rascunhos são locais. */
export function exigeNumeracaoAtualizada(canal: string): boolean {
  return /^(?:orcamentos|relatorios|recibos)\.(?:create|update|remove|alterarNumero|confirmar|cancelar|criarDeOrcamento)$/.test(
    canal
  )
}
