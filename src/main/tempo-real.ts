import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions
} from '@supabase/supabase-js'
import type { ConfigNuvem, StatusNuvem } from '@shared/types'
import { avisarDados, observarDados } from './eventos'

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
  estado: (estado: EstadoTempoReal, erro: string | null) => void
  renovar: () => Promise<void>
  criarCliente?: (config: ConfigNuvem, opcoes: SupabaseClientOptions<'public'>) => SupabaseClient
}
let pararAtual: (() => void) | null = null
export function pararTempoReal(): void {
  pararAtual?.()
  pararAtual = null
}
export function iniciarTempoReal(opcoes: Opcoes): void {
  pararTempoReal()
  let cliente: SupabaseClient | null = null
  let chave = '',
    tokenAtual = '',
    encerrado = false
  let repeticao: ReturnType<typeof setTimeout> | null = null
  let tentativas = 0
  const repetir = (): void => {
    if (encerrado || repeticao || tentativas >= 5) return
    const espera = [1000, 3000, 10000, 30000, 30000][tentativas++]
    repeticao = setTimeout(() => {
      repeticao = null
      solicitar()
    }, espera)
  }
  const agendador = new AgendadorSincronizacao(async () => {
    try {
      const resultado = await opcoes.sincronizar()
      const erro = (resultado as { erro?: string } | null)?.erro
      if (erro && !/conflito|concilia/i.test(erro)) repetir()
      else {
        tentativas = 0
        if (repeticao) clearTimeout(repeticao)
        repeticao = null
      }
      return resultado
    } catch (e) {
      repetir()
      throw e
    }
  })
  const solicitar = (): void => {
    void agendador.solicitar().catch(() => undefined)
  }
  const conectar = async (): Promise<void> => {
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
      return
    }
    if (cliente) await cliente.removeAllChannels()
    const configuracaoCliente = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => opcoes.identidade()?.token ?? config.chavePublica,
      realtime: { params: { eventsPerSecond: 5 } }
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
      .on('broadcast', { event: 'alteracao' }, solicitar)
      .subscribe((estado) => {
        if (encerrado) return
        if (estado === 'SUBSCRIBED') {
          opcoes.estado('conectado', null)
          solicitar()
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')
          opcoes.estado(
            'indisponivel',
            'O canal em tempo real está indisponível. A recuperação periódica continua ativa.'
          )
        else if (estado === 'CLOSED') opcoes.estado('desconectado', null)
      })
  }
  const removerObservador = observarDados((evento) => {
    if (evento.origem === 'local' && evento.entidades.length) solicitar()
  })
  const vigilancia = setInterval(() => {
    if (encerrado) return
    void opcoes
      .renovar()
      .then(conectar)
      .catch(() => {
        opcoes.estado(
          'indisponivel',
          'Não foi possível renovar a sessão ou a conexão. Suas alterações continuam guardadas neste computador.'
        )
      })
  }, 30000)
  const seguranca = setInterval(solicitar, 5 * 60 * 1000)
  pararAtual = () => {
    encerrado = true
    if (repeticao) clearTimeout(repeticao)
    clearInterval(vigilancia)
    clearInterval(seguranca)
    removerObservador()
    agendador.parar()
    if (cliente) void cliente.removeAllChannels()
    opcoes.estado('desconectado', null)
  }
  void conectar()
    .then(solicitar)
    .catch(() => opcoes.estado('indisponivel', 'A conexão em tempo real não iniciou.'))
}

export function avisarEstadoTempoReal(): void {
  avisarDados({ origem: 'nuvem', entidades: [], status: true })
}
