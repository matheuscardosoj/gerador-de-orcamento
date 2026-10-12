import { expect, it } from 'vitest'
import { errosConfirmacaoRecibo, localPagamentoSugerido } from './validacao-recibo'
import type { Recibo } from './types'
const r: Recibo = {
  id: '',
  numero: 0,
  data: '2026-10-11',
  destinatario: 'Cliente',
  descricao: 'Serviço',
  valor: 25591.4,
  local: 'Rio Verde - GO',
  formaPagamento: 'Pix',
  status: 'rascunho',
  quitacao: 'total',
  observacao: '',
  criadoEm: '',
  atualizadoEm: ''
}
it('não exige relatório para recibos avulsos ou vinculados a propostas', () => {
  expect(errosConfirmacaoRecibo(r)).toEqual({})
  expect(errosConfirmacaoRecibo({ ...r, origemTipo: 'orcamento', origemId: 'proposta' })).toEqual(
    {}
  )
})
it('identifica campos faltantes sem mensagens técnicas e valida datas impossíveis', () => {
  expect(errosConfirmacaoRecibo({ ...r, local: '' })).toEqual({
    local: 'Informe o local do pagamento (cidade e UF).'
  })
  expect(errosConfirmacaoRecibo({ ...r, data: '2026-02-30' })).toHaveProperty('data')
  expect(errosConfirmacaoRecibo({ ...r, data: '' })).toHaveProperty('data')
  expect(errosConfirmacaoRecibo({ ...r, valor: 0 })).toHaveProperty('valor')
})
it('sugere apenas cidade/UF presentes no cadastro, sem inventar local', () => {
  expect(
    localPagamentoSugerido({ endereco: 'Rua Exemplo, 10, Rio Verde - GO, CEP 75900-000' })
  ).toBe('Rio Verde - GO')
  expect(localPagamentoSugerido({ endereco: 'Rua Exemplo, 10' })).toBe('')
  expect(localPagamentoSugerido(null)).toBe('')
})
