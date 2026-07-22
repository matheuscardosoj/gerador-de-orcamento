import { it, expect } from 'vitest'
import { Packer } from 'docx'
import { gunzipSync, inflateRawSync } from 'zlib'
import { montarDocumentoDocx } from './docx'
import type { EmpresaConfig, Orcamento } from '../types'

const empresa: EmpresaConfig = {
  nome: 'VS PRESTADORA DE SERVIÇOS',
  razaoSocial: 'V S DE JESUS',
  endereco: 'Rua do Ipê Roxo, Rio Verde - GO',
  telefones: '(64) 3623-2113',
  email: 'x@y.com',
  site: '',
  cnpj: '04.871.989/0001-60',
  logoDataUrl: null,
  textoAssinatura: 'V S DE JESUS',
  corFaixaRodape: '#0f6d6b',
  nomeExibicao: 'nome'
}

const orc: Orcamento = {
  id: '1',
  numero: 1,
  data: new Date('2026-05-04T12:00:00').toISOString(),
  clienteId: null,
  destinatario: 'A TMG,',
  formato: 'carta',
  titulo: 'Proposta de Serviço',
  introducao: '',
  itensServico: [
    { id: 'a', descricao: 'Cerca', unidade: 'm', quantidade: 100, valorUnitario: 8, valorTotal: 800, calculo: null }
  ],
  materiais: [],
  observacoes: [{ id: 'o', texto: 'Materiais por conta da contratante.' }],
  pagamentos: [{ id: 'p', texto: 'Via Pix.' }],
  anexos: [],
  prazoDias: 10,
  observacaoInterna: '',
  valorTotal: 800,
  status: 'rascunho',
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString()
}

/** Extrai `word/document.xml` do zip do DOCX sem depender de outra biblioteca. */
function lerDocumentXml(buffer: Buffer): string {
  const alvo = Buffer.from('word/document.xml')
  let offset = 0
  while ((offset = buffer.indexOf('PK\x03\x04', offset, 'latin1')) >= 0) {
    const metodo = buffer.readUInt16LE(offset + 8)
    const tamComprimido = buffer.readUInt32LE(offset + 18)
    const tamNome = buffer.readUInt16LE(offset + 26)
    const tamExtra = buffer.readUInt16LE(offset + 28)
    const nome = buffer.subarray(offset + 30, offset + 30 + tamNome)
    const inicio = offset + 30 + tamNome + tamExtra
    if (nome.equals(alvo)) {
      const dados = buffer.subarray(inicio, inicio + tamComprimido)
      if (metodo === 0) return dados.toString('utf-8')
      if (metodo === 8) return inflateRawSync(dados).toString('utf-8')
      return gunzipSync(dados).toString('utf-8')
    }
    offset = inicio + tamComprimido
  }
  throw new Error('word/document.xml não encontrado no DOCX')
}

it('gera um DOCX válido com o conteúdo do orçamento', async () => {
  const buffer = await Packer.toBuffer(montarDocumentoDocx(orc, empresa))
  expect(buffer.length).toBeGreaterThan(2000)
  // Assinatura ZIP (docx é um zip: bytes "PK")
  expect(buffer[0]).toBe(0x50)
  expect(buffer[1]).toBe(0x4b)

  const xml = lerDocumentXml(Buffer.from(buffer))
  expect(xml).toContain('Proposta de Serviço')
  expect(xml).toContain('VS PRESTADORA DE SERVIÇOS')
  expect(xml).toContain('Valor total da proposta')
  expect(xml).toContain('Materiais por conta da contratante.')
  // Realce amarelo do total (perdido na conversão via HTML).
  expect(xml).toContain('FFF275')
  // Assinatura presa ao fim da área útil da página, como no PDF.
  expect(xml).toContain('V S DE JESUS')
  expect(xml).toMatch(/w:framePr[^>]*w:vAnchor="margin"/)
  expect(xml).toMatch(/w:framePr[^>]*w:yAlign="bottom"/)
  // Sem anexos não há quebra de página.
  expect(xml).not.toContain('w:br w:type="page"')
})

it('põe os anexos numa página nova, com a referência ao serviço', async () => {
  // PNG 1×1 transparente.
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const comAnexos: Orcamento = {
    ...orc,
    anexos: [
      {
        id: 'x1',
        itemServicoId: 'a',
        titulo: 'Frente do terreno',
        descricao: 'Vista da divisa antes do serviço.',
        mime: 'image/png',
        largura: 1600,
        altura: 1200,
        imagemDataUrl: png
      }
    ]
  }
  const xml = lerDocumentXml(Buffer.from(await Packer.toBuffer(montarDocumentoDocx(comAnexos, empresa))))
  expect(xml).toContain('w:br w:type="page"')
  expect(xml).toContain('Anexos')
  expect(xml).toContain('Frente do terreno')
  expect(xml).toContain('Referente ao Item 1')
  // A proposta fecha na assinatura e só então vêm os anexos, em página nova.
  expect(xml.indexOf('w:framePr')).toBeGreaterThan(0)
  expect(xml.indexOf('w:framePr')).toBeLessThan(xml.indexOf('w:br w:type="page"'))
})
