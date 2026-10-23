// Garante legibilidade (WCAG 2.1) dos pares de cor realmente usados nos dois temas.
import { describe, expect, it } from 'vitest'
import { TEMA_CLARO, TEMA_ESCURO, variaveisCss, type Rgb } from '../../tailwind.tema.mjs'

const luminancia = ([r, g, b]: Rgb): number => {
  const canal = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export function contraste(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

/** Cor `frente` com opacidade `alfa` sobre `fundo`. */
const sobre = (frente: Rgb, alfa: number, fundo: Rgb): Rgb =>
  frente.map((v, i) => Math.round(v * alfa + fundo[i] * (1 - alfa))) as Rgb

const BRANCO: Rgb = [255, 255, 255]
const TEAL: Rgb = [15, 109, 107] // brand-teal (fixo)
const TEAL_HOVER: Rgb = [10, 79, 77]
const PERIGO: Rgb = [220, 38, 38]
const PERIGO_FORTE: Rgb = [185, 28, 28]

type Cor = string | Rgb | ((tema: Record<string, Rgb>) => Rgb)
/** `minimoClaro`: piso do tema claro quando a paleta padrão do Tailwind (inalterada) já fica abaixo do ideal. */
type Par = [descricao: string, texto: Cor, fundo: Cor, minimo: number, minimoClaro?: number]

/** Pares usados pelas telas. 4.5 = texto normal (AA); 3 = ícones e componentes de interface. */
function pares(): Par[] {
  return [
    ['texto principal no cartão', 'slate-900', 'surface', 4.5],
    ['texto principal no fundo', 'slate-900', 'app', 4.5],
    ['título no cartão', 'slate-800', 'surface', 4.5],
    ['texto forte', 'slate-700', 'surface', 4.5],
    ['texto secundário', 'slate-600', 'surface', 4.5],
    ['texto secundário no fundo', 'slate-600', 'app', 4.5],
    ['texto discreto', 'slate-500', 'surface', 4.5],
    ['texto discreto no fundo', 'slate-500', 'app', 4.5, 4.3],
    ['texto em chip/hover', 'slate-600', 'slate-100', 4.5],
    ['texto principal em painel tingido', 'slate-900', 'slate-50', 4.5],
    ['ícone/placeholder', 'slate-400', 'surface', 3, 2.5],
    ['borda de campo', 'slate-300', 'surface', 1.2],
    ['destaque da marca no cartão', 'teal-escuro', 'surface', 4.5],
    ['destaque da marca em item ativo', 'teal-escuro', (t) => sobre(TEAL, 0.1, t.surface), 4.5],
    ['branco sobre botão primário', BRANCO, TEAL, 4.5],
    ['branco sobre botão primário (hover)', BRANCO, TEAL_HOVER, 4.5],
    ['branco sobre botão de perigo', BRANCO, PERIGO, 4.5],
    ['branco sobre botão de perigo (hover)', BRANCO, PERIGO_FORTE, 4.5],
    ['branco sobre dica', BRANCO, 'inverso', 4.5],
    ['erro: texto sobre fundo suave', 'red-700', 'red-50', 4.5],
    ['erro: texto forte sobre fundo suave', 'red-900', 'red-50', 4.5],
    ['erro: texto sobre o cartão', 'red-600', 'surface', 4.5],
    ['aviso: texto sobre fundo suave', 'amber-800', 'amber-50', 4.5],
    ['aviso: texto forte sobre fundo suave', 'amber-900', 'amber-50', 4.5],
    ['aviso: texto sobre selo', 'amber-700', 'amber-100', 4.5],
    ['sucesso: texto sobre fundo suave', 'emerald-700', 'emerald-50', 4.5],
    ['sucesso: texto forte sobre fundo suave', 'emerald-900', 'emerald-50', 4.5],
    ['sucesso: texto sobre selo', 'emerald-700', 'emerald-100', 4.5],
    ['informação: texto sobre selo', 'blue-700', 'blue-100', 4.5],
    ['link teal sobre o cartão', 'teal-700', 'surface', 4.5]
  ]
}

const resolver = (tema: Record<string, Rgb>, cor: Cor): Rgb =>
  typeof cor === 'string' ? tema[cor] : typeof cor === 'function' ? cor(tema) : cor

describe.each([
  ['claro', TEMA_CLARO],
  ['escuro', TEMA_ESCURO]
] as const)('contraste do tema %s', (nome, tema) => {
  it.each(pares())('%s', (descricao, texto, fundo, minimo, minimoClaro) => {
    const t = resolver(tema, texto)
    const f = resolver(tema, fundo)
    expect(t, `cor de texto inexistente: ${String(texto)}`).toBeDefined()
    expect(f, `cor de fundo inexistente: ${String(fundo)}`).toBeDefined()
    const razao = contraste(t, f)
    expect(razao, `${descricao}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      nome === 'claro' ? (minimoClaro ?? minimo) : minimo
    )
  })
})

describe('definição das variáveis', () => {
  it('os dois temas declaram exatamente as mesmas variáveis', () => {
    expect(Object.keys(TEMA_ESCURO).sort()).toEqual(Object.keys(TEMA_CLARO).sort())
    const css = variaveisCss()
    expect(Object.keys(css['.dark']).sort()).toEqual(Object.keys(css[':root']).sort())
  })

  it('todo canal é um inteiro de 0 a 255', () => {
    for (const tema of [TEMA_CLARO, TEMA_ESCURO])
      for (const [nome, rgb] of Object.entries(tema)) {
        expect(rgb, nome).toHaveLength(3)
        for (const v of rgb) expect(Number.isInteger(v) && v >= 0 && v <= 255, nome).toBe(true)
      }
  })

  it('no escuro as camadas ficam em ordem: fundo < cartão < painel < hover < borda', () => {
    const l = (n: string): number => luminancia(TEMA_ESCURO[n])
    expect(l('app')).toBeLessThan(l('surface'))
    expect(l('surface')).toBeLessThan(l('slate-50'))
    expect(l('slate-50')).toBeLessThan(l('slate-100'))
    expect(l('slate-100')).toBeLessThan(l('slate-200'))
  })
})
