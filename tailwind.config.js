/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identidade visual VS Prestadora (faixa/rodapé verde-petróleo)
        brand: {
          teal: '#0f6d6b',
          tealDark: '#0a4f4d',
          red: '#c1272d',
          blue: '#1b3a8f'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
