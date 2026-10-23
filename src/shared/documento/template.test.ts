import { describe, expect, it } from 'vitest'
import { gerarHtmlOrcamento, gerarHtmlRelatorio } from './template'
import { calcularTotaisRelatorio } from '../relatorio'
import type { EmpresaConfig, Orcamento, Relatorio } from '../types'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const ATAQUE = 'data:image/png;base64,AAAA" onerror="alert(1)'

const empresa: EmpresaConfig = {
  nome: 'VS PRESTADORA',
  razaoSocial: 'V S DE JESUS',
  endereco: 'Rio Verde - GO',
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
    {
      id: 'a',
      descricao: 'Cerca',
      unidade: 'm',
      quantidade: 100,
      valorUnitario: 8,
      valorTotal: 800,
      calculo: null
    }
  ],
  materiais: [],
  observacoes: [],
  pagamentos: [],
  anexos: [],
  prazoDias: 10,
  observacaoInterna: '',
  valorTotal: 800,
  status: 'rascunho',
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString()
}

const anexo = (imagemDataUrl: string): Orcamento['anexos'][number] => ({
  id: 'foto',
  itemServicoId: 'a',
  titulo: 'Foto',
  descricao: '',
  mime: 'image/png',
  largura: 10,
  altura: 10,
  imagemDataUrl
})

describe('src de imagens no HTML do documento', () => {
  it('mantém data URLs válidas de imagem', () => {
    const html = gerarHtmlOrcamento(
      { ...orc, anexos: [anexo(PNG)] },
      { ...empresa, logoDataUrl: PNG }
    )
    expect(html).toContain(`<img class="anexo-img" src="${PNG}"`)
    expect(html).toContain(`<img class="logo" src="${PNG}"`)
  })

  it('descarta valores que quebrariam o atributo ou não são imagem', () => {
    const html = gerarHtmlOrcamento(
      { ...orc, anexos: [anexo(ATAQUE), anexo('javascript:alert(1)')] },
      { ...empresa, logoDataUrl: ATAQUE }
    )
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('class="anexo-img"')
    // Sem logo válida, cai no monograma da empresa.
    expect(html).toContain('logo-vazia')
  })
})

describe('textos do usuário na montagem do relatório', () => {
  it('não interpreta $& nem $$ como padrões de substituição', () => {
    const adiantamentos = [{ id: 'ad', descricao: "Sinal $& e $$ e $` e $'", valor: 100 }]
    const rel: Relatorio = {
      ...orc,
      id: 'r',
      numero: 7,
      adiantamentos,
      reembolsos: [],
      anexos: [],
      status: 'emitido',
      origemOrcamento: null,
      totais: calcularTotaisRelatorio(orc.itensServico, adiantamentos, [])
    }
    const html = gerarHtmlRelatorio(rel, empresa)
    expect(html).toContain('Sinal $&amp; e $$ e $` e $&#39;'.replace('&#39;', "'"))
    expect(html).not.toContain('<!--RESUMO_INICIO--><!--RESUMO_INICIO-->')
    expect(html).toContain('<title>Relatório 7</title>')
  })
})
