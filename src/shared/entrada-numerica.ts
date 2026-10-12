export interface OpcoesNumero {
  inteiro?: boolean
  negativo?: boolean
  casas?: number
}

/** Texto editável usa apenas dígitos, vírgula decimal e sinal quando permitido. */
export function lerEntradaNumerica(
  entrada: string,
  { inteiro = false, negativo = false, casas = 10 }: OpcoesNumero = {}
): string | null {
  const texto = entrada.replace(/\./g, '').replace(/\s/g, '')
  if (!(negativo ? /^-?\d*(?:,\d*)?$/ : /^\d*(?:,\d*)?$/).test(texto)) return null
  if (inteiro && texto.includes(',')) return null
  if ((texto.split(',')[1]?.length ?? 0) > casas) return null
  const normalizado = texto
    .replace(/^(-?)0+(?=\d)/, '$1')
    .replace(/^(-?),/, (_t, sinal: string) => `${sinal}0,`)
  const numero = Number(normalizado.replace(',', '.'))
  if (
    !['', '-'].includes(normalizado) &&
    (!Number.isFinite(numero) || Math.abs(numero) > Number.MAX_SAFE_INTEGER)
  )
    return null
  return normalizado
}

export function mascararNumeroEditavel(texto: string): string {
  const [inteiro, decimal] = texto.split(',')
  return (
    inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal === undefined ? '' : `,${decimal}`)
  )
}

export function valorNumericoCanonico(texto: string): string {
  return texto === '' || texto === '-' ? '' : String(Number(texto.replace(',', '.')))
}

/** Colagem aceita valores brasileiros e também decimal com ponto sem agrupamento. */
export function prepararNumeroColado(texto: string): string {
  const limpo = texto
    .trim()
    .replace(/^R\$\s*/, '')
    .replace(/\s/g, '')
  if (limpo.includes(',')) return limpo
  if (/^-?[1-9]\d{0,2}(?:\.\d{3})+$/.test(limpo)) return limpo.replace(/\./g, '')
  return limpo.replace('.', ',')
}

export function formatarEntradaNumerica(
  valor: number | string,
  inteiro = false,
  monetario = false
): string {
  if (valor === '') return ''
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: inteiro ? 0 : monetario ? 2 : 0,
    maximumFractionDigits: inteiro ? 0 : 10
  }).format(numero)
}
