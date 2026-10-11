import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  PageOrientation,
  SectionType,
  VerticalAlign,
  LineRuleType,
  convertMillimetersToTwip as mm,
  type IParagraphOptions
} from 'docx'
import type { EmpresaConfig, Recibo } from '../types'
import { modeloRecibo, PAPEL_RECIBO, type PaginacaoRecibo } from './recibo'

function dimensoesLogo(bytes: Buffer, png: boolean): { w: number; h: number } {
  if (png && bytes.length >= 24) return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) }
  // JPEG: lê o quadro de dimensões sem presumir que a logo seja quadrada.
  let pos = 2
  while (pos + 4 < bytes.length && bytes[pos] === 0xff) {
    while (bytes[pos] === 0xff) pos++
    const marcador = bytes[pos++]
    if (marcador === 0xda || marcador === 0xd9) break
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) continue
    const tamanho = bytes.readUInt16BE(pos)
    if (tamanho < 2 || pos + tamanho > bytes.length) break
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marcador
      ) &&
      tamanho >= 7
    )
      return { w: bytes.readUInt16BE(pos + 5), h: bytes.readUInt16BE(pos + 3) }
    pos += tamanho
  }
  return { w: 64, h: 64 }
}

export function montarReciboDocx(
  r: Recibo,
  empresa: EmpresaConfig,
  paginacao?: PaginacaoRecibo
): Document {
  const m = modeloRecibo(r, empresa)
  const cor = m.cor.slice(1)
  const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
  const p = (
    texto: string,
    opcoes: IParagraphOptions = {},
    run: { bold?: boolean; size?: number; color?: string } = {}
  ) =>
    new Paragraph({
      spacing: { line: 240, after: mm(1.5) },
      children: [new TextRun({ text: texto, ...run })],
      ...opcoes
    })
  const cell = (
    children: Paragraph[],
    width: number,
    fundo?: string,
    borda?: 'cabecalho' | 'valor'
  ) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      width: { size: mm(width), type: WidthType.DXA },
      margins: {
        top: mm(fundo ? 1 : 0),
        bottom: mm(borda === 'cabecalho' ? 2.5 : fundo ? 2 : 0),
        left: 0,
        right: mm(fundo ? 0 : 2)
      },
      borders: {
        top: semBorda,
        bottom:
          borda === 'cabecalho'
            ? { style: BorderStyle.SINGLE, color: cor, size: 10 }
            : fundo
              ? { style: BorderStyle.SINGLE, color: 'CCCCCC', size: 4 }
              : semBorda,
        left: semBorda,
        right: semBorda
      },
      ...(fundo ? { shading: { fill: fundo } } : {}),
      children
    })
  const logo = m.empresa.logoDataUrl?.match(/^data:image\/(png|jpe?g);base64,(.*)$/i)
  const colunas: TableCell[] = []
  if (logo) {
    const bytes = Buffer.from(logo[2], 'base64')
    const png = logo[1].toLowerCase() === 'png'
    const { w, h } = dimensoesLogo(bytes, png)
    const escala = 64 / Math.max(w, h, 1)
    colunas.push(
      cell(
        [
          new Paragraph({
            children: [
              new ImageRun({
                type: png ? 'png' : 'jpg',
                data: bytes,
                transformation: {
                  width: Math.max(1, Math.round(w * escala)),
                  height: Math.max(1, Math.round(h * escala))
                }
              })
            ]
          })
        ],
        22,
        undefined,
        'cabecalho'
      )
    )
  }
  colunas.push(
    cell(
      [
        p(
          m.nomeEmpresa,
          { alignment: AlignmentType.CENTER, spacing: { line: 240, after: mm(1) } },
          { bold: true, size: 22, color: cor }
        ),
        ...m.dadosEmpresa.map((l) =>
          p(
            l,
            {
              alignment: AlignmentType.CENTER,
              spacing: { line: 213, lineRule: LineRuleType.EXACT, after: 0 }
            },
            { size: 17 }
          )
        )
      ],
      logo ? 138 : 160,
      undefined,
      'cabecalho'
    )
  )
  colunas.push(
    cell(
      [
        p('Número', { alignment: AlignmentType.RIGHT, spacing: { after: 0 } }, { size: 17 }),
        p(
          m.numero,
          { alignment: AlignmentType.RIGHT, spacing: { after: mm(1) } },
          { bold: true, size: 22 }
        ),
        p(m.data, { alignment: AlignmentType.RIGHT, spacing: { after: 0 } }, { size: 17 })
      ],
      26,
      undefined,
      'cabecalho'
    )
  )
  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: semBorda,
      bottom: { style: BorderStyle.SINGLE, color: cor, size: 10 },
      left: semBorda,
      right: semBorda,
      insideHorizontal: semBorda,
      insideVertical: semBorda
    },
    rows: [new TableRow({ children: colunas })]
  })
  const header = new Header({
    children: [
      cabecalho,
      p(
        m.titulo,
        { alignment: AlignmentType.CENTER, spacing: { before: mm(2), after: mm(2) } },
        { bold: true, size: 32, color: cor }
      )
    ]
  })
  const larguraUtil = PAPEL_RECIBO.largura - 2 * PAPEL_RECIBO.margemHorizontal
  const destaque = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: semBorda,
      bottom: semBorda,
      right: semBorda,
      left: semBorda,
      insideHorizontal: semBorda,
      insideVertical: semBorda
    },
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                spacing: { after: mm(1) },
                children: [
                  new TextRun({ text: `${m.rotuloValor}   `, size: 17, color: '555555' }),
                  new TextRun({
                    text: m.valor,
                    bold: true,
                    size: 32,
                    color: cor,
                    shading: { fill: 'FFF275' }
                  })
                ]
              }),
              p(m.valorExtenso, { spacing: { after: 0 } }, { size: 17, color: '555555' })
            ],
            larguraUtil - 48,
            'FFFFFF',
            'valor'
          ),
          cell(
            [
              p(
                m.estado,
                { alignment: AlignmentType.RIGHT, spacing: { after: 0 } },
                { bold: true, size: 16, color: cor }
              )
            ],
            48,
            'FFFFFF'
          )
        ]
      })
    ]
  })
  const cliente = [
    p(
      m.rotuloCliente,
      { keepNext: true, spacing: { before: mm(2.5), after: 0 } },
      { size: 17, color: '555555' }
    ),
    p(
      m.cliente,
      { keepNext: true, spacing: { after: m.dadosCliente.length ? mm(1) : mm(2.5) } },
      { bold: true, size: 22 }
    ),
    ...(m.dadosCliente.length
      ? [p(m.dadosCliente.join(' · '), { spacing: { after: mm(2.5) } }, { size: 18 })]
      : [])
  ]
  const linhasTexto = (linhas: string[], size: number): TextRun[] =>
    linhas.map((text, i) => new TextRun({ text, size, break: i ? 1 : 0, scale: 99 }))
  const servico = (texto: string, linhas = texto.split('\n')): Paragraph[] => [
    p(
      'Serviço prestado',
      { keepNext: true, spacing: { line: 230, lineRule: LineRuleType.EXACT, after: 0 } },
      { size: 17, bold: true, color: '555555' }
    ),
    new Paragraph({
      children: linhasTexto(linhas, 21),
      widowControl: false,
      spacing: { line: 284, lineRule: LineRuleType.EXACT, after: mm(2.5) }
    })
  ]
  const fechamento = [
    p(
      m.declaracao,
      {
        keepNext: true,
        border: { top: { style: BorderStyle.SINGLE, color: 'CCCCCC', size: 4, space: 6 } },
        spacing: { before: mm(2), after: mm(2) }
      },
      { size: 18 }
    ),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: semBorda,
        bottom: semBorda,
        left: semBorda,
        right: semBorda,
        insideHorizontal: semBorda,
        insideVertical: semBorda
      },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            [m.rotuloData, m.data, larguraUtil / 3.3],
            [
              r.status === 'recebido' ? 'Forma de pagamento' : 'Forma de pagamento prevista',
              m.formaPagamento,
              larguraUtil / 3.3
            ],
            [m.local ? 'Local' : '', m.local, (larguraUtil * 1.3) / 3.3]
          ].map(([label, value, width]) =>
            cell(
              [
                p(
                  String(label),
                  { keepNext: true, spacing: { after: 0 } },
                  { size: 17, color: '555555' }
                ),
                p(String(value), { keepNext: true, spacing: { after: 0 } }, { size: 18 })
              ],
              Number(width)
            )
          )
        })
      ]
    }),
    p(
      m.assinatura,
      {
        alignment: AlignmentType.CENTER,
        keepNext: true,
        indent: { left: mm(larguraUtil * 0.2), right: mm(larguraUtil * 0.2) },
        border: { top: { style: BorderStyle.SINGLE, color: '555555', size: 4, space: 4 } },
        spacing: { before: mm(18), after: mm(1) }
      },
      { size: 17 }
    ),
    p(
      m.rotuloAssinatura,
      { alignment: AlignmentType.CENTER, spacing: { after: 0 } },
      { size: 16, color: '555555' }
    )
  ]
  const linhasCabecalho =
    1 + m.dadosEmpresa.reduce((s, l) => s + Math.max(1, Math.ceil(l.length / (logo ? 65 : 78))), 0)
  // O corpo começa na posição medida no HTML, usado também pela prévia e pelo PDF.
  const topo =
    paginacao?.topoCorpoMm ??
    Math.max(33, PAPEL_RECIBO.margemVertical + linhasCabecalho * 3.6 + 11.5)
  const paginas = paginacao?.paginas ?? [
    [
      { tipo: 'valor' as const },
      { tipo: 'cliente' as const },
      { tipo: 'servico' as const, texto: m.descricao },
      ...(m.observacao ? [{ tipo: 'observacao' as const, texto: m.observacao }] : []),
      { tipo: 'fechamento' as const }
    ]
  ]
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21, color: '000000' },
          paragraph: { spacing: { line: 240, after: mm(1.5) } }
        }
      }
    },
    sections: paginas.map((blocos) => ({
      headers: { default: header },
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            // A biblioteca recebe a folha em retrato e troca os eixos ao aplicar landscape.
            width: mm(PAPEL_RECIBO.altura),
            height: mm(PAPEL_RECIBO.largura),
            orientation: PageOrientation.LANDSCAPE
          },
          margin: {
            top: mm(topo),
            bottom: mm(PAPEL_RECIBO.margemVertical),
            left: mm(PAPEL_RECIBO.margemHorizontal),
            right: mm(PAPEL_RECIBO.margemHorizontal),
            header: mm(PAPEL_RECIBO.margemVertical),
            footer: mm(4)
          }
        }
      },
      children: blocos.flatMap((bloco): (Paragraph | Table)[] => {
        if (bloco.tipo === 'valor') return [destaque]
        if (bloco.tipo === 'cliente') return cliente
        if (bloco.tipo === 'servico') return servico(bloco.texto, bloco.linhas)
        if (bloco.tipo === 'observacao')
          return [
            new Paragraph({
              children: [
                new TextRun({ text: 'Observação: ', bold: true, size: 18 }),
                ...linhasTexto(bloco.linhas ?? bloco.texto.split('\n'), 18)
              ],
              widowControl: false,
              spacing: { line: 243, lineRule: LineRuleType.EXACT, after: mm(3) }
            })
          ]
        return fechamento
      })
    }))
  })
}
