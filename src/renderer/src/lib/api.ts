import type { AppApi } from '@shared/api'
import { criarMockApi } from './mockApi'

/**
 * Acesso tipado à API exposta pelo preload. Quando a aplicação roda fora do
 * Electron (preview no navegador durante o desenvolvimento), window.api não
 * existe e usamos um mock em memória.
 */
export const api: AppApi = window.api ?? criarMockApi()

// Exposto apenas em desenvolvimento para depuração no console do navegador.
if (import.meta.env?.DEV) {
  ;(window as unknown as { __api: AppApi }).__api = api
}
