import { expect, it } from 'vitest'
import { CicloAvisoConexao } from './ciclo-aviso-conexao'

const offline = { conexao: 'inacessivel' as const }
const online = { conexao: 'acessivel' as const }
it('não volta à retomada depois da conclusão, mesmo com novas sincronizações', () => {
  const ciclo = new CicloAvisoConexao()
  expect(ciclo.atualizar(offline)).toBe('indisponivel')
  expect(ciclo.atualizar({ ...online, sincronizando: true })).toBe('retomando')
  expect(ciclo.atualizar(online)).toBe('concluida')
  for (let i = 0; i < 20; i++) {
    expect(ciclo.atualizar({ ...online, sincronizando: true })).toBeNull()
    expect(ciclo.atualizar(online)).toBeNull()
  }
})
it('não recria a retomada dispensada e conclui apenas uma vez', () => {
  const ciclo = new CicloAvisoConexao()
  ciclo.atualizar(offline)
  expect(ciclo.atualizar({ ...online, recuperandoConexao: true })).toBe('retomando')
  // Depois que o usuário fecha o cartão, atualizações não voltam a publicá-lo.
  for (let i = 0; i < 20; i++)
    expect(ciclo.atualizar({ ...online, sincronizando: true })).toBeNull()
  expect(ciclo.atualizar(online)).toBe('concluida')
  expect(ciclo.atualizar(online)).toBeNull()
})
it('permite novo ciclo somente depois de outra indisponibilidade', () => {
  const ciclo = new CicloAvisoConexao()
  expect(ciclo.atualizar({ ...online, sincronizando: true })).toBeNull()
  for (let i = 0; i < 2; i++) {
    expect(ciclo.atualizar(offline)).toBe('indisponivel')
    expect(ciclo.atualizar({ ...online, sincronizando: true })).toBe('retomando')
    expect(ciclo.atualizar(online)).toBe('concluida')
  }
})
it('encerra a recuperação em falha permanente sem anunciar sucesso', () => {
  const ciclo = new CicloAvisoConexao()
  ciclo.atualizar(offline)
  expect(
    ciclo.atualizar({ ...online, falhaSincronizacao: { motivo: 'permissao', temporaria: false } })
  ).toBe('encerrada')
  expect(ciclo.atualizar(online)).toBeNull()
})
