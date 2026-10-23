import { describe, expect, it } from 'vitest'
import { REGRAS_DE_ARGUMENTOS, validarArgumentos } from './ipc-validacao'

describe('validação da forma dos argumentos do IPC', () => {
  it('aceita chamadas bem formadas, inclusive com argumentos opcionais ausentes', () => {
    expect(() => validarArgumentos('orcamentos.get', ['abc'])).not.toThrow()
    expect(() => validarArgumentos('orcamentos.update', ['abc', { numero: 3 }])).not.toThrow()
    expect(() => validarArgumentos('recibos.remove', ['abc'])).not.toThrow()
    expect(() => validarArgumentos('recibos.remove', ['abc', true])).not.toThrow()
    expect(() => validarArgumentos('rascunhos.list', [])).not.toThrow()
    expect(() => validarArgumentos('colaboracao.edicao', ['orcamento', 'x'])).not.toThrow()
    expect(() => validarArgumentos('orcamentos.list', [])).not.toThrow()
  })

  it.each([
    ['id que não é texto', 'orcamentos.get', [{ $ne: null }]],
    ['id vazio', 'orcamentos.get', ['']],
    ['id gigante', 'orcamentos.get', ['x'.repeat(201)]],
    ['patch como lista', 'clientes.update', ['abc', []]],
    ['patch nulo', 'clientes.update', ['abc', null]],
    ['número ausente', 'orcamentos.definirProximoNumero', [undefined]],
    ['número como texto', 'orcamentos.alterarNumero', ['abc', '5']],
    ['tipo de documento desconhecido', 'versoes.list', ['contrato', 'abc']],
    ['formato inválido', 'versoes.exportar', ['abc', 'exe']],
    ['modo de importação inválido', 'dados.importar', ['apagar']],
    ['ids de reordenação inválidos', 'cadastros.reordenar', ['servicos', [1, 2]]],
    ['argumento sobrando', 'orcamentos.list', ['extra']]
  ] as const)('rejeita %s', (_nome, canal, args) => {
    expect(() => validarArgumentos(canal, [...args])).toThrow(/inválidos/)
  })

  it('toda regra é uma lista de funções', () => {
    for (const regras of Object.values(REGRAS_DE_ARGUMENTOS))
      expect(regras.every((r) => typeof r === 'function')).toBe(true)
  })
})
