import { expect, it } from 'vitest'
import { exigeNumeracaoAtualizada } from './bloqueio-numeracao'

it('permite cadastros e rascunhos locais durante atualização de números', () => {
  for (const canal of [
    'clientes.create',
    'clientes.update',
    'servicos.create',
    'observacoes.create',
    'rascunhos.save',
    'empresa.save'
  ])
    expect(exigeNumeracaoAtualizada(canal)).toBe(false)
  for (const canal of ['orcamentos.create', 'relatorios.update', 'recibos.confirmar'])
    expect(exigeNumeracaoAtualizada(canal)).toBe(true)
})
