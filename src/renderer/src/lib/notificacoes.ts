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
let contexto = ''
const ativas = new Map<string, Notificacao>()
const publicar = (): void => {
  window.dispatchEvent(new Event(evento))
}
const identificar = (chave: string): string => JSON.stringify([contexto, chave])

export function definirContextoNotificacoes(proximo: string): void {
  if (contexto === proximo) return
  contexto = proximo
  ativas.clear()
  publicar()
}
export function notificacoesAtivas(): Notificacao[] {
  return [...ativas.values()]
}

export function notificar(
  mensagem: string,
  nivel: NivelNotificacao = 'info',
  opcoes: Pick<Notificacao, 'persistente' | 'chave' | 'acao'> = {}
): void {
  const texto = mensagem.trim()
  if (!texto) return
  const chave = identificar(opcoes.chave ?? `${nivel}:${texto}`)
  const anterior = ativas.get(chave)
  // O mesmo aviso mantém identidade e prazo; uma mudança substitui seu conteúdo.
  if (
    anterior &&
    anterior.mensagem === texto &&
    anterior.nivel === nivel &&
    anterior.acao?.rotulo === opcoes.acao?.rotulo &&
    anterior.acao?.desabilitada === opcoes.acao?.desabilitada &&
    anterior.acao?.executar === opcoes.acao?.executar
  )
    return
  const agora = Date.now()
  ativas.set(chave, {
    id: anterior?.id ?? `${agora}-${Math.random().toString(36).slice(2)}`,
    mensagem: texto,
    nivel,
    criadaEm: anterior?.criadaEm ?? agora,
    ...opcoes,
    chave,
    persistente: opcoes.persistente ?? (nivel === 'erro' || nivel === 'aviso' || !!opcoes.acao)
  })
  publicar()
}

export function concluirNotificacao(chave: string): void {
  if (ativas.delete(identificar(chave))) publicar()
}
export function eventoNotificacao(): string {
  return evento
}
export function atualizarAcaoNotificacao(chave: string, desabilitada: boolean): void {
  const id = identificar(chave)
  const item = ativas.get(id)
  if (item?.acao && item.acao.desabilitada !== desabilitada) {
    ativas.set(id, { ...item, acao: { ...item.acao, desabilitada } })
    publicar()
  }
}
export function dispensarNotificacao(id: string): void {
  for (const [chave, item] of ativas)
    if (item.id === id || chave === id) {
      ativas.delete(chave)
      publicar()
      return
    }
}
