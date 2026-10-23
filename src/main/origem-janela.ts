/**
 * Origens que podem navegar na janela principal e chamar o IPC: o `index.html`
 * empacotado do renderer ou, em desenvolvimento, o servidor do Vite.
 */
export function urlDoAplicativo(url: string, urlDesenvolvimento?: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return u.pathname.endsWith('/renderer/index.html')
    return !!urlDesenvolvimento && u.origin === new URL(urlDesenvolvimento).origin
  } catch {
    return false
  }
}
