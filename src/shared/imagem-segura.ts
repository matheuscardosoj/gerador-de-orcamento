// Validação de imagens vindas de fora (nuvem sincronizada, backups): o conteúdo
// acaba em atributos `src` de HTML, então só formatos e alfabetos esperados passam.

/** Data URL de imagem com base64 válido; qualquer outro texto é recusado. */
export const PADRAO_DATA_URL_IMAGEM =
  /^data:image\/(?:png|jpe?g|gif|bmp|webp);base64,[A-Za-z0-9+/=]+$/i

const HASH = /^[0-9a-f]{64}$/
const BASE64 = /^[A-Za-z0-9+/=]+$/
const MIMES = new Set(['image/png', 'image/jpeg'])

const numeroFinito = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)

/** Confere uma linha da tabela `imagens` antes de gravá-la no banco local. */
export function linhaImagemValida(row: Record<string, unknown>): boolean {
  return (
    typeof row.hash === 'string' &&
    HASH.test(row.hash) &&
    typeof row.mime === 'string' &&
    MIMES.has(row.mime) &&
    typeof row.base64 === 'string' &&
    BASE64.test(row.base64) &&
    (row.miniatura_base64 == null ||
      (typeof row.miniatura_base64 === 'string' && BASE64.test(row.miniatura_base64))) &&
    numeroFinito(row.bytes) &&
    numeroFinito(row.largura) &&
    numeroFinito(row.altura)
  )
}
