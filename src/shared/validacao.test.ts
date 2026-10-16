import { describe, expect, it } from 'vitest'
import type { Orcamento, ParametrosFinanceiros, Relatorio } from './types'
import {
  normalizarEspacos,
  normalizarOrcamento,
  normalizarRelatorio,
  validarOrcamentoFinal,
  validarParametrosFinanceiros,
  validarRelatorioFinal,
  validarUrlOllamaLocal
} from './validacao'

const parametros: ParametrosFinanceiros = {
  percentualFerias: 11.11,
  percentualDecimoTerceiro: 8.33,
  percentualFgts: 8,
  percentualInss: 20,
  percentualMultaRescisao: 10,
  custoContratacao: 100,
  diasBaseMes: 30,
  aliquotaNotaPadrao: 6,
  margemLucroPadrao: 20,
  consumoVeiculoPadrao: 10,
  precoCombustivelPadrao: 6,
  valorRefeicaoPadrao: 30,
  modoImpostoPadrao: 'gross_up'
}

const orcamento = (): Orcamento => ({
  id: 'o1',
  numero: 1,
  data: '2026-08-29',
  clienteId: null,
  destinatario: 'Cliente',
  formato: 'tabela',
  titulo: 'Proposta',
  introducao: '',
  itensServico: [
    {
      id: 's1',
      descricao: 'Serviço',
      unidade: 'un',
      quantidade: 1,
      valorUnitario: 100,
      valorTotal: 100
    }
  ],
  materiais: [],
  observacoes: [],
  pagamentos: [],
  anexos: [],
  prazoDias: null,
  observacaoInterna: '',
  valorTotal: 100,
  status: 'rascunho',
  criadoEm: '',
  atualizadoEm: ''
})

const relatorio = (): Relatorio => ({
  ...orcamento(),
  titulo: 'Relatório',
  adiantamentos: [],
  reembolsos: [],
  anexos: [],
  status: 'rascunho',
  origemOrcamento: null,
  totais: {
    servicos: 100,
    adiantamentos: 0,
    reembolsos: 0,
    saldo: 100,
    valorFinal: 100,
    tipoSaldo: 'receber'
  }
})

describe('validação compartilhada', () => {
  it('permite rascunho incompleto, mas aponta tudo que impede a saída final', () => {
    const incompleto = { ...orcamento(), destinatario: ' ', data: '', titulo: '', itensServico: [] }
    expect(validarOrcamentoFinal(incompleto).map((erro) => erro.campo)).toEqual([
      'destinatario',
      'data',
      'titulo',
      'itensServico'
    ])
  })

  it('rejeita materiais e lançamentos parcialmente preenchidos', () => {
    const o = orcamento()
    o.materiais.push({ id: 'm1', quantidade: 1, unidade: '', especificacao: 'Tela' })
    expect(validarOrcamentoFinal(o).some((erro) => erro.campo === 'materiais.0.unidade')).toBe(true)
    const r = relatorio()
    r.adiantamentos.push({ id: 'a1', descricao: '', valor: 50 })
    expect(
      validarRelatorioFinal(r).some((erro) => erro.campo === 'adiantamentos.0.descricao')
    ).toBe(true)
  })

  it('aplica limites financeiros e impede gross-up de 100%', () => {
    const invalidos = {
      ...parametros,
      percentualFgts: 101,
      diasBaseMes: 0,
      aliquotaNotaPadrao: 100
    }
    expect(validarParametrosFinanceiros(invalidos).map((erro) => erro.campo)).toEqual(
      expect.arrayContaining(['percentualFgts', 'diasBaseMes', 'aliquotaNotaPadrao'])
    )
  })

  it('aceita lucro acima de 100%, mas não aceita percentual negativo', () => {
    expect(validarParametrosFinanceiros({ ...parametros, margemLucroPadrao: 250 })).toEqual([])
    expect(
      validarParametrosFinanceiros({ ...parametros, margemLucroPadrao: -1 }).some(
        (erro) => erro.campo === 'margemLucroPadrao'
      )
    ).toBe(true)
  })

  it('normaliza espaços sem destruir quebras intencionais', () => {
    expect(normalizarEspacos('  VS   Prestadora ')).toBe('VS Prestadora')
    const normalizado = normalizarOrcamento({
      ...orcamento(),
      destinatario: '  VS   Prestadora ',
      introducao: 'Linha 1  \n Linha 2'
    })
    expect(normalizado.destinatario).toBe('VS Prestadora')
    expect(normalizado.introducao).toBe('Linha 1\nLinha 2')
  })

  it('aceita e persiste a parte civil de datas ISO legadas', () => {
    const dataLegada = '2026-05-04T12:00:00.000Z'
    const orcamentoLegado = normalizarOrcamento({ ...orcamento(), data: dataLegada })
    const relatorioLegado = normalizarRelatorio({ ...relatorio(), data: dataLegada })

    expect(orcamentoLegado.data).toBe('2026-05-04')
    expect(relatorioLegado.data).toBe('2026-05-04')
    expect(validarOrcamentoFinal({ ...orcamento(), data: dataLegada })).toEqual([])
    expect(validarRelatorioFinal({ ...relatorio(), data: dataLegada })).toEqual([])
  })

  it('aceita apenas URL loopback para o Ollama', () => {
    expect(validarUrlOllamaLocal('http://127.0.0.1:11434')).toEqual([])
    expect(validarUrlOllamaLocal('http://localhost:11434')).toEqual([])
    expect(validarUrlOllamaLocal('https://servidor.externo.example')).toHaveLength(1)
    expect(validarUrlOllamaLocal('http://192.168.0.10:11434')).toHaveLength(1)
  })
})
