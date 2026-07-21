import { it, expect } from 'vitest'
import HTMLtoDOCX from '@turbodocx/html-to-docx'
import { gerarHtmlOrcamento } from './template'
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
  corFaixaRodape: '#0f6d6b'
}

const orc: Orcamento = {
  id: '1',
  numero: '0001/2026',
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
  prazoDias: 10,
  valorTotal: 800,
  status: 'rascunho',
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString()
}

it('gera um DOCX não vazio a partir do template', async () => {
  const html = gerarHtmlOrcamento(orc, empresa)
  const buffer = (await HTMLtoDOCX(html, undefined, { orientation: 'portrait' })) as Buffer
  expect(buffer.length).toBeGreaterThan(2000)
  // Assinatura ZIP (docx é um zip: bytes "PK")
  expect(buffer[0]).toBe(0x50)
  expect(buffer[1]).toBe(0x4b)
})
