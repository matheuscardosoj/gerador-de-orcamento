import type { Cliente, DocumentoMetadados } from './types'
export function documentoNormalizado(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
export function documentoValido(valor: string, tipo: 'pf' | 'pj'): boolean {
  const s = documentoNormalizado(valor)
  if (tipo === 'pf') {
    if (!/^\d{11}$/.test(s) || /^(\d)\1+$/.test(s)) return false
    const digito = (n: number): number => {
      const soma = [...s.slice(0, n)].reduce((a, c, i) => a + Number(c) * (n + 1 - i), 0)
      const resto = (soma * 10) % 11
      return resto === 10 ? 0 : resto
    }
    return digito(9) === Number(s[9]) && digito(10) === Number(s[10])
  }
  if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(\d)\1+$/.test(s)) return false
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const digito = (n: number): number => {
    const soma = [...s.slice(0, n)].reduce(
      (a, c, i) => a + (c.charCodeAt(0) - 48) * pesos[13 - n + i],
      0
    )
    return soma % 11 < 2 ? 0 : 11 - (soma % 11)
  }
  return digito(12) === Number(s[12]) && digito(13) === Number(s[13])
}
export function validarCliente(c: Cliente): void {
  if (!c.nome.trim()) throw new Error('Informe o nome ou razão social.')
  if (c.tipoPessoa && !['pf', 'pj'].includes(c.tipoPessoa))
    throw new Error('Tipo de pessoa inválido.')
  if (
    c.documento &&
    !documentoValido(
      c.documento,
      c.tipoPessoa || (documentoNormalizado(c.documento).length === 11 ? 'pf' : 'pj')
    )
  )
    throw new Error('CPF/CNPJ inválido. Confira os caracteres e dígitos verificadores.')
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new Error('E-mail inválido.')
  if (c.telefone && !/^\+?[\d\s().-]{8,24}$/.test(c.telefone)) throw new Error('Telefone inválido.')
  if (
    c.endereco?.uf &&
    !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(
      c.endereco.uf.toUpperCase()
    )
  )
    throw new Error('Informe uma UF válida.')
  if (c.endereco?.cep && !/^\d{5}-?\d{3}$/.test(c.endereco.cep)) throw new Error('CEP inválido.')
}
export function linhasCliente(d: DocumentoMetadados): string[] {
  const c = d.clienteSnapshot
  if (!c) return []
  const campos = d.camposCliente ?? ['documento']
  const e = c.endereco
  const endereco = e
    ? [
        e.logradouro,
        e.numero,
        e.complemento,
        e.bairro,
        [e.cidade, e.uf].filter(Boolean).join(' - '),
        e.cep
      ]
        .filter(Boolean)
        .join(', ')
    : ''
  const dados = {
    documento: c.documento
      ? `${c.tipoPessoa === 'pf' || (!c.tipoPessoa && documentoNormalizado(c.documento).length === 11) ? 'CPF' : 'CNPJ'}: ${c.documento}`
      : '',
    endereco,
    telefone: c.telefone ? `Telefone: ${c.telefone}` : '',
    email: c.email ? `E-mail: ${c.email}` : '',
    pessoaContato: c.pessoaContato ? `Contato: ${c.pessoaContato}` : ''
  }
  return campos.map((f) => dados[f]).filter(Boolean)
}
