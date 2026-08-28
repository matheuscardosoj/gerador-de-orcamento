// Gerador de DOCX. Monta o OOXML diretamente (biblioteca `docx`), espelhando
// medida a medida o layout de `gerarHtmlOrcamento` — a conversão via HTML
// perdia margens, realce e bordas, deixando o Word diferente do PDF.
import {
  AlignmentType,
  BorderStyle,
  Document,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  HorizontalPositionAlign,
  ImageRun,
  LevelFormat,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalPositionAlign,
  WidthType,
  convertMillimetersToTwip
} from 'docx'
import type { IParagraphOptions, IRunOptions, ParagraphChild } from 'docx'
import { formatMoeda, formatDataExtenso } from '../format'
import { valorPorExtenso } from '../extenso'
import { referenciaDoAnexo } from './template'
import { destinatarioNoDocumento, LIMITE_ANEXO_MM } from './comum'
import type { AnexoOrcamento, AnexoRelatorio, EmpresaConfig, Orcamento, Relatorio } from '../types'

// ------------------------------------------------------------- Constantes
const FONTE = 'Calibri'
const CORPO = 23 // 11,5pt em meio-pontos
const MIUDO = 21 // 10,5pt
const ENTRELINHA = 336 // 1,4 × 240 (mesma proporção do CSS)
const AMARELO = 'FFF275'
const CINZA_BORDA = '666666'

const mm = convertMillimetersToTwip
/** Milímetros em pixels a 96dpi (a lib `docx` recebe imagens em pixels). */
const mmParaPx = (v: number): number => Math.round(v * 3.7795)

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const BORDA_CELULA = { style: BorderStyle.SINGLE, size: 8, color: CINZA_BORDA } as const

/** Quebra o texto em runs, transformando \n em quebras de linha do Word. */
function runsDeTexto(texto: string, opcoes: Omit<IRunOptions, 'text' | 'break'> = {}): TextRun[] {
  return String(texto ?? '')
    .split('\n')
    .map((linha, i) => new TextRun({ ...opcoes, text: linha, break: i > 0 ? 1 : undefined }))
}

function p(texto: string, opcoes: IParagraphOptions = {}, run: Omit<IRunOptions, 'text'> = {}): Paragraph {
  return new Paragraph({ children: runsDeTexto(texto, run), ...opcoes })
}

/** Converte uma data URL de imagem em bytes + tipo aceito pela lib. */
function imagemDeDataUrl(
  dataUrl: string | null | undefined
): { data: Buffer; tipo: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  if (!dataUrl) return null
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i)
  if (!m) return null
  const ext = m[1].toLowerCase()
  const tipo = ext === 'jpeg' || ext === 'jpg' ? 'jpg' : (ext as 'png' | 'gif' | 'bmp')
  return { data: Buffer.from(m[2], 'base64'), tipo }
}

function extrairCidade(endereco: string): string {
  const m = endereco.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}/)
  return m ? m[1].trim() : 'Rio Verde'
}

// -------------------------------------------------------------- Cabeçalho
function cabecalho(empresa: EmpresaConfig): Table {
  const logo = imagemDeDataUrl(empresa.logoDataUrl)
  const celulaLogo = new TableCell({
    width: { size: 1620, type: WidthType.DXA }, // 108px, igual ao .logo do CSS
    margins: { top: 0, bottom: 0, left: 0, right: 160 },
    borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, after: 0 },
        children: logo
          ? [
              new ImageRun({
                type: logo.tipo,
                data: logo.data,
                transformation: { width: 108, height: 108 }
              })
            ]
          : []
      })
    ]
  })

  const linha = (texto: string, negrito = false, tamanho = MIUDO): Paragraph =>
    p(
      texto,
      { alignment: AlignmentType.CENTER, spacing: { line: 260, after: 0 } },
      { bold: negrito, size: negrito ? 24 : tamanho }
    )

  const dados: Paragraph[] = [
    linha(empresa.nome, true),
    linha(empresa.endereco),
    linha(`Fone: ${empresa.telefones}`)
  ]
  if (empresa.site) dados.push(linha(`Site: ${empresa.site}`))
  dados.push(linha(`e-mail: ${empresa.email}`))
  dados.push(linha(`CNPJ: ${empresa.cnpj}`))

  const celulaEmpresa = new TableCell({
    margins: { top: 0, bottom: 120, left: 0, right: 0 },
    borders: {
      top: SEM_BORDA,
      left: SEM_BORDA,
      right: SEM_BORDA,
      // 2,5pt: a mesma régua do `border-bottom: 2.5px solid #000` no CSS.
      bottom: { style: BorderStyle.SINGLE, size: 20, color: '000000' }
    },
    children: dados
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: SEM_BORDA,
      bottom: SEM_BORDA,
      left: SEM_BORDA,
      right: SEM_BORDA,
      insideHorizontal: SEM_BORDA,
      insideVertical: SEM_BORDA
    },
    rows: [new TableRow({ children: [celulaLogo, celulaEmpresa] })]
  })
}

// --------------------------------------------------------------- Serviços
function servicosCarta(orc: Orcamento): Paragraph[] {
  return orc.itensServico.map((i, idx) => {
    const filhos: ParagraphChild[] = [new TextRun({ text: `Item ${idx + 1} -`, bold: true })]
    filhos.push(...runsDeTexto(` ${i.descricao}`))
    if (i.quantidade > 1 && i.valorUnitario > 0) {
      filhos.push(new TextRun({ text: ` / Valor por ${i.unidade}: ${formatMoeda(i.valorUnitario)}` }))
    }
    filhos.push(new TextRun({ text: ` / Valor do item: ${formatMoeda(i.valorTotal)}` }))
    return new Paragraph({
      children: filhos,
      alignment: AlignmentType.BOTH,
      spacing: { line: ENTRELINHA, after: mm(3) }
    })
  })
}

function celulaTabela(
  filhos: Paragraph[],
  opcoes: { largura: number; fundo?: string }
): TableCell {
  return new TableCell({
    width: { size: opcoes.largura, type: WidthType.PERCENTAGE },
    shading: opcoes.fundo ? { fill: opcoes.fundo } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: BORDA_CELULA, bottom: BORDA_CELULA, left: BORDA_CELULA, right: BORDA_CELULA },
    children: filhos
  })
}

function servicosTabela(orc: Orcamento): Table {
  // Mesmas proporções do CSS (.c-item 40px, .c-unid 66px, resto proporcional).
  const larguras = [6, 45, 10, 9, 15, 15]
  const celulaTexto = (texto: string, alinhamento: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph[] => [
    p(texto, { alignment: alinhamento, spacing: { line: 240, after: 0 } }, { size: MIUDO })
  ]

  const cabecalhos = ['Item', 'Especificação', 'Unid.', 'Qtd', 'Valor unit.', 'Total']
  const linhaCabecalho = new TableRow({
    tableHeader: true,
    children: cabecalhos.map((titulo, i) =>
      celulaTabela(
        [
          new Paragraph({
            alignment: i === 0 ? AlignmentType.CENTER : i >= 3 ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { line: 240, after: 0 },
            children: [new TextRun({ text: titulo, bold: true, size: MIUDO })]
          })
        ],
        { largura: larguras[i], fundo: 'EEEEEE' }
      )
    )
  })

  const linhas = orc.itensServico.map(
    (i, idx) =>
      new TableRow({
        children: [
          celulaTabela(celulaTexto(String(idx + 1), AlignmentType.CENTER), { largura: larguras[0] }),
          celulaTabela(celulaTexto(i.descricao, AlignmentType.LEFT), { largura: larguras[1] }),
          celulaTabela(celulaTexto(i.unidade, AlignmentType.LEFT), { largura: larguras[2] }),
          celulaTabela(celulaTexto(String(i.quantidade), AlignmentType.RIGHT), { largura: larguras[3] }),
          celulaTabela(celulaTexto(formatMoeda(i.valorUnitario), AlignmentType.RIGHT), { largura: larguras[4] }),
          celulaTabela(celulaTexto(formatMoeda(i.valorTotal), AlignmentType.RIGHT), { largura: larguras[5] })
        ]
      })
  )

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [linhaCabecalho, ...linhas]
  })
}

// ------------------------------------------------------ Blocos com marcadores
function blocoLista(titulo: string, itens: string[]): Paragraph[] {
  const validos = itens.filter((t) => t && t.trim())
  if (validos.length === 0) return []
  return [
    p(titulo, { spacing: { line: ENTRELINHA, before: mm(4), after: mm(1) } }, { bold: true }),
    ...validos.map(
      (t) =>
        new Paragraph({
          children: runsDeTexto(t),
          numbering: { reference: 'marcadores', level: 0 },
          alignment: AlignmentType.BOTH,
          spacing: { line: ENTRELINHA, after: mm(1) }
        })
    )
  ]
}

// ----------------------------------------------------------------- Anexos
/**
 * Escala a imagem para caber na área útil mantendo a proporção. Os limites são
 * os mesmos do CSS (`.anexo-img`) para PDF e DOCX quebrarem nas mesmas páginas;
 * 100 mm de altura deixa duas fotos por página com folga nos dois formatos.
 */
function dimensoesAnexo(largura: number, altura: number): { width: number; height: number } {
  const maxW = mmParaPx(LIMITE_ANEXO_MM.largura)
  const maxH = mmParaPx(LIMITE_ANEXO_MM.altura)
  const w = largura > 0 ? largura : maxW
  const h = altura > 0 ? altura : maxH
  const escala = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.round(w * escala), height: Math.round(h * escala) }
}

type AnexoComumDocx = Pick<AnexoOrcamento, 'id' | 'titulo' | 'descricao' | 'largura' | 'altura' | 'imagemDataUrl' | 'miniaturaDataUrl'>

function figuraAnexoDocx(anexo: AnexoComumDocx, referencia: string | null, imagem: string | undefined): Paragraph[] {
  const blocos: Paragraph[] = []
  if (anexo.titulo) {
    blocos.push(p(anexo.titulo, { alignment: AlignmentType.CENTER, spacing: { line: ENTRELINHA, after: mm(1) } }, { bold: true }))
  }
  if (referencia) {
    blocos.push(p(referencia, { alignment: AlignmentType.CENTER, spacing: { line: ENTRELINHA, after: mm(2) } }, { italics: true, color: '555555', size: 19 }))
  }
  const img = imagemDeDataUrl(imagem ?? anexo.imagemDataUrl ?? anexo.miniaturaDataUrl)
  if (img) {
    blocos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: mm(2) },
      children: [new ImageRun({ type: img.tipo, data: img.data, transformation: dimensoesAnexo(anexo.largura, anexo.altura) })]
    }))
  }
  if (anexo.descricao) {
    blocos.push(p(anexo.descricao, { alignment: AlignmentType.CENTER, spacing: { line: ENTRELINHA, after: mm(8) } }, { size: MIUDO }))
  }
  return blocos
}

function secaoAnexos(orc: Orcamento, imagens: Map<string, string>): Paragraph[] {
  const anexos = orc.anexos ?? []
  if (anexos.length === 0) return []
  const blocos: Paragraph[] = [
    new Paragraph({
      children: [new PageBreak(), new TextRun({ text: 'Anexos', bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { line: ENTRELINHA, after: mm(6) }
    })
  ]

  for (const a of anexos) blocos.push(...figuraAnexoDocx(a, referenciaDoAnexo(orc, a.itemServicoId), imagens.get(a.id)))
  return blocos
}

// -------------------------------------------------------------- Assinatura
/**
 * Linha + nome, encostados no fim da área útil da página — o equivalente ao que
 * o CSS faz no PDF. Um parágrafo comum ficaria logo abaixo do último texto; por
 * isso vai num *frame* do Word ancorado à margem, alinhado embaixo. Como o frame
 * é ancorado ao parágrafo que fecha a proposta (antes da quebra dos anexos), ele
 * aparece uma única vez, no rodapé da última página da proposta.
 */
function assinatura(empresa: EmpresaConfig): Paragraph[] {
  return [
    new Paragraph({
      frame: {
        type: 'alignment',
        alignment: { x: HorizontalPositionAlign.CENTER, y: VerticalPositionAlign.BOTTOM },
        anchor: { horizontal: FrameAnchorType.MARGIN, vertical: FrameAnchorType.MARGIN },
        // 55% da largura útil (182 mm), a mesma proporção de `.rodape-linha`.
        width: mm(100),
        height: mm(8),
        rule: HeightRule.AUTO,
        wrap: FrameWrap.AROUND,
        space: { horizontal: 0, vertical: mm(4) }
      },
      // A "linha de assinatura" é a borda superior do próprio parágrafo.
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } },
      alignment: AlignmentType.CENTER,
      spacing: { line: ENTRELINHA, before: 60, after: 0 },
      children: runsDeTexto(empresa.textoAssinatura || empresa.razaoSocial)
    })
  ]
}

// ------------------------------------------------------------------ Público

/**
 * Monta o documento Word do orçamento.
 * `imagens` mapeia id do anexo -> data URL da imagem em tamanho cheio
 * (o main lê os BLOBs do banco; a prévia/teste podem passar um mapa vazio).
 */
export function montarDocumentoDocx(
  orc: Orcamento,
  empresa: EmpresaConfig,
  imagens: Map<string, string> = new Map()
): Document {
  const total = orc.itensServico.reduce((s, i) => s + (i.valorTotal || 0), 0)
  const cidade = extrairCidade(empresa.endereco)

  const corpo: (Paragraph | Table)[] = [cabecalho(empresa)]

  corpo.push(
    p(`${cidade}, ${formatDataExtenso(orc.data)}`, {
      spacing: { line: ENTRELINHA, before: mm(12), after: 0 }
    })
  )
  if (orc.destinatario) {
    corpo.push(p(destinatarioNoDocumento(orc.destinatario), { spacing: { line: ENTRELINHA, after: mm(6) } }))
  }

  corpo.push(
    p(
      orc.titulo || 'Proposta de Serviço',
      { alignment: AlignmentType.CENTER, spacing: { line: ENTRELINHA, before: mm(4), after: mm(8) } },
      { bold: true, size: 32 }
    )
  )

  if (orc.introducao) {
    corpo.push(
      p(orc.introducao, { alignment: AlignmentType.BOTH, spacing: { line: ENTRELINHA, after: mm(4) } })
    )
  }

  if (orc.formato === 'tabela') {
    corpo.push(servicosTabela(orc))
    corpo.push(new Paragraph({ spacing: { after: mm(4) }, children: [] }))
  } else {
    corpo.push(...servicosCarta(orc))
  }

  corpo.push(
    new Paragraph({
      spacing: { line: ENTRELINHA, before: mm(5), after: mm(5) },
      children: [
        new TextRun({ text: 'Valor total da proposta: ', bold: true }),
        new TextRun({
          text: `${formatMoeda(total)} (${valorPorExtenso(total)}).`,
          shading: { fill: AMARELO }
        })
      ]
    })
  )

  if (orc.prazoDias) {
    corpo.push(
      new Paragraph({
        spacing: { line: ENTRELINHA, after: mm(4) },
        children: [
          new TextRun({ text: 'Estimativa de dias para conclusão do serviço: ' }),
          new TextRun({ text: `${orc.prazoDias} dias`, bold: true }),
          new TextRun({ text: '.' })
        ]
      })
    )
  }

  corpo.push(
    ...blocoLista(
      'Materiais:',
      orc.materiais.map((m) => `${m.quantidade} ${m.unidade} — ${m.especificacao}`)
    )
  )
  corpo.push(...blocoLista('Observações:', orc.observacoes.map((o) => o.texto)))
  corpo.push(...blocoLista('Forma de Pagamento:', orc.pagamentos.map((pg) => pg.texto)))
  // A proposta fecha na assinatura; os anexos vêm depois, em página nova.
  // O frame da assinatura precisa de um parágrafo âncora no fim da proposta.
  corpo.push(new Paragraph({ spacing: { before: mm(12), after: 0 }, children: [] }))
  corpo.push(...assinatura(empresa))
  corpo.push(...secaoAnexos(orc, imagens))

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: FONTE, size: CORPO, color: '000000' },
          paragraph: { spacing: { line: ENTRELINHA, after: 0 } }
        }
      }
    },
    numbering: {
      config: [
        {
          reference: 'marcadores',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 400, hanging: 200 } } }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            // A4 com as mesmas margens do CSS (.pagina { padding: 15mm 14mm }).
            size: { width: mm(210), height: mm(297) },
            margin: { top: mm(15), bottom: mm(15), left: mm(14), right: mm(14) }
          }
        },
        children: corpo
      }
    ]
  })
}

function referenciaAnexoRelatorio(rel: Relatorio, anexo: AnexoRelatorio): string | null {
  if (!anexo.referenciaId || anexo.referenciaTipo === 'solto') return null
  if (anexo.referenciaTipo === 'servico') {
    const idx = rel.itensServico.findIndex((i) => i.id === anexo.referenciaId)
    return idx >= 0 ? `Referente ao Item ${idx + 1} - ${rel.itensServico[idx].descricao}` : null
  }
  const itens = anexo.referenciaTipo === 'adiantamento' ? rel.adiantamentos : rel.reembolsos
  const idx = itens.findIndex((i) => i.id === anexo.referenciaId)
  const rotulo = anexo.referenciaTipo === 'adiantamento' ? 'Adiantamento' : 'Reembolso'
  return idx >= 0 ? `${rotulo} ${idx + 1} - ${itens[idx].descricao}` : null
}

function apendiceRelatorioDocx(
  rel: Relatorio,
  titulo: string,
  anexos: AnexoRelatorio[],
  imagens: Map<string, string>
): Paragraph[] {
  if (!anexos.length) return []
  const blocos: Paragraph[] = [
    new Paragraph({
      children: [new PageBreak(), new TextRun({ text: titulo, bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { line: ENTRELINHA, after: mm(6) }
    })
  ]
  for (const a of anexos) blocos.push(...figuraAnexoDocx(a, referenciaAnexoRelatorio(rel, a), imagens.get(a.id)))
  return blocos
}

/** Monta o relatório com o mesmo sistema visual da proposta e resumo financeiro próprio. */
export function montarDocumentoRelatorioDocx(
  rel: Relatorio,
  empresa: EmpresaConfig,
  imagens: Map<string, string> = new Map()
): Document {
  const cidade = extrairCidade(empresa.endereco)
  const base: Orcamento = {
    id: rel.id, numero: rel.numero, data: rel.data, clienteId: rel.clienteId,
    destinatario: rel.destinatario, formato: rel.formato, titulo: rel.titulo,
    introducao: rel.introducao, itensServico: rel.itensServico, materiais: [],
    observacoes: rel.observacoes, pagamentos: rel.pagamentos, anexos: [], prazoDias: null,
    observacaoInterna: '', valorTotal: rel.totais.servicos, status: 'rascunho',
    criadoEm: rel.criadoEm, atualizadoEm: rel.atualizadoEm
  }
  const corpo: (Paragraph | Table)[] = [cabecalho(empresa)]
  corpo.push(p(`${cidade}, ${formatDataExtenso(rel.data)}`, { spacing: { line: ENTRELINHA, before: mm(12), after: 0 } }))
  if (rel.destinatario) corpo.push(p(destinatarioNoDocumento(rel.destinatario), { spacing: { line: ENTRELINHA, after: mm(6) } }))
  corpo.push(p(rel.titulo || 'Relatório de Serviço', { alignment: AlignmentType.CENTER, spacing: { before: mm(4), after: mm(8) } }, { bold: true, size: 32 }))
  if (rel.introducao) corpo.push(p(rel.introducao, { alignment: AlignmentType.BOTH, spacing: { after: mm(4) } }))
  if (rel.formato === 'tabela') {
    corpo.push(servicosTabela(base))
    corpo.push(new Paragraph({ spacing: { after: mm(4) }, children: [] }))
  } else corpo.push(...servicosCarta(base))
  corpo.push(new Paragraph({
    spacing: { line: ENTRELINHA, before: mm(5), after: mm(3) },
    children: [new TextRun({ text: 'Valor total dos serviços: ', bold: true }), new TextRun({ text: formatMoeda(rel.totais.servicos) })]
  }))
  corpo.push(...blocoLista('Adiantamentos:', rel.adiantamentos.map((i) => `- ${formatMoeda(i.valor)}${i.descricao ? ` - ${i.descricao}` : ''}`)))
  corpo.push(...blocoLista('Reembolsos:', rel.reembolsos.map((i) => `+ ${formatMoeda(i.valor)}${i.descricao ? ` - ${i.descricao}` : ''}`)))
  corpo.push(new Paragraph({
    spacing: { line: ENTRELINHA, before: mm(5), after: mm(5) },
    children: [
      new TextRun({ text: `Valor a ${rel.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}: `, bold: true }),
      new TextRun({ text: `${formatMoeda(rel.totais.valorFinal)} (${valorPorExtenso(rel.totais.valorFinal)}).`, shading: { fill: AMARELO } })
    ]
  }))
  corpo.push(...blocoLista('Observações:', rel.observacoes.map((i) => i.texto)))
  corpo.push(...blocoLista('Forma de Pagamento:', rel.pagamentos.map((i) => i.texto)))
  corpo.push(new Paragraph({ spacing: { before: mm(12), after: 0 }, children: [] }))
  corpo.push(...assinatura(empresa))
  corpo.push(...apendiceRelatorioDocx(rel, 'Fotos dos serviços', rel.anexos.filter((a) => a.referenciaTipo === 'servico' || a.referenciaTipo === 'solto'), imagens))
  corpo.push(...apendiceRelatorioDocx(rel, 'Comprovantes de adiantamentos', rel.anexos.filter((a) => a.referenciaTipo === 'adiantamento'), imagens))
  corpo.push(...apendiceRelatorioDocx(rel, 'Comprovantes de reembolsos', rel.anexos.filter((a) => a.referenciaTipo === 'reembolso'), imagens))
  return new Document({
    styles: { default: { document: { run: { font: FONTE, size: CORPO, color: '000000' }, paragraph: { spacing: { line: ENTRELINHA, after: 0 } } } } },
    numbering: { config: [{ reference: 'marcadores', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 200 } } } }] }] },
    sections: [{ properties: { page: { size: { width: mm(210), height: mm(297) }, margin: { top: mm(15), bottom: mm(15), left: mm(14), right: mm(14) } } }, children: corpo }]
  })
}
