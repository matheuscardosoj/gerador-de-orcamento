// Gera:
//  - build/icon.ico  -> ícone do APLICATIVO (genérico), a partir de build/app-icon.svg
//                       (fallback: build/logo-vs.png)
//  - src/main/db/logo-embutida.ts -> logo da EMPRESA no cabeçalho dos orçamentos,
//                       a partir de build/logo-vs.png (se existir)
//
// Uso: `npm run icone`
import { writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgApp = join(raiz, 'build', 'app-icon.svg')
const logoVs = join(raiz, 'build', 'logo-vs.png')

const tamanhos = [256, 128, 64, 48, 32, 24, 16]

// 1) Ícone do aplicativo (genérico) -> build/icon.ico
const fonteIcone = existsSync(svgApp) ? svgApp : existsSync(logoVs) ? logoVs : null
if (!fonteIcone) {
  console.error('[icone] Nenhuma fonte encontrada (build/app-icon.svg ou build/logo-vs.png).')
  process.exit(1)
}
const buffers = await Promise.all(
  tamanhos.map((t) =>
    sharp(fonteIcone)
      .resize(t, t, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
)
writeFileSync(join(raiz, 'build', 'icon.ico'), await pngToIco(buffers))
console.log(`[icone] build/icon.ico gerado a partir de ${fonteIcone.split(/[\\/]/).pop()}`)

// 2) Logo da empresa no cabeçalho dos orçamentos -> logo-embutida.ts
if (existsSync(logoVs)) {
  const png256 = await sharp(logoVs)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const dataUrl = `data:image/png;base64,${png256.toString('base64')}`
  const ts = `// Logo padrão da empresa embutida como data URL, usada no seed inicial.
// Gerado automaticamente por \`npm run icone\` a partir de build/logo-vs.png.
export const LOGO_VS_DATAURL: string | null =
  '${dataUrl}'
`
  writeFileSync(join(raiz, 'src', 'main', 'db', 'logo-embutida.ts'), ts)
  console.log('[icone] logo-embutida.ts atualizado a partir de build/logo-vs.png')
} else {
  console.log('[icone] build/logo-vs.png ausente; logo-embutida.ts mantido.')
}
