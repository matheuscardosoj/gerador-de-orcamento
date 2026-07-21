// Gera o ícone do app (build/icon.ico) e a logo embutida (build/logo.dataurl.txt)
// a partir de build/logo-vs.png.
//
// Uso: coloque a logo em build/logo-vs.png e rode `npm run icone`.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origem = join(raiz, 'build', 'logo-vs.png')

if (!existsSync(origem)) {
  console.error(`\n[icone] Arquivo não encontrado: ${origem}`)
  console.error('        Salve a logo da VS em build/logo-vs.png e rode novamente.\n')
  process.exit(1)
}

const tamanhos = [256, 128, 64, 48, 32, 24, 16]

// Gera PNGs quadrados (fundo transparente) em cada tamanho e monta o .ico.
const buffers = await Promise.all(
  tamanhos.map((t) =>
    sharp(origem)
      .resize(t, t, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
)

const ico = await pngToIco(buffers)
writeFileSync(join(raiz, 'build', 'icon.ico'), ico)

// Logo embutida (256px) como data URL para o cabeçalho dos orçamentos.
const png256 = buffers[0]
const dataUrl = `data:image/png;base64,${png256.toString('base64')}`

// Sobrescreve o módulo importado pelo seed, embutindo a logo no bundle.
const ts = `// Logo padrão da empresa embutida como data URL, usada no seed inicial.
// Gerado automaticamente por \`npm run icone\` a partir de build/logo-vs.png.
export const LOGO_VS_DATAURL: string | null =
  '${dataUrl}'
`
writeFileSync(join(raiz, 'src', 'main', 'db', 'logo-embutida.ts'), ts)

console.log('[icone] Gerado build/icon.ico e src/main/db/logo-embutida.ts com sucesso.')
