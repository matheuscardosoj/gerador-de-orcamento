import type { EmpresaConta } from '../../shared/conta'

export type DestinoLogin = { tipo: 'selecionar' } | { tipo: 'abrir'; empresaId: string }

export function destinoAposLogin(
  operador: boolean,
  empresas: readonly EmpresaConta[]
): DestinoLogin {
  if (operador) return { tipo: 'selecionar' }
  if (empresas.length === 1) return { tipo: 'abrir', empresaId: empresas[0].id }
  throw new Error(
    empresas.length === 0
      ? 'Sua conta ainda não está vinculada a uma empresa. Peça um convite ao administrador.'
      : 'Sua conta está vinculada a mais de uma empresa. Peça ao Administrador do Sistema para corrigir os vínculos.'
  )
}
