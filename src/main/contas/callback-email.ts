export const REDIRECT_TROCA_EMAIL = 'geradororcamento://auth/email-change'

/** Apenas o retorno de troca de e-mail é aceito; o token nunca é exposto à UI. */
export function lerCallbackEmail(
  valor: string
): { tipo: 'token'; token: string } | { tipo: 'erro' } | null {
  if (!valor.startsWith('geradororcamento://')) return null
  try {
    const url = new URL(valor)
    if (
      url.protocol !== 'geradororcamento:' ||
      url.hostname !== 'auth' ||
      url.pathname !== '/email-change' ||
      url.username ||
      url.password ||
      url.port
    )
      return null
    const parametros = new URLSearchParams(url.hash.slice(1))
    if (parametros.has('error') || url.searchParams.has('error')) return { tipo: 'erro' }
    const token = parametros.get('access_token')
    if (!token || token.length > 8192) return { tipo: 'erro' }
    return { tipo: 'token', token }
  } catch {
    return null
  }
}

export function callbacksNosArgumentos(args: string[]): string[] {
  return args.filter((arg) => lerCallbackEmail(arg) !== null)
}

export function avaliarConfirmacaoEmail(
  usuario: { id?: string; email?: string },
  esperado: { usuario: string; emailPendente: string }
): 'outra-conta' | 'aguardando' | 'concluido' {
  if (usuario.id !== esperado.usuario) return 'outra-conta'
  return usuario.email?.toLowerCase() === esperado.emailPendente.toLowerCase()
    ? 'concluido'
    : 'aguardando'
}
