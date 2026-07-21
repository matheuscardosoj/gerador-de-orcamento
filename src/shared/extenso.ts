// Valor monetário por extenso em português (reais e centavos).

const unidades = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'
]
const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const centenas = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos'
]

/** Converte um inteiro de 0 a 999 em extenso. */
function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(centenas[c])
  if (resto > 0) {
    if (resto < 20) partes.push(unidades[resto])
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u > 0 ? `${dezenas[d]} e ${unidades[u]}` : dezenas[d])
    }
  }
  return partes.join(' e ')
}

/** Converte um inteiro (>= 0) em extenso. */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos: number[] = []
  let resto = n
  while (resto > 0) {
    grupos.push(resto % 1000)
    resto = Math.floor(resto / 1000)
  }
  const escalasSing = ['', 'mil', 'milhão', 'bilhão', 'trilhão']
  const escalasPlur = ['', 'mil', 'milhões', 'bilhões', 'trilhões']
  const partes: string[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (g === 0) continue
    let texto = i === 1 && g === 1 ? '' : ate999(g) // "mil" e não "um mil"
    const escala = g === 1 && i > 1 ? escalasSing[i] : escalasPlur[i]
    texto = [texto, escala].filter(Boolean).join(' ')
    partes.push(texto)
  }
  // Junta com vírgulas e "e" antes do último grupo quando apropriado.
  if (partes.length === 1) return partes[0]
  const ultimo = partes[partes.length - 1]
  const inicio = partes.slice(0, -1).join(', ')
  // "e" antes do último se for < 100 ou múltiplo de 100
  const ultimoGrupo = grupos[0]
  const usaE = ultimoGrupo > 0 && (ultimoGrupo < 100 || ultimoGrupo % 100 === 0)
  return usaE ? `${inicio} e ${ultimo}` : `${inicio}, ${ultimo}`
}

/** Valor em reais por extenso: 1234.5 -> "mil, duzentos e trinta e quatro reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const v = Math.max(0, Math.round(valor * 100) / 100)
  const reais = Math.floor(v)
  const centavos = Math.round((v - reais) * 100)

  const parteReais =
    reais === 0 ? '' : `${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`
  const parteCent =
    centavos === 0 ? '' : `${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`

  if (parteReais && parteCent) return `${parteReais} e ${parteCent}`
  if (parteReais) return parteReais
  if (parteCent) return parteCent
  return 'zero reais'
}
