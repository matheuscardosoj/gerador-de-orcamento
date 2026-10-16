import { expect, it } from 'vitest'
import { motivoIndisponibilidade } from './acesso-empresa'

it('exige confirmação estruturada antes de tratar uma empresa como excluída', () => {
  expect(motivoIndisponibilidade({ codigo: 'GDE01' })).toBe('empresaExcluida')
  expect(motivoIndisponibilidade({ codigo: 'GDA01' })).toBe('acessoRemovido')
  expect(motivoIndisponibilidade({ status: 401 })).toBe('sessaoExpirada')
  for (const erro of [
    { status: 403 },
    { status: 500 },
    new Error('EMPRESA_EXCLUIDA'),
    new Error('timeout')
  ])
    expect(motivoIndisponibilidade(erro)).toBeNull()
})
