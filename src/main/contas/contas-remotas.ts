// Validação da lista de empresas devolvida pelo serviço.
import type { EmpresaConta } from '../../shared/conta'

export type ContasRemotas = {
  operador: boolean
  empresas: Array<EmpresaConta & { usuarioNome: string }>
}

export function normalizarContas(valor: unknown): ContasRemotas {
  if (!valor || typeof valor !== 'object')
    throw new Error('A resposta de empresas não é válida. Entre novamente.')
  const bruto = valor as { operador?: unknown; empresas?: unknown }
  if (!Array.isArray(bruto.empresas))
    throw new Error('A resposta de empresas não é válida. Entre novamente.')
  const ids = new Set<string>()
  const empresas = bruto.empresas.map((item) => {
    const empresa = item as Partial<EmpresaConta & { usuarioNome: string }>
    const id = typeof empresa.id === 'string' ? empresa.id.trim() : ''
    const nome = typeof empresa.nome === 'string' ? empresa.nome.trim() : ''
    const papel = empresa.papel
    const usuarioNome = typeof empresa.usuarioNome === 'string' ? empresa.usuarioNome.trim() : ''
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !nome ||
      nome.length > 120 ||
      (papel !== 'administrador' && papel !== 'membro') ||
      ids.has(id)
    )
      throw new Error(
        'Uma empresa retornou dados inválidos. Atualize o cadastro e entre novamente.'
      )
    ids.add(id)
    return { id, nome, papel, usuarioNome }
  })
  return { operador: bruto.operador === true, empresas }
}
