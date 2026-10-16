import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions
} from '@supabase/supabase-js'
import type { ConfigNuvem, StatusNuvem } from '@shared/types'
import { avisarDados, observarDados } from './eventos'
import { classificarFalhaNuvem } from '@shared/falha-nuvem'

/** Serializa avisos: uma mudança que chega durante a consulta agenda outra passagem. */
export class AgendadorSincronizacao {
  private ocupado = false
  private novamente = false
  private parado = false
  constructor(private readonly sincronizar: () => Promise<unknown>) {}
  async solicitar(): Promise<void> {
    if (this.parado) return
    if (this.ocupado) {
      this.novamente = true
      return
    }
    this.ocupado = true
    try {
      do {
        this.novamente = false
        await this.sincronizar()
      } while (this.novamente && !this.parado)
    } finally {
      this.ocupado = false
    }
  }
  parar(): void {
    this.parado = true
  }
}

type EstadoTempoReal = NonNullable<StatusNuvem['tempoReal']>
interface Opcoes {
  configuracao: () => ConfigNuvem
  identidade: () => { empresa: string; token: string } | null
  sincronizar: () => Promise<unknown>
  sincronizarCompleta?: () => Promise<unknown>
  estado: (estado: EstadoTempoReal, erro: string | null) => void
  gatilho?: (origem: string) => void
  verificar?: () => Promise<void>
  renovar: () => Promise<void>
  status?: () => StatusNuvem
  criarCliente?: (config: ConfigNuvem, opcoes: SupabaseClientOptions<'public'>) => SupabaseClient
}
let pararAtual: (() => void) | null = null
let acordarAtual: ((origem: string) => void) | null = null
/** Sinais do Windows antecipam a consulta; não são prova de acesso ao serviço. */
export function solicitarRecuperacaoNuvem(origem = 'manual'): void {
  acordarAtual?.(origem)
}
const renovacoesAtivas = new Set<Promise<void>>()
export async function aguardarTempoReal(): Promise<void> {
  await Promise.allSettled([...renovacoesAtivas])
}
export function pararTempoReal(): void {
  pararAtual?.()
  pararAtual = null
  acordarAtual = null
}
export function iniciarTempoReal(opcoes: Opcoes): void {
  pararTempoReal()
  let cliente: SupabaseClient | null = null
  let chave = '',
    tokenAtual = '',
    encerrado = false
  let repeticao: ReturnType<typeof setTimeout> | null = null
  let tentativas = 0
  let completarProxima = true
  let verificarProxima = true
  let servicoConfirmado = false
  let recuperando = true
  let bloqueada = false
  let ultimoSinal = 0
  let naoAntesDe = 0
  const repetir = (minimo = 0): void => {
    naoAntesDe = Math.max(naoAntesDe, Date.now() + minimo)
    if (encerrado || repeticao || bloqueada) return
    const base = [1000, 2000, 5000][Math.min(tentativas++, 2)]
    naoAntesDe = Math.max(naoAntesDe, Date.now() + minimo)
    const espera = Math.max(minimo, Math.round(base * (0.8 + Math.random() * 0.4)))
    repeticao = setTimeout(() => {
      repeticao = null
      opcoes.gatilho?.('repeticao')
      if (Date.now() < naoAntesDe) {
        repetir(naoAntesDe - Date.now())
        return
      }
      if (opcoes.verificar) void verificarAcesso()
      else solicitar(true, true)
    }, espera)
  }
  let consultaAtiva: Promise<void> | null = null
  const verificarAcesso = (): Promise<void> => {
    if (encerrado || bloqueada || Date.now() < naoAntesDe) return Promise.resolve()
    if (consultaAtiva) return consultaAtiva
    const consulta = (async () => {
      try {
        await opcoes.verificar?.()
        if (encerrado) return
        tentativas = 0
        if (repeticao) clearTimeout(repeticao)
        repeticao = null
        solicitar(true, true)
      } catch (erro) {
        tratarFalha(erro)
      }
    })()
    consultaAtiva = consulta
    void consulta.finally(() => {
      if (consultaAtiva === consulta) consultaAtiva = null
    })
    return consulta
  }
  const tratarFalha = (erro: unknown): void => {
    if (encerrado) return
    const falha = classificarFalhaNuvem(erro)
    bloqueada = !falha.temporaria
    if (falha.temporaria) {
      recuperando = true
      repetir(falha.repetirAposMs)
    }
  }
  const agendador = new AgendadorSincronizacao(async (): Promise<void> => {
    try {
      const verificar = verificarProxima
      verificarProxima = false
      if (verificar) {
        const renovacao = opcoes.renovar()
        renovacoesAtivas.add(renovacao)
        try {
          await renovacao
        } finally {
          renovacoesAtivas.delete(renovacao)
        }
      }
      if (encerrado) return
      await conectar()
      if (encerrado) return
      const completa = completarProxima || recuperando
      completarProxima = false
      const resultado = await (completa && opcoes.sincronizarCompleta
        ? opcoes.sincronizarCompleta()
        : opcoes.sincronizar())
      if (encerrado) return
      const status = resultado as StatusNuvem | null
      if (status?.falhaSincronizacao?.temporaria) {
        recuperando = true
        repetir(status.falhaSincronizacao.repetirAposMs)
      } else if (status?.erro) {
        // Erros de negócio não interrompem a vigilância, mas não são reenviados em loop.
        bloqueada = ['sessao', 'permissao', 'manutencao'].includes(
          status.falhaSincronizacao?.motivo ?? ''
        )
      } else {
        recuperando = false
        bloqueada = false
        tentativas = 0
        if (repeticao) clearTimeout(repeticao)
        repeticao = null
      }
      // Compatibilidade com provedores/testes que ainda não retornam classificação.
      if (
        status?.erro &&
        !status.falhaSincronizacao &&
        /Sem internet|Sem conexão/i.test(status.erro)
      ) {
        bloqueada = false
        recuperando = true
        repetir()
      }
    } catch (e) {
      tratarFalha(e)
      if (!encerrado)
        opcoes.estado(
          'indisponivel',
          'A conexão automática está sendo verificada. Os dados locais estão preservados.'
        )
    }
  })
  const solicitar = (completa = false, verificar = false): void => {
    if (encerrado) return
    completarProxima ||= completa
    verificarProxima ||= verificar
    void agendador.solicitar().catch(() => undefined)
  }
  const conectar = async (): Promise<void> => {
    if (encerrado) return
    const identidade = opcoes.identidade()
    if (!identidade) {
      if (cliente) {
        await cliente.removeAllChannels()
        cliente = null
      }
      chave = ''
      tokenAtual = ''
      opcoes.estado('desconectado', null)
      return
    }
    const config = opcoes.configuracao()
    const novaChave = config.url + ':' + identidade.empresa
    if (cliente && chave === novaChave) {
      if (tokenAtual !== identidade.token) {
        await cliente.realtime.setAuth(identidade.token)
        tokenAtual = identidade.token
      }
      if (!cliente.realtime.isConnected()) cliente.realtime.connect()
      return
    }
    if (cliente) await cliente.removeAllChannels()
    const configuracaoCliente = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => opcoes.identidade()?.token ?? config.chavePublica,
      realtime: {
        params: { eventsPerSecond: 5 },
        reconnectAfterMs: (tentativa: number) =>
          Math.round(
            Math.min(30000, 1000 * 2 ** Math.min(tentativa, 5)) * (0.8 + Math.random() * 0.4)
          )
      }
    }
    cliente =
      opcoes.criarCliente?.(config, configuracaoCliente) ??
      createClient(config.url, config.chavePublica, configuracaoCliente)
    chave = novaChave
    tokenAtual = identidade.token
    await cliente.realtime.setAuth(identidade.token)
    if (encerrado) {
      await cliente.removeAllChannels()
      return
    }
    opcoes.estado('conectando', null)
    cliente
      .channel(`empresa:${identidade.empresa}`, { config: { private: true } })
      .on('broadcast', { event: 'alteracao' }, (evento) => {
        if (encerrado) return
        solicitar(evento.payload?.empresaExcluida === true)
        const entidade = evento.payload?.entidade
        if (
          typeof entidade === 'string' &&
          /^numeracao:(orcamento|relatorio|recibo)$/.test(entidade)
        )
          avisarDados({ origem: 'nuvem', entidades: [entidade], status: true })
      })
      .subscribe((estado) => {
        if (encerrado) return
        if (estado === 'SUBSCRIBED') {
          opcoes.estado('conectado', null)
          solicitar(recuperando)
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')
          opcoes.estado(
            'indisponivel',
            'O canal em tempo real está indisponível. A recuperação periódica continua ativa.'
          )
        else if (estado === 'CLOSED') opcoes.estado('desconectado', null)
      })
  }
  const removerObservador = observarDados((evento) => {
    if (evento.status && opcoes.verificar && opcoes.status?.().conexao === 'inacessivel') {
      servicoConfirmado = false
      recuperando = true
      repetir(opcoes.status?.().falhaSincronizacao?.repetirAposMs)
    }
    if (
      evento.status &&
      recuperando &&
      !servicoConfirmado &&
      opcoes.verificar &&
      opcoes.status?.().conexao === 'acessivel'
    ) {
      servicoConfirmado = true
      if (repeticao) clearTimeout(repeticao)
      repeticao = null
      solicitar(true, true)
    }
    if (evento.status && bloqueada && opcoes.status && !opcoes.status().erro) {
      bloqueada = false
      solicitar(true, true)
    }
    if (
      evento.origem === 'local' &&
      evento.entidades.length &&
      !repeticao &&
      Date.now() >= naoAntesDe
    )
      solicitar()
  })
  acordarAtual = (origem) => {
    opcoes.gatilho?.(origem)
    const agora = Date.now()
    if (agora - ultimoSinal < 1000 || agora < naoAntesDe) return
    ultimoSinal = agora
    // Não antecipa Retry-After do servidor.
    if (repeticao && tentativas > 0) {
      clearTimeout(repeticao)
      repeticao = null
    }
    if (!bloqueada) {
      if (opcoes.verificar) void verificarAcesso()
      else solicitar(true, true)
    }
  }
  const vigilancia = setInterval(() => {
    if (encerrado || repeticao || bloqueada) return
    solicitar(recuperando, true)
  }, 30000)
  const seguranca = setInterval(
    () => {
      if (!bloqueada && !repeticao) solicitar(true, true)
    },
    5 * 60 * 1000
  )
  pararAtual = () => {
    encerrado = true
    acordarAtual = null
    if (repeticao) clearTimeout(repeticao)
    clearInterval(vigilancia)
    clearInterval(seguranca)
    removerObservador()
    agendador.parar()
    if (cliente) void cliente.removeAllChannels()
    opcoes.estado('desconectado', null)
  }
  solicitar(true, true)
}

export function avisarEstadoTempoReal(): void {
  avisarDados({ origem: 'nuvem', entidades: [], status: true })
}
