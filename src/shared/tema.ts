// Preferência de tema (claro/escuro/sistema). Lógica pura e sem DOM, para ser testável;
// o runtime do renderer (src/renderer/src/lib/tema.ts) aplica o resultado na tela.

export const PREFERENCIAS_TEMA = ['claro', 'escuro', 'sistema'] as const
export type PreferenciaTema = (typeof PREFERENCIAS_TEMA)[number]
export type TemaEfetivo = 'claro' | 'escuro'

/** Chave no localStorage do perfil do aplicativo: a escolha é por computador, não da empresa. */
export const CHAVE_PREFERENCIA_TEMA = 'gdo:tema'

/** Quem nunca escolheu continua vendo o visual de sempre. */
export const PREFERENCIA_TEMA_PADRAO: PreferenciaTema = 'claro'

type Leitura = Pick<Storage, 'getItem'>
type Gravacao = Pick<Storage, 'setItem'>

export function normalizarPreferenciaTema(valor: unknown): PreferenciaTema {
  return (PREFERENCIAS_TEMA as readonly unknown[]).includes(valor)
    ? (valor as PreferenciaTema)
    : PREFERENCIA_TEMA_PADRAO
}

/** O acesso ao armazenamento pode lançar (dados do site bloqueados, perfil corrompido). */
export function lerPreferenciaTema(armazenamento: Leitura | null | undefined): PreferenciaTema {
  try {
    return normalizarPreferenciaTema(armazenamento?.getItem(CHAVE_PREFERENCIA_TEMA))
  } catch {
    return PREFERENCIA_TEMA_PADRAO
  }
}

/** Devolve se a escolha foi gravada; falhar não impede de usar o tema na sessão atual. */
export function salvarPreferenciaTema(
  armazenamento: Gravacao | null | undefined,
  preferencia: PreferenciaTema
): boolean {
  try {
    armazenamento?.setItem(CHAVE_PREFERENCIA_TEMA, preferencia)
    return !!armazenamento
  } catch {
    return false
  }
}

export function resolverTema(preferencia: PreferenciaTema, sistemaEscuro: boolean): TemaEfetivo {
  if (preferencia === 'sistema') return sistemaEscuro ? 'escuro' : 'claro'
  return preferencia
}

/** Valor de `nativeTheme.themeSource` do Electron (menus, diálogos e moldura da janela). */
export function modoNativoTema(preferencia: PreferenciaTema): 'light' | 'dark' | 'system' {
  return preferencia === 'claro' ? 'light' : preferencia === 'escuro' ? 'dark' : 'system'
}
