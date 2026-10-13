import { beforeEach, expect, it } from 'vitest'
import { definirAcesso, exigirAcesso, iniciarOperacao, aguardarOperacoes } from './acesso'

beforeEach(() => definirAcesso(false))
it('bloqueia leitura e escrita dos dados antes de autenticar', () => {
  for (const canal of ['clientes.list', 'orcamentos.get', 'recibos.confirmar', 'dados.exportar'])
    expect(() => exigirAcesso(canal)).toThrow('Entre na sua conta')
  expect(() => exigirAcesso('aplicativo.versao')).not.toThrow()
})
it('permite trabalho comercial e restringe configurações administrativas', () => {
  definirAcesso(true, 'membro')
  expect(() => exigirAcesso('orcamentos.create')).not.toThrow()
  expect(() => exigirAcesso('cadastros.reordenar', ['servicos'])).not.toThrow()
  expect(() => exigirAcesso('cadastros.reordenar', ['observacoes'])).toThrow('administrador')
  expect(() => exigirAcesso('cadastros.reordenar', ['pagamentos'])).toThrow('administrador')
  for (const canal of [
    'empresa.save',
    'parametros.save',
    'dados.importar',
    'recibos.definirProximoNumero',
    'colaboracao.ativarMembro'
  ])
    expect(() => exigirAcesso(canal)).toThrow('administrador')
  definirAcesso(true, 'administrador')
  expect(() => exigirAcesso('empresa.save')).not.toThrow()
})
it('aguarda todas as operações antes de permitir troca da base', async () => {
  const a = iniciarOperacao(),
    b = iniciarOperacao()
  let concluido = false
  const espera = aguardarOperacoes().then(() => {
    concluido = true
  })
  a()
  a()
  await Promise.resolve()
  expect(concluido).toBe(false)
  b()
  await espera
  expect(concluido).toBe(true)
})
