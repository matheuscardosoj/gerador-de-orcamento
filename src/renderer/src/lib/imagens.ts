// Redimensionamento das fotos anexadas, feito no próprio renderer com <canvas>
// (sem dependência nativa). Fotos de celular chegam com 4–8 MB; guardadas assim
// o banco cresceria centenas de MB por orçamento.
import type { AnexoOrcamento } from '@shared/types'

const LADO_MAXIMO = 1600
const LADO_MINIATURA = 320
const QUALIDADE = 0.82
const QUALIDADE_MINIATURA = 0.72

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result))
    leitor.onerror = () => reject(new Error(`Não foi possível abrir o arquivo "${arquivo.name}".`))
    leitor.readAsDataURL(arquivo)
  })
}

/**
 * Lê o arquivo como data URL, e não com `URL.createObjectURL`: a CSP do
 * renderer (ver `src/renderer/index.html`) libera `data:` para imagens, mas
 * não `blob:` — um object URL falharia ao carregar.
 */
async function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  const dataUrl = await lerComoDataUrl(arquivo)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Não foi possível ler a imagem "${arquivo.name}".`))
    img.src = dataUrl
  })
}

function redimensionar(
  img: HTMLImageElement,
  ladoMaximo: number,
  qualidade: number
): {
  dataUrl: string
  largura: number
  altura: number
} {
  const escala = Math.min(ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight), 1)
  const largura = Math.max(1, Math.round(img.naturalWidth * escala))
  const altura = Math.max(1, Math.round(img.naturalHeight * escala))
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível para processar a imagem.')
  // Fundo branco: JPEG não tem transparência e PNGs transparentes ficariam pretos.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.drawImage(img, 0, 0, largura, altura)
  return { dataUrl: canvas.toDataURL('image/jpeg', qualidade), largura, altura }
}

const novoId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** Converte um arquivo escolhido pelo usuário em um anexo pronto para salvar. */
export async function arquivoParaAnexo(arquivo: File): Promise<AnexoOrcamento> {
  const img = await carregarImagem(arquivo)
  const comprimir = (
    lado: number,
    qualidade: number,
    limite: number
  ): ReturnType<typeof redimensionar> => {
    let imagem = redimensionar(img, lado, qualidade)
    for (
      let tentativa = 0;
      (imagem.dataUrl.split(',')[1].length * 3) / 4 > limite && tentativa < 14;
      tentativa++
    ) {
      if (qualidade > 0.58) qualidade -= 0.08
      else lado = Math.floor(lado * 0.85)
      imagem = redimensionar(img, lado, qualidade)
    }
    if ((imagem.dataUrl.split(',')[1].length * 3) / 4 > limite)
      throw new Error('Esta imagem não pode ser reduzida com segurança. Escolha outra foto.')
    return imagem
  }
  const cheia = comprimir(LADO_MAXIMO, QUALIDADE, 250 * 1024)
  const mini = comprimir(LADO_MINIATURA, QUALIDADE_MINIATURA, 20 * 1024)
  return {
    id: novoId(),
    itemServicoId: null,
    // O nome do arquivo (sem extensão) vira o título inicial — quase sempre é útil.
    titulo: arquivo.name.replace(/\.[^.]+$/, '').slice(0, 80),
    descricao: '',
    mime: 'image/jpeg',
    largura: cheia.largura,
    altura: cheia.altura,
    miniaturaDataUrl: mini.dataUrl,
    imagemDataUrl: cheia.dataUrl
  }
}

export async function arquivosParaAnexos(arquivos: FileList | File[]): Promise<AnexoOrcamento[]> {
  const imagens = Array.from(arquivos).filter((a) => a.type.startsWith('image/'))
  return Promise.all(imagens.map(arquivoParaAnexo))
}
