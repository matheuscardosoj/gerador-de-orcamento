export type NivelNotificacao = 'sucesso' | 'erro' | 'aviso' | 'info'

export type Notificacao = {
  id: string
  mensagem: string
  nivel: NivelNotificacao
  criadaEm: number
  persistente?: boolean
  chave?: string
  acao?: {
    rotulo: string
    desabilitada?: boolean
    executar: () => void | boolean | Promise<void | boolean>
  }
}

const evento = 'gdo:notificacao'
let ultimaChave = ''
let ultimaEm = 0
const chavesAtivas = new Set<string>()

export function notificar(
  mensagem: string,
  nivel: NivelNotificacao = 'info',
  opcoes: Pick<Notificacao, 'persistente' | 'chave' | 'acao'> = {}
): void {
  const texto = mensagem.trim()
  if (!texto) return
  if (opcoes.chave && chavesAtivas.has(opcoes.chave)) return
  const agora = Date.now()
  const chave = `${nivel}:${texto}`
  if (!opcoes.chave && chave === ultimaChave && agora - ultimaEm < 900) return
  ultimaChave = chave
  ultimaEm = agora
  if (opcoes.chave) chavesAtivas.add(opcoes.chave)
  window.dispatchEvent(
    new CustomEvent<Notificacao>(evento, {
      detail: {
        id: `${agora}-${Math.random().toString(36).slice(2)}`,
        mensagem: texto,
        nivel,
        criadaEm: agora,
        ...opcoes
      }
    })
  )
}

export function concluirNotificacao(chave: string): void {
  chavesAtivas.delete(chave)
  window.dispatchEvent(new CustomEvent('gdo:notificacao-remover', { detail: chave }))
}

export function eventoNotificacao(): string {
  return evento
}

export function atualizarAcaoNotificacao(chave: string, desabilitada: boolean): void {
  window.dispatchEvent(new CustomEvent('gdo:notificacao-acao', { detail: { chave, desabilitada } }))
}
export function dispensarNotificacao(chave: string): void {
  chavesAtivas.delete(chave)
}
