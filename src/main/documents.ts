import { BrowserWindow, dialog, app } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { Packer } from 'docx'
import { orcamentosRepo, empresaRepo, anexosRepo } from './repositories'
import { gerarHtmlOrcamento } from '@shared/documento/template'
import { montarDocumentoDocx } from '@shared/documento/docx'
import type { DocumentoResultado } from '@shared/api'
import type { Orcamento } from '@shared/types'

function nomeBase(orc: Orcamento): string {
  const dest = (orc.destinatario || '')
    .replace(/[^\wÀ-ú\s-]/g, '')
    .trim()
    .slice(0, 40)
  return `Proposta ${orc.numero}${dest ? ' - ' + dest : ''}`
}

/**
 * Lê os BLOBs das fotos. Só acontece na hora de gerar o documento — no resto do
 * app circulam apenas as miniaturas.
 */
function imagensDosAnexos(orc: Orcamento): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const a of orc.anexos ?? []) {
    const dataUrl = anexosRepo.imagem(a.id)
    if (dataUrl) mapa.set(a.id, dataUrl)
  }
  return mapa
}

function carregarOrcamento(id: string): Orcamento {
  const orc = orcamentosRepo.get(id)
  if (!orc) throw new Error('Orçamento não encontrado')
  return orc
}

export async function gerarPdf(id: string): Promise<DocumentoResultado> {
  const orc = carregarOrcamento(id)
  const imagens = imagensDosAnexos(orc)
  // No PDF as fotos saem em tamanho cheio (a miniatura é só para a tela).
  const orcComImagens: Orcamento = {
    ...orc,
    anexos: (orc.anexos ?? []).map((a) => ({ ...a, imagemDataUrl: imagens.get(a.id) ?? null }))
  }
  const html = gerarHtmlOrcamento(orcComImagens, empresaRepo.get(), { ajustarAssinatura: true })

  // Renderiza o HTML numa janela oculta e imprime para PDF (sem software externo).
  const tmpHtml = join(app.getPath('temp'), `orcamento-${Date.now()}.html`)
  await writeFile(tmpHtml, html, 'utf-8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: true }
  })
  try {
    await win.loadFile(tmpHtml)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })

    const r = await dialog.showSaveDialog({
      title: 'Salvar PDF',
      defaultPath: nomeBase(orc) + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return { caminho: null }
    await writeFile(r.filePath, pdf)
    return { caminho: r.filePath }
  } finally {
    win.destroy()
    unlink(tmpHtml).catch(() => undefined)
  }
}

export async function gerarDocx(id: string): Promise<DocumentoResultado> {
  const orc = carregarOrcamento(id)
  const doc = montarDocumentoDocx(orc, empresaRepo.get(), imagensDosAnexos(orc))
  const buffer = await Packer.toBuffer(doc)

  const r = await dialog.showSaveDialog({
    title: 'Salvar DOCX',
    defaultPath: nomeBase(orc) + '.docx',
    filters: [{ name: 'Documento Word', extensions: ['docx'] }]
  })
  if (r.canceled || !r.filePath) return { caminho: null }
  await writeFile(r.filePath, buffer)
  return { caminho: r.filePath }
}
