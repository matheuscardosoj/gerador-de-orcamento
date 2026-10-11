import { expect, it } from 'vitest'
import {
  correspondeBusca,
  normalizarPreferencias,
  preferenciasPadrao
} from './historico-preferencias'
import { normalizarTipoCliente } from './clientes'
it('busca todos os termos em campos diferentes, com acentos e espaços', () => {
  expect(
    correspondeBusca('  JOAO   arvore 000017 3.500,00 ', [
      'São João',
      'Corte de árvore',
      '000017',
      'R$ 3.500,00'
    ])
  ).toBe(true)
  expect(correspondeBusca('João roçada', ['São João', 'Corte de árvore'])).toBe(false)
})
it('descarta colunas antigas, inválidas e duplicadas sem perder ordem', () => {
  const p = normalizarPreferencias('orcamento', {
    colunas: ['versao', 'versao', 'data', 'inexistente'],
    campo: 'inexistente',
    direcao: 'qualquer'
  })
  expect(p.colunas).toEqual(['versao', 'data'])
  expect(p.campo).toBe('numero')
  expect(p.direcao).toBe('desc')
  expect(preferenciasPadrao('relatorio').colunas).toContain('origem')
})
it('normaliza tipos sem exigir documento nem alterar classificação existente', () => {
  expect(normalizarTipoCliente({})).toBe('pf')
  expect(normalizarTipoCliente({ tipoPessoa: 'pj' })).toBe('pj')
  expect(normalizarTipoCliente({ documento: '04.871.989/0001-60' })).toBe('pj')
  expect(normalizarTipoCliente({ documento: 'inválido' })).toBe('pf')
})
