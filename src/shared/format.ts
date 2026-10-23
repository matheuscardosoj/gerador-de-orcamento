// Utilitários de formatação (pt-BR) compartilhados entre renderer, motor e documentos.

/**
 * Arredonda para 2 casas decimais evitando erros de ponto flutuante. A metade
 * arredonda para longe do zero (simétrico para negativos) e nunca devolve -0.
 */
export function round2(n: number): number {
  const r = (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100
  return r === 0 ? 0 : r
}

/** Total do documento: soma dos valores dos itens, arredondada a centavos. */
export function totalDosItens(itens: ReadonlyArray<{ valorTotal: number }>): number {
  return round2(itens.reduce((soma, item) => soma + (item.valorTotal || 0), 0))
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

/** Data civil local usada pelos documentos, sem conversão acidental de fuso. */
export function dataCivilHoje(agora = new Date()): string {
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Aceita datas antigas em ISO e devolve a parte civil canônica AAAA-MM-DD. */
export function normalizarDataCivil(valor: string): string {
  const correspondencia = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (correspondencia) return `${correspondencia[1]}-${correspondencia[2]}-${correspondencia[3]}`
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? '' : dataCivilHoje(data)
}

/** Converte uma data documental em meio-dia local para evitar o dia anterior. */
export function dataCivilParaDate(valor: string): Date {
  const civil = normalizarDataCivil(valor)
  if (!civil) return new Date(Number.NaN)
  const [ano, mes, dia] = civil.split('-').map(Number)
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0)
}

/** Formata data documental -> "21 de julho de 2026". */
export function formatDataExtenso(iso: string): string {
  const d = dataCivilParaDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Formata data documental -> "21/07/2026". */
export function formatDataCurta(iso: string): string {
  const d = dataCivilParaDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}
