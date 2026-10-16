import { expect, it } from 'vitest'
import { avaliarConfirmacaoEmail, callbacksNosArgumentos, lerCallbackEmail } from './callback-email'

it('aceita somente o callback esperado e não devolve o fragmento para a interface', () => {
  expect(lerCallbackEmail('geradororcamento://auth/email-change#access_token=abc')).toEqual({
    tipo: 'token',
    token: 'abc'
  })
  expect(lerCallbackEmail('geradororcamento://outro/email-change#access_token=abc')).toBeNull()
  expect(lerCallbackEmail('geradororcamento://auth/email-change#error=access_denied')).toEqual({
    tipo: 'erro'
  })
  expect(
    callbacksNosArgumentos([
      'app.exe',
      'https://exemplo.com',
      'geradororcamento://auth/email-change#access_token=abc'
    ])
  ).toHaveLength(1)
})

it('aguarda a confirmação dos dois endereços e rejeita link de outra conta', () => {
  const esperado = { usuario: 'usuario-1', emailPendente: 'novo@teste.invalid' }
  expect(
    avaliarConfirmacaoEmail({ id: 'usuario-1', email: 'antigo@teste.invalid' }, esperado)
  ).toBe('aguardando')
  expect(avaliarConfirmacaoEmail({ id: 'usuario-1', email: 'novo@teste.invalid' }, esperado)).toBe(
    'concluido'
  )
  expect(avaliarConfirmacaoEmail({ id: 'usuario-2', email: 'novo@teste.invalid' }, esperado)).toBe(
    'outra-conta'
  )
})
