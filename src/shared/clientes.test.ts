import { expect, it } from 'vitest'
import { documentoValido, linhasCliente, validarCliente } from './clientes'
it('exige somente nome e aceita documento opcional mesmo sem tipo informado', () => {
  const c = { id: '', nome: 'Cliente sem documento', tratamento: '', ativo: true, criadoEm: '' }
  expect(() => validarCliente(c)).not.toThrow()
  expect(() => validarCliente({ ...c, nome: '' })).toThrow('nome')
  expect(() => validarCliente({ ...c, documento: '529.982.247-25' })).not.toThrow()
  expect(() => validarCliente({ ...c, documento: '123' })).toThrow('inválido')
})
it('aceita CPF e CNPJ numérico e alfanumérico com dígitos válidos', () => {
  expect(documentoValido('529.982.247-25', 'pf')).toBe(true)
  expect(documentoValido('04.871.989/0001-60', 'pj')).toBe(true)
  expect(documentoValido('00.000.000/E08G-12', 'pj')).toBe(true)
  expect(documentoValido('529.982.247-26', 'pf')).toBe(false)
  expect(documentoValido('00.000.000/E08G-13', 'pj')).toBe(false)
})
it('exibe só os campos escolhidos', () => {
  expect(
    linhasCliente({
      clienteSnapshot: {
        id: 'c',
        nome: 'João',
        tipoPessoa: 'pf',
        documento: '52998224725',
        email: 'a@b.com',
        tratamento: '',
        ativo: true,
        criadoEm: ''
      },
      camposCliente: ['email']
    })
  ).toEqual(['E-mail: a@b.com'])
})
