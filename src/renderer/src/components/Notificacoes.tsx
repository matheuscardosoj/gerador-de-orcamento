import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import type { Notificacao, NivelNotificacao } from '../lib/notificacoes'
import {
  dispensarNotificacao,
  eventoNotificacao,
  notificacoesAtivas,
  notificar
} from '../lib/notificacoes'
import { AppIcon } from '../ui/primitives'
import type { ReactElement } from 'react'

const aparencia: Record<
  NivelNotificacao,
  { icone: typeof Info; cor: string; tempo: number; rotulo: string }
> = {
  sucesso: {
    icone: CheckCircle2,
    cor: 'border-emerald-200 text-emerald-700',
    tempo: 6000,
    rotulo: 'Concluído'
  },
  erro: {
    icone: AlertCircle,
    cor: 'border-red-200 text-red-700',
    tempo: 9000,
    rotulo: 'Não foi possível concluir'
  },
  aviso: {
    icone: TriangleAlert,
    cor: 'border-amber-200 text-amber-800',
    tempo: 8000,
    rotulo: 'Atenção'
  },
  info: {
    icone: Info,
    cor: 'border-brand-teal/30 text-brand-tealDark',
    tempo: 6000,
    rotulo: 'Informação'
  }
}

export function Notificacoes(): ReactElement | null {
  const [fila, setFila] = useState<Notificacao[]>(notificacoesAtivas)
  const [expandida, setExpandida] = useState(false)
  const [host, setHost] = useState<HTMLElement>(document.body)
  useEffect(() => {
    const atualizar = (): void => setFila(notificacoesAtivas())
    atualizar()
    window.addEventListener(eventoNotificacao(), atualizar)
    return () => window.removeEventListener(eventoNotificacao(), atualizar)
  }, [])
  useEffect(() => {
    const atualizarHost = (): void => {
      const hosts = document.querySelectorAll<HTMLElement>('[data-gdo-notificacoes]')
      const destino = hosts.item(hosts.length - 1) ?? document.body
      setHost((atual) => (atual === destino ? atual : destino))
    }
    const observador = new MutationObserver(atualizarHost)
    observador.observe(document.body, { childList: true, subtree: true })
    atualizarHost()
    return () => observador.disconnect()
  }, [])
  const dispensar = useCallback((id: string): void => dispensarNotificacao(id), [])
  if (!fila.length) return null
  const prioritarias = [...fila].sort((a, b) => Number(!!b.persistente) - Number(!!a.persistente))
  const visiveis = expandida ? prioritarias : prioritarias.slice(0, 3)
  return createPortal(
    <section
      aria-label="Avisos"
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      <div className="flex max-h-[min(70vh,36rem)] flex-col gap-2 overflow-y-auto overscroll-contain p-1">
        {visiveis.map((item) => (
          <AvisoFlutuante key={item.id} notificacao={item} aoFechar={dispensar} />
        ))}
      </div>
      {fila.length > 3 && (
        <button
          type="button"
          className="pointer-events-auto self-end rounded-full bg-inverso px-2.5 py-1 text-xs font-medium text-white shadow"
          aria-expanded={expandida}
          onClick={() => setExpandida((aberta) => !aberta)}
        >
          {expandida
            ? 'Mostrar menos avisos'
            : `Ver ${fila.length - 3} aviso${fila.length - 3 === 1 ? '' : 's'} oculto${fila.length - 3 === 1 ? '' : 's'}`}
        </button>
      )}
    </section>,
    host
  )
}

function AvisoFlutuante({
  notificacao,
  aoFechar
}: {
  notificacao: Notificacao
  aoFechar: (id: string) => void
}): ReactElement {
  const [pausado, setPausado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const estilo = aparencia[notificacao.nivel]
  const restante = useRef(estilo.tempo)
  useEffect(() => {
    if (pausado) return
    if (notificacao.persistente) return
    const inicio = Date.now()
    const timer = window.setTimeout(() => aoFechar(notificacao.id), restante.current)
    return () => {
      restante.current = Math.max(0, restante.current - (Date.now() - inicio))
      window.clearTimeout(timer)
    }
  }, [notificacao.id, notificacao.persistente, pausado, estilo.tempo, aoFechar])
  const Icone = estilo.icone
  return (
    <div
      role={notificacao.nivel === 'erro' ? 'alert' : 'status'}
      aria-atomic="true"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3 shadow-lg ${estilo.cor}`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setPausado(false)
      }}
    >
      <AppIcon icon={Icone} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{estilo.rotulo}</p>
        <p className="mt-0.5 break-words text-sm leading-5 text-slate-700">
          {notificacao.mensagem}
        </p>
        {notificacao.acao && (
          <button
            type="button"
            className="mt-2 rounded-md text-sm font-semibold underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
            disabled={ocupado || notificacao.acao.desabilitada}
            onClick={() => {
              if (ocupado) return
              setOcupado(true)
              void Promise.resolve()
                .then(() => notificacao.acao?.executar())
                .then((concluiu) => {
                  if (concluiu !== false) aoFechar(notificacao.id)
                })
                .catch(() => {
                  if (!notificacoesAtivas().some((item) => item.id === notificacao.id)) return
                  notificar(
                    'Não foi possível confirmar a solicitação. Verifique a conexão e tente novamente.',
                    'aviso'
                  )
                })
                .finally(() => setOcupado(false))
            }}
          >
            {notificacao.acao.desabilitada
              ? 'Aguardando conexão para confirmar'
              : notificacao.acao.rotulo}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
        onClick={() => aoFechar(notificacao.id)}
      >
        <AppIcon icon={X} size="sm" />
      </button>
    </div>
  )
}
