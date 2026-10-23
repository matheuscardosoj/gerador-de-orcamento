// Fonte única da paleta dos temas claro e escuro.
//
// Cada cor vira uma variável CSS (`--slate-100: 241 245 249`) definida em `:root` (claro)
// e em `.dark` (escuro). O Tailwind lê essas variáveis, então as mesmas classes
// (`bg-slate-100`, `text-red-700`…) trocam de valor com o tema, sem `dark:` espalhado
// pelos componentes. Os testes de contraste importam este arquivo.

/** Escalas padrão do Tailwind v3 (R G B) para as famílias usadas pela interface. */
const ESCALAS = {
  slate: {
    50: [248, 250, 252],
    100: [241, 245, 249],
    200: [226, 232, 240],
    300: [203, 213, 225],
    400: [148, 163, 184],
    500: [100, 116, 139],
    600: [71, 85, 105],
    700: [51, 65, 85],
    800: [30, 41, 59],
    900: [15, 23, 42],
    950: [2, 6, 23]
  },
  red: {
    50: [254, 242, 242],
    100: [254, 226, 226],
    200: [254, 202, 202],
    300: [252, 165, 165],
    400: [248, 113, 113],
    500: [239, 68, 68],
    600: [220, 38, 38],
    700: [185, 28, 28],
    800: [153, 27, 27],
    900: [127, 29, 29],
    950: [69, 10, 10]
  },
  amber: {
    50: [255, 251, 235],
    100: [254, 243, 199],
    200: [253, 230, 138],
    300: [252, 211, 77],
    400: [251, 191, 36],
    500: [245, 158, 11],
    600: [217, 119, 6],
    700: [180, 83, 9],
    800: [146, 64, 14],
    900: [120, 53, 15],
    950: [69, 26, 3]
  },
  emerald: {
    50: [236, 253, 245],
    100: [209, 250, 229],
    200: [167, 243, 208],
    300: [110, 231, 183],
    400: [52, 211, 153],
    500: [16, 185, 129],
    600: [5, 150, 105],
    700: [4, 120, 87],
    800: [6, 95, 70],
    900: [6, 78, 59],
    950: [2, 44, 34]
  },
  blue: {
    50: [239, 246, 255],
    100: [219, 234, 254],
    200: [191, 219, 254],
    300: [147, 197, 253],
    400: [96, 165, 250],
    500: [59, 130, 246],
    600: [37, 99, 235],
    700: [29, 78, 216],
    800: [30, 64, 175],
    900: [30, 58, 138],
    950: [23, 37, 84]
  },
  teal: {
    50: [240, 253, 250],
    100: [204, 251, 241],
    200: [153, 246, 228],
    300: [94, 234, 212],
    400: [45, 212, 191],
    500: [20, 184, 166],
    600: [13, 148, 136],
    700: [15, 118, 110],
    800: [17, 94, 89],
    900: [19, 78, 74],
    950: [4, 47, 46]
  }
}

export const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/**
 * Famílias cromáticas (alertas, status): no escuro a escala é espelhada
 * (50↔950, 100↔900…), o que mantém o par "fundo suave + texto forte" legível.
 */
function espelhada(escala) {
  return Object.fromEntries(TONS.map((tom, i) => [tom, escala[TONS[TONS.length - 1 - i]]]))
}

/**
 * Cinzas no escuro: preto e cinza neutros (R=G=B), sem o tom azulado da escala slate.
 * Não é um espelho simples, porque a mesma classe serve de superfície, borda, hover e
 * texto. Camadas (da mais funda à mais clara): app (fundo) < surface (cartões) < 50 <
 * 100 (hover/chips) < 200 (bordas).
 */
const SLATE_ESCURO = {
  50: [31, 31, 31],
  100: [38, 38, 38],
  200: [58, 58, 58],
  300: [82, 82, 82],
  400: [115, 115, 115],
  500: [163, 163, 163],
  600: [185, 185, 185],
  700: [212, 212, 212],
  800: [229, 229, 229],
  900: [245, 245, 245],
  950: [250, 250, 250]
}

const cromaticas = Object.fromEntries(
  Object.entries(ESCALAS).filter(([familia]) => familia !== 'slate')
)

/** Tokens semânticos que não existem como escala. */
const SEMANTICOS = {
  claro: {
    app: [241, 245, 249], // fundo da janela
    surface: [255, 255, 255], // cartões, painéis, campos
    inverso: [30, 41, 59], // dicas e rótulos sobre fundo oposto (texto branco)
    overlay: [15, 23, 42], // véu atrás dos modais
    'teal-escuro': [10, 79, 77] // texto/ícone de destaque da marca
  },
  escuro: {
    app: [10, 10, 10],
    surface: [24, 24, 24],
    inverso: [64, 64, 64],
    overlay: [0, 0, 0],
    'teal-escuro': [110, 211, 206]
  }
}

function achatar(escalas, semanticos) {
  const vars = {}
  for (const [familia, escala] of Object.entries(escalas))
    for (const tom of TONS) vars[`${familia}-${tom}`] = escala[tom]
  for (const [nome, rgb] of Object.entries(semanticos)) vars[nome] = rgb
  return vars
}

/** Variáveis de cada tema: { 'slate-100': [r, g, b], app: [...], ... }. */
export const TEMA_CLARO = achatar(ESCALAS, SEMANTICOS.claro)
export const TEMA_ESCURO = achatar(
  {
    slate: SLATE_ESCURO,
    ...Object.fromEntries(Object.entries(cromaticas).map(([f, e]) => [f, espelhada(e)]))
  },
  SEMANTICOS.escuro
)

const css = (rgb) => rgb.join(' ')

/** Objeto para `addBase` do Tailwind: declara as variáveis dos dois temas. */
export function variaveisCss() {
  const paraCss = (tema) =>
    Object.fromEntries(Object.entries(tema).map(([nome, rgb]) => [`--${nome}`, css(rgb)]))
  return { ':root': paraCss(TEMA_CLARO), '.dark': paraCss(TEMA_ESCURO) }
}

/** Cor do Tailwind que lê a variável e aceita opacidade (`bg-slate-900/50`). */
const variavel = (nome) => `rgb(var(--${nome}) / <alpha-value>)`

/** Mapa de cores para `theme.extend.colors`. */
export function coresTailwind() {
  const familias = Object.fromEntries(
    Object.keys(ESCALAS).map((familia) => [
      familia,
      Object.fromEntries(TONS.map((tom) => [tom, variavel(`${familia}-${tom}`)]))
    ])
  )
  return {
    ...familias,
    app: variavel('app'),
    surface: variavel('surface'),
    inverso: variavel('inverso'),
    overlay: variavel('overlay'),
    // Vermelho sólido com texto branco: igual nos dois temas.
    perigo: { DEFAULT: '#dc2626', forte: '#b91c1c' },
    // Identidade visual VS Prestadora (faixa/rodapé verde-petróleo)
    brand: {
      teal: '#0f6d6b',
      tealHover: '#0a4f4d',
      tealDark: variavel('teal-escuro'),
      red: '#c1272d',
      blue: '#1b3a8f'
    }
  }
}
