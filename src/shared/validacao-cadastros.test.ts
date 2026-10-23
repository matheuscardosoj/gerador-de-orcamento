import { describe, expect, it } from 'vitest'
import { validarEmpresaParcial, validarServicoCatalogo } from './validacao-cadastros'

describe('validarEmpresaParcial', () => {
  it('aceita alterações parciais e vazias', () => {
    expect(validarEmpresaParcial({})).toEqual([])
    expect(validarEmpresaParcial({ nome: 'VS', logoDataUrl: null })).toEqual([])
    expect(validarEmpresaParcial({ logoDataUrl: 'data:image/png;base64,AAAA' })).toEqual([])
  })

  it('recusa o que não é objeto e campos de texto com outro tipo', () => {
    expect(validarEmpresaParcial(null)).toHaveLength(1)
    expect(validarEmpresaParcial('texto')).toHaveLength(1)
    expect(validarEmpresaParcial([])).toHaveLength(1)
    expect(validarEmpresaParcial({ nome: 123 }).map((e) => e.campo)).toEqual(['nome'])
    expect(validarEmpresaParcial({ email: {}, site: [] }).map((e) => e.campo)).toEqual([
      'email',
      'site'
    ])
    expect(validarEmpresaParcial({ logoDataUrl: 5 }).map((e) => e.campo)).toEqual(['logoDataUrl'])
  })
})

describe('validarServicoCatalogo', () => {
  const completo = { nome: 'Cerca', descricaoPadrao: '', unidade: 'm', precoReferencia: null }

  it('aceita serviço completo, com ou sem preço de referência', () => {
    expect(validarServicoCatalogo(completo, false)).toEqual([])
    expect(validarServicoCatalogo({ ...completo, precoReferencia: 12.5 }, false)).toEqual([])
    expect(validarServicoCatalogo({ ...completo, precoReferencia: 0 }, false)).toEqual([])
  })

  it('exige os campos na criação, mas não na edição parcial', () => {
    expect(validarServicoCatalogo({ nome: 'Cerca' }, false).length).toBeGreaterThan(0)
    expect(validarServicoCatalogo({ nome: 'Cerca' }, true)).toEqual([])
    expect(validarServicoCatalogo({}, true)).toEqual([])
  })

  it('recusa tipos e preços inválidos', () => {
    expect(validarServicoCatalogo(null, false)).toHaveLength(1)
    expect(validarServicoCatalogo({ ...completo, nome: 5 }, false).map((e) => e.campo)).toEqual([
      'nome'
    ])
    for (const preco of [-1, Number.NaN, '10', Infinity])
      expect(
        validarServicoCatalogo({ ...completo, precoReferencia: preco }, false).map((e) => e.campo)
      ).toEqual(['precoReferencia'])
    expect(validarServicoCatalogo({ precoReferencia: -3 }, true)).toHaveLength(1)
  })
})
