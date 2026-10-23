import type { AppApi } from '@shared/api'
import { criarMockApi } from './mockApi'

const emDesenvolvimento = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

/**
 * Acesso tipado à API exposta pelo preload. Fora do Electron (preview no navegador e testes)
 * `window.api` não existe e usamos um mock em memória; no pacote de produção o mock não entra:
 * sem preload não há aplicativo, e falhar alto é melhor que exibir dados de demonstração.
 */
function obterApi(): AppApi {
  if (window.api) return window.api
  if (emDesenvolvimento) return criarMockApi()
  throw new Error('A API do aplicativo não está disponível. Reinstale o aplicativo.')
}

export const api: AppApi = obterApi()

// Exposto apenas em desenvolvimento para depuração no console do navegador.
if (emDesenvolvimento) {
  ;(window as unknown as { __api: AppApi }).__api = api
}
