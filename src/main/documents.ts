import { BrowserWindow, dialog, app } from 'electron'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { Packer } from 'docx'
import {
  orcamentosRepo,
  relatoriosRepo,
  clientesRepo,
  empresaRepo,
  anexosRepo,
  anexosRelatorioRepo
} from './repositories'
import { gerarHtmlOrcamento, gerarHtmlRelatorio } from '@shared/documento/template'
import { paginarDocumento } from '@shared/documento/paginar'
import { montarDocumentoDocx, montarDocumentoRelatorioDocx } from '@shared/documento/docx'
import { destinatarioComTratamento, nomeBaseDocumento } from '@shared/documento/comum'
import type { DocumentoResultado } from '@shared/api'
import type { Orcamento, Relatorio } from '@shared/types'
import { exigirValidacao, validarOrcamentoFinal, validarRelatorioFinal } from '@shared/validacao'

function nomeBase(orc: Orcamento): string {
  const cliente = orc.clienteId ? clientesRepo.get(orc.clienteId)?.nome : null
  return nomeBaseDocumento('orcamento', orc.titulo, cliente ?? orc.destinatario, orc.data)
}

function nomeBaseRelatorio(rel: Relatorio): string {
  const cliente = rel.clienteId ? clientesRepo.get(rel.clienteId)?.nome : null
  return nomeBaseDocumento('relatorio', rel.titulo, cliente ?? rel.destinatario, rel.data)
}

/** Aplica o tratamento atual apenas à cópia usada para PDF/DOCX. */
function paraDocumento<T extends Orcamento | Relatorio>(documento: T): T {
  const cliente = documento.clienteId ? clientesRepo.get(documento.clienteId) : null
  return cliente
    ? { ...documento, destinatario: destinatarioComTratamento(cliente.tratamento, cliente.nome) }
    : documento
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
  exigirValidacao(validarOrcamentoFinal(orc))
  return orc
}

function carregarRelatorio(id: string): Relatorio {
  const rel = relatoriosRepo.get(id)
  if (!rel) throw new Error('Relatório não encontrado')
  exigirValidacao(validarRelatorioFinal(rel))
  return rel
}

async function salvarPdfHtml(
  html: string,
  nome: string,
  prefixoTemp: string
): Promise<DocumentoResultado> {
  const tmpHtml = join(app.getPath('temp'), `${prefixoTemp}-${Date.now()}.html`)
  await writeFile(tmpHtml, html, 'utf-8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: true }
  })
  try {
    await win.loadFile(tmpHtml)
    await win.webContents.executeJavaScript(`(${paginarDocumento.toString()})(document)`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    const r = await dialog.showSaveDialog({
      title: 'Salvar PDF',
      defaultPath: nome + '.pdf',
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

export async function gerarPdf(id: string): Promise<DocumentoResultado> {
  const orc = carregarOrcamento(id)
  const imagens = imagensDosAnexos(orc)
  // No PDF as fotos saem em tamanho cheio (a miniatura é só para a tela).
  const orcComImagens: Orcamento = {
    ...paraDocumento(orc),
    anexos: (orc.anexos ?? []).map((a) => ({ ...a, imagemDataUrl: imagens.get(a.id) ?? null }))
  }
  return salvarPdfHtml(
    gerarHtmlOrcamento(orcComImagens, empresaRepo.get()),
    nomeBase(orc),
    'orcamento'
  )
}

export async function gerarDocx(id: string): Promise<DocumentoResultado> {
  const orc = carregarOrcamento(id)
  const doc = montarDocumentoDocx(paraDocumento(orc), empresaRepo.get(), imagensDosAnexos(orc))
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

function imagensDoRelatorio(rel: Relatorio): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const a of rel.anexos) {
    const dataUrl = anexosRelatorioRepo.imagem(a.id)
    if (dataUrl) mapa.set(a.id, dataUrl)
  }
  return mapa
}

export async function gerarRelatorioPdf(id: string): Promise<DocumentoResultado> {
  const rel = carregarRelatorio(id)
  const imagens = imagensDoRelatorio(rel)
  const comImagens: Relatorio = {
    ...paraDocumento(rel),
    anexos: rel.anexos.map((a) => ({ ...a, imagemDataUrl: imagens.get(a.id) ?? null }))
  }
  return salvarPdfHtml(
    gerarHtmlRelatorio(comImagens, empresaRepo.get()),
    nomeBaseRelatorio(rel),
    'relatorio'
  )
}

export async function gerarRelatorioDocx(id: string): Promise<DocumentoResultado> {
  const rel = carregarRelatorio(id)
  const doc = montarDocumentoRelatorioDocx(
    paraDocumento(rel),
    empresaRepo.get(),
    imagensDoRelatorio(rel)
  )
  const buffer = await Packer.toBuffer(doc)
  const r = await dialog.showSaveDialog({
    title: 'Salvar DOCX',
    defaultPath: nomeBaseRelatorio(rel) + '.docx',
    filters: [{ name: 'Documento Word', extensions: ['docx'] }]
  })
  if (r.canceled || !r.filePath) return { caminho: null }
  await writeFile(r.filePath, buffer)
  return { caminho: r.filePath }
}
