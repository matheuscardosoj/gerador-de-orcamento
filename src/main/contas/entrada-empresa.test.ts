import { expect, it } from 'vitest'
import { destinoAposLogin } from './entrada-empresa'

const empresa = { id: 'empresa-1', nome: 'VS', papel: 'administrador' as const }

it('reserva a seleção manual para o operador, mesmo com uma única empresa', () => {
  expect(destinoAposLogin(true, [empresa])).toEqual({ tipo: 'selecionar' })
})

it('abre diretamente a única empresa de um usuário comum', () => {
  expect(destinoAposLogin(false, [empresa])).toEqual({ tipo: 'abrir', empresaId: empresa.id })
})

it('não escolhe uma empresa arbitrária quando o vínculo comum está inconsistente', () => {
  expect(() => destinoAposLogin(false, [])).toThrow('não está vinculada')
  expect(() => destinoAposLogin(false, [empresa, { ...empresa, id: 'empresa-2' }])).toThrow(
    'mais de uma empresa'
  )
})
