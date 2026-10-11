import { expect, it } from 'vitest'
import { Packer } from 'docx'
import { inflateRawSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { modeloRecibo, PAPEL_RECIBO, resumoServicoRecibo } from './recibo'
import { gerarHtmlRecibo } from './recibo-template'
import { montarReciboDocx } from './recibo-docx'
import type { EmpresaConfig, Recibo } from '../types'

const empresa: EmpresaConfig = {
  nome: 'Empresa original',
  razaoSocial: 'Empresa de Serviços Ltda.',
  endereco: 'Rua Exemplo, 10, Rio Verde - GO',
  cnpj: '',
  email: '',
  telefones: '',
  site: '',
  logoDataUrl: null,
  textoAssinatura: 'Empresa de Serviços Ltda.',
  corFaixaRodape: '#0f6d6b',
  nomeExibicao: 'nome'
}
const recibo: Recibo = {
  id: 'recibo',
  numero: 12,
  data: '2026-10-11',
  destinatario: 'Cliente somente nome',
  descricao: 'Corte de árvore.',
  valor: 200,
  local: 'Rio Verde - GO',
  formaPagamento: 'Pix',
  status: 'pendente',
  quitacao: 'parcial',
  observacao: '',
  criadoEm: '',
  atualizadoEm: ''
}
function zipEntry(buffer: Buffer, alvo: string): string {
  let pos = 0
  while ((pos = buffer.indexOf('PK\x03\x04', pos, 'latin1')) >= 0) {
    const metodo = buffer.readUInt16LE(pos + 8),
      tamanho = buffer.readUInt32LE(pos + 18)
    const nomeTam = buffer.readUInt16LE(pos + 26),
      extraTam = buffer.readUInt16LE(pos + 28)
    const nome = buffer.subarray(pos + 30, pos + 30 + nomeTam).toString()
    const inicio = pos + 30 + nomeTam + extraTam
    if (nome === alvo) {
      const bytes = buffer.subarray(inicio, inicio + tamanho)
      return (metodo === 8 ? inflateRawSync(bytes) : bytes).toString('utf8')
    }
    pos = inicio + tamanho
  }
  throw new Error(`Entrada ausente: ${alvo}`)
}
it('gera uma cobrança A5 horizontal sem declarar quitação ou exigir CPF/CNPJ', () => {
  const html = gerarHtmlRecibo(recibo, empresa)
  expect(PAPEL_RECIBO).toMatchObject({ largura: 210, altura: 148 })
  expect(html).toContain('@page { size: 210mm 148mm;')
  expect(html).toContain('Cobrança de serviço')
  expect(html).toContain('não comprova quitação')
  expect(html).toContain('Cliente somente nome')
  expect(html).not.toContain('CNPJ:')
  expect(html).not.toContain('Valor total da proposta')
  expect(html).not.toContain(empresa.corFaixaRodape)
  expect(html).toContain('background: #fff275')
  expect(html).toContain('margin-top: 18mm')
  expect(html).toContain('padding: 1mm 0 2mm')
})
it('distingue quitação parcial, total e documento cancelado sem modificar recebimentos', () => {
  expect(modeloRecibo({ ...recibo, status: 'recebido' }, empresa).declaracao).toContain(
    'pagamento parcial'
  )
  expect(
    modeloRecibo({ ...recibo, status: 'recebido', quitacao: 'total' }, empresa).declaracao
  ).toContain('quitação total')
  expect(modeloRecibo({ ...recibo, status: 'cancelado' }, empresa).declaracao).toContain(
    'Não comprova quitação'
  )
  expect(recibo.status).toBe('pendente')
})
it('preserva a empresa da versão e escapa conteúdo digitado', () => {
  const html = gerarHtmlRecibo(
    { ...recibo, empresaSnapshot: empresa, descricao: '<script>alert(1)</script>' },
    { ...empresa, nome: 'Cadastro alterado' }
  )
  expect(html).toContain('Empresa original')
  expect(html).not.toContain('Cadastro alterado')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
})
it('gera DOCX em A5 horizontal com o mesmo conteúdo e fechamento unido à assinatura', async () => {
  const bytes = Buffer.from(
    await Packer.toBuffer(montarReciboDocx({ ...recibo, status: 'recebido' }, empresa))
  )
  const xml = zipEntry(bytes, 'word/document.xml')
  expect(xml).toMatch(/w:pgSz[^>]*w:w="11905"[^>]*w:h="8390"[^>]*w:orient="landscape"/)
  expect(xml).toContain('Cliente somente nome')
  expect(xml).toContain('pagamento parcial')
  expect(xml).toContain('Assinatura do prestador / recebedor')
  expect(xml).toContain('w:keepNext')
  expect(xml).toContain('w:before="1020"')
  expect(xml).not.toContain('w:br w:type="page"')
  expect(xml).toContain('w:fill="FFF275"')
  expect(xml).not.toContain('0f6d6b')
  expect(xml).not.toContain('F0F7F6')
  expect(zipEntry(bytes, 'word/header1.xml')).toContain('Recibo de pagamento')
})
it('começa com um resumo editável quando houver muitos serviços no documento de origem', () => {
  const item = {
    id: 'a',
    descricao: 'Corte de árvore',
    unidade: 'serviço',
    quantidade: 1,
    valorUnitario: 200,
    valorTotal: 200
  }
  expect(
    resumoServicoRecibo([item, { ...item, id: 'b', descricao: 'Limpeza' }], 12, 'relatorio')
  ).toBe('Corte de árvore e outro serviço, conforme relatório Nº 000012.')
})

it('respeita no Word as divisões de conteúdo calculadas para o PDF', async () => {
  const bytes = Buffer.from(
    await Packer.toBuffer(
      montarReciboDocx(recibo, empresa, {
        topoCorpoMm: 33,
        paginas: [
          [{ tipo: 'valor' }, { tipo: 'cliente' }, { tipo: 'servico', texto: 'Primeira parte.' }],
          [{ tipo: 'servico', texto: 'Segunda parte.' }, { tipo: 'fechamento' }]
        ]
      })
    )
  )
  const xml = zipEntry(bytes, 'word/document.xml')
  expect(xml.match(/<w:sectPr>/g)).toHaveLength(2)
  expect(xml).toContain('Primeira parte.')
  expect(xml).toContain('Segunda parte.')
  expect(xml.match(/Assinatura do prestador/g)).toHaveLength(1)
})

it('inclui a logo da empresa preservada na versão e mantém a proporção do JPEG', async () => {
  const jpeg = await sharp(readFileSync('build/logo-vs.png'))
    .resize(420, 120, { fit: 'contain', background: '#fff' })
    .flatten({ background: '#fff' })
    .jpeg()
    .toBuffer()
  const original = { ...empresa, logoDataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` }
  const documento = { ...recibo, empresaSnapshot: original }
  expect(gerarHtmlRecibo(documento, empresa)).toContain('alt="Logo da empresa"')
  const bytes = Buffer.from(await Packer.toBuffer(montarReciboDocx(documento, empresa)))
  const cabecalho = zipEntry(bytes, 'word/header1.xml')
  expect(cabecalho).toContain('wp:extent cx="609600" cy="171450"')
  expect(cabecalho).toContain('a:blip r:embed=')
})
