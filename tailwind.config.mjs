import plugin from 'tailwindcss/plugin'
import { coresTailwind, variaveisCss } from './tailwind.tema.mjs'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  // O tema escuro é a classe `dark` em <html>, definida por src/renderer/src/lib/tema.ts.
  darkMode: 'class',
  theme: {
    extend: {
      colors: coresTailwind(),
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [plugin(({ addBase }) => addBase(variaveisCss()))]
}
