import { BrowserWindow, dialog, app } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import HTMLtoDOCX from '@turbodocx/html-to-docx'
import { orcamentosRepo, empresaRepo } from './repositories'
import { gerarHtmlOrcamento, gerarHtmlParaDocx } from '@shared/documento/template'
import type { DocumentoResultado } from '@shared/api'
import type { Orcamento } from '@shared/types'

function nomeBase(orc: Orcamento): string {
  const num = orc.numero.replace(/\//g, '-')
  const dest = (orc.destinatario || '')
    .replace(/[^\wÀ-ú\s-]/g, '')
    .trim()
    .slice(0, 40)
  return `Proposta ${num}${dest ? ' - ' + dest : ''}`
}

function htmlDoOrcamento(id: string): { html: string; orc: Orcamento } {
  const orc = orcamentosRepo.get(id)
  if (!orc) throw new Error('Orçamento não encontrado')
  const empresa = empresaRepo.get()
  return { html: gerarHtmlOrcamento(orc, empresa), orc }
}

export async function gerarPdf(id: string): Promise<DocumentoResultado> {
  const { html, orc } = htmlDoOrcamento(id)

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
  const orc = orcamentosRepo.get(id)
  if (!orc) throw new Error('Orçamento não encontrado')
  const html = gerarHtmlParaDocx(orc, empresaRepo.get())

  const buffer = (await HTMLtoDOCX(html, undefined, {
    orientation: 'portrait',
    font: 'Calibri',
    margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
  })) as Buffer

  const r = await dialog.showSaveDialog({
    title: 'Salvar DOCX',
    defaultPath: nomeBase(orc) + '.docx',
    filters: [{ name: 'Documento Word', extensions: ['docx'] }]
  })
  if (r.canceled || !r.filePath) return { caminho: null }
  await writeFile(r.filePath, buffer)
  return { caminho: r.filePath }
}
