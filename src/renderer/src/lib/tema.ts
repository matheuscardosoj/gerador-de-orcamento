import { useSyncExternalStore } from 'react'
import {
  lerPreferenciaTema,
  resolverTema,
  salvarPreferenciaTema,
  type PreferenciaTema,
  type TemaEfetivo
} from '@shared/tema'
import { api } from './api'

// A preferência fica no localStorage do perfil do aplicativo: é lida de forma síncrona antes
// da primeira renderização (sem piscar o tema errado) e sobrevive ao fechar o app. Por ser uma
// escolha deste computador, não é sincronizada com a nuvem nem com os outros usuários.

const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'

function armazenamento(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

let preferencia: PreferenciaTema = lerPreferenciaTema(armazenamento())
let efetivo: TemaEfetivo = 'claro'
const ouvintes = new Set<() => void>()

const sistemaEscuro = (): boolean => window.matchMedia?.(CONSULTA_ESCURO).matches ?? false

function aplicar(): void {
  const novo = resolverTema(preferencia, sistemaEscuro())
  const raiz = document.documentElement
  raiz.classList.toggle('dark', novo === 'escuro')
  raiz.dataset.tema = novo
  if (novo !== efetivo) {
    efetivo = novo
    ouvintes.forEach((avisar) => avisar())
  }
}

function sincronizarJanela(): void {
  // Menus, diálogos e moldura da janela; a falha não afeta a interface.
  void api.aplicativo.definirTema(preferencia).catch(() => undefined)
}

/** Aplica o tema salvo. Chamar uma vez, antes de renderizar a aplicação. */
export function iniciarTema(): void {
  aplicar()
  // No modo "sistema", acompanha a troca de tema do Windows com o aplicativo aberto.
  window.matchMedia?.(CONSULTA_ESCURO).addEventListener('change', () => {
    if (preferencia === 'sistema') aplicar()
  })
  sincronizarJanela()
}

export function definirPreferenciaTema(nova: PreferenciaTema): void {
  preferencia = nova
  salvarPreferenciaTema(armazenamento(), nova)
  aplicar()
  ouvintes.forEach((avisar) => avisar())
  sincronizarJanela()
}

const assinar = (avisar: () => void): (() => void) => {
  ouvintes.add(avisar)
  return () => ouvintes.delete(avisar)
}

/** Preferência escolhida (claro, escuro ou sistema) e o setter. */
export function usePreferenciaTema(): [PreferenciaTema, (p: PreferenciaTema) => void] {
  const atual = useSyncExternalStore(assinar, () => preferencia)
  return [atual, definirPreferenciaTema]
}

/** Tema que está de fato na tela. */
export function useTemaEfetivo(): TemaEfetivo {
  return useSyncExternalStore(assinar, () => efetivo)
}
