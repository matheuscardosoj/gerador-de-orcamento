import { BrowserWindow, dialog, app } from 'electron'
import { existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { Packer } from 'docx'
import { orcamentosRepo, relatoriosRepo, empresaRepo } from './repositories'
import { recibosRepo } from './recibos'
import { gerarHtmlOrcamento, gerarHtmlRelatorio } from '@shared/documento/template'
import { montarDocumentoDocx, montarDocumentoRelatorioDocx } from '@shared/documento/docx'
import { reciboComoDocumento } from '@shared/documento/recibo'
import { paginarDocumento } from '@shared/documento/paginar'
import { destinatarioComTratamento, nomeBaseDocumento } from '@shared/documento/comum'
import { exigirValidacao, validarOrcamentoFinal, validarRelatorioFinal } from '@shared/validacao'
import {
  exigirResponsavel,
  obterVersao,
  registrarVersao,
  enfileirar,
  pacoteDocumento
} from './versoes'
import { numeroNuvem } from './numeros'
import { imagemDataUrl } from './imagens'
import { run, tx } from './db/sqlite'
import type { Documento, Orcamento, Relatorio, Recibo, TipoDocumento } from '@shared/types'
import type { DocumentoResultado } from '@shared/api'
function preparar(tipo: TipoDocumento, id: string): Documento {
  const repo =
    tipo === 'orcamento' ? orcamentosRepo : tipo === 'relatorio' ? relatoriosRepo : recibosRepo
  let d = repo.get(id)
  if (!d) throw new Error('Documento não encontrado.')
  exigirResponsavel(tipo, id)
  if (d.numero <= 0)
    d = tx(() => {
      const numero = numeroNuvem(tipo, () => 0, true)
      if (numero <= 0)
        throw new Error(
          'Sem números reservados. Conecte e sincronize para liberar a emissão. O rascunho continua salvo.'
        )
      const novo = { ...d!, numero }
      if (tipo === 'recibo')
        run('UPDATE recibos SET numero=?,dados=? WHERE id=?', [numero, JSON.stringify(novo), id])
      else
        run(
          `UPDATE ${tipo === 'orcamento' ? 'orcamentos' : 'relatorios'} SET numero=? WHERE id=?`,
          [numero, id]
        )
      const salvo = registrarVersao(tipo, novo)
      enfileirar(`${tipo}:${id}`, pacoteDocumento(tipo, id))
      return salvo
    }) as typeof d
  return d
}
function paraDocumento<T extends Documento>(d: T): T {
  const c = d.clienteSnapshot
  return c ? { ...d, destinatario: destinatarioComTratamento(c.tratamento, c.nome) } : d
}
function imagens(d: Orcamento | Relatorio): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const a of d.anexos) {
    const data = a.imagemHash ? imagemDataUrl(a.imagemHash) : a.imagemDataUrl
    if (!data)
      throw new Error(
        `A foto “${a.titulo}” ainda não está disponível neste computador. Sincronize antes de exportar.`
      )
    mapa.set(a.id, data)
  }
  return mapa
}
async function escolher(nome: string, ext: 'pdf' | 'docx'): Promise<string | null> {
  let caminho = join(app.getPath('documents'), `${nome}.${ext}`)
  let n = 2
  while (existsSync(caminho)) caminho = join(app.getPath('documents'), `${nome} (${n++}).${ext}`)
  const r = await dialog.showSaveDialog({
    title: `Salvar ${ext.toUpperCase()}`,
    defaultPath: caminho,
    filters: [{ name: ext === 'pdf' ? 'PDF' : 'Documento Word', extensions: [ext] }]
  })
  if (r.canceled || !r.filePath) return null
  const destino = r.filePath.toLowerCase().endsWith(`.${ext}`) ? r.filePath : `${r.filePath}.${ext}`
  if (existsSync(destino)) {
    const c = await dialog.showMessageBox({
      type: 'warning',
      message: 'Substituir o arquivo existente?',
      detail: destino,
      buttons: ['Cancelar', 'Substituir'],
      defaultId: 0,
      cancelId: 0
    })
    if (c.response !== 1) return null
  }
  return destino
}
async function exportar(
  tipo: TipoDocumento,
  d: Documento,
  formato: 'pdf' | 'docx'
): Promise<DocumentoResultado> {
  if (d.numero <= 0)
    throw new Error(
      'Esta versão é um rascunho sem número reservado e não pode ser emitida. Sincronize e exporte a versão atual após reservar a numeração.'
    )
  const cliente = d.clienteSnapshot?.nome ?? d.destinatario
  const recibo = tipo === 'recibo' ? (d as Recibo) : null
  if (recibo && recibo.status === 'rascunho')
    throw new Error('Salve como pagamento pendente ou confirme o recebimento antes de emitir.')
  const prefixo = recibo && recibo.status !== 'recebido' ? 'cobranca' : tipo
  const nome = nomeBaseDocumento(
    prefixo,
    'titulo' in d ? d.titulo : '',
    cliente,
    d.data,
    d.numero,
    d.versao ?? 1
  )
  d = paraDocumento(d)
  const empresa = d.empresaSnapshot ?? empresaRepo.get()
  if (empresa.logoHash && !imagemDataUrl(empresa.logoHash))
    throw new Error('A logo desta versão ainda não está disponível. Sincronize antes de emitir.')
  let html: string
  let buffer: Buffer | undefined
  if (tipo === 'relatorio') {
    const rel = d as Relatorio
    exigirValidacao(validarRelatorioFinal(rel))
    const mapa = imagens(rel)
    html = gerarHtmlRelatorio(
      { ...rel, anexos: rel.anexos.map((a) => ({ ...a, imagemDataUrl: mapa.get(a.id) })) },
      empresa
    )
    if (formato === 'docx')
      buffer = await Packer.toBuffer(montarDocumentoRelatorioDocx(rel, empresa, mapa))
  } else {
    const orc = recibo ? reciboComoDocumento(d as Recibo) : (d as Orcamento)
    if (!recibo) exigirValidacao(validarOrcamentoFinal(orc))
    const mapa = imagens(orc)
    html = gerarHtmlOrcamento(
      { ...orc, anexos: orc.anexos.map((a) => ({ ...a, imagemDataUrl: mapa.get(a.id) })) },
      empresa
    )
    if (formato === 'docx') buffer = await Packer.toBuffer(montarDocumentoDocx(orc, empresa, mapa))
  }
  if (formato === 'pdf') {
    const tmp = join(app.getPath('temp'), `gdo-${randomUUID()}.html`)
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await writeFile(tmp, html, 'utf8')
      await win.loadFile(tmp)
      await win.webContents.executeJavaScript(`(${paginarDocumento.toString()})(document)`)
      buffer = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    } finally {
      win.destroy()
      await unlink(tmp).catch(() => undefined)
    }
  }
  const caminho = await escolher(nome, formato)
  if (!caminho) return { caminho: null }
  await writeFile(caminho, buffer!)
  return { caminho }
}
export const gerarPdf = (id: string): Promise<DocumentoResultado> =>
  exportar('orcamento', preparar('orcamento', id), 'pdf')
export const gerarDocx = (id: string): Promise<DocumentoResultado> =>
  exportar('orcamento', preparar('orcamento', id), 'docx')
export const gerarRelatorioPdf = (id: string): Promise<DocumentoResultado> =>
  exportar('relatorio', preparar('relatorio', id), 'pdf')
export const gerarRelatorioDocx = (id: string): Promise<DocumentoResultado> =>
  exportar('relatorio', preparar('relatorio', id), 'docx')
export const gerarReciboPdf = (id: string): Promise<DocumentoResultado> =>
  exportar('recibo', preparar('recibo', id), 'pdf')
export const gerarReciboDocx = (id: string): Promise<DocumentoResultado> =>
  exportar('recibo', preparar('recibo', id), 'docx')
export function exportarVersao(id: string, formato: 'pdf' | 'docx'): Promise<DocumentoResultado> {
  const v = obterVersao(id)
  return exportar(v.tipo, v.documento, formato)
}
export function htmlVersao(id: string): string {
  const v = obterVersao(id)
  const d = paraDocumento(v.documento)
  const empresa = d.empresaSnapshot ?? empresaRepo.get()
  if (v.tipo === 'recibo') return gerarHtmlOrcamento(reciboComoDocumento(d as Recibo), empresa)
  const doc = d as Orcamento | Relatorio
  const mapa = imagens(doc)
  const completo = {
    ...doc,
    anexos: doc.anexos.map((a) => ({ ...a, imagemDataUrl: mapa.get(a.id) }))
  }
  return v.tipo === 'relatorio'
    ? gerarHtmlRelatorio(completo as Relatorio, empresa)
    : gerarHtmlOrcamento(completo as Orcamento, empresa)
}
