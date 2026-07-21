// Utilitários de formatação (pt-BR) compartilhados entre renderer, motor e documentos.

/** Arredonda para 2 casas decimais evitando erros de ponto flutuante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const moedaFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/** Formata valor em reais: 1234.5 -> "R$ 1.234,50". */
export function formatMoeda(n: number): string {
  return moedaFmt.format(Number.isFinite(n) ? n : 0)
}

const numeroFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
})

/** Formata número genérico: 1234.5 -> "1.234,5". */
export function formatNumero(n: number): string {
  return numeroFmt.format(Number.isFinite(n) ? n : 0)
}

/** Formata data ISO -> "21 de julho de 2026". */
export function formatDataExtenso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Formata data ISO -> "21/07/2026". */
export function formatDataCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}
