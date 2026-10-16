import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import type { Notificacao, NivelNotificacao } from '../lib/notificacoes'
import { dispensarNotificacao, eventoNotificacao, notificar } from '../lib/notificacoes'
import { AppIcon } from '../ui/primitives'

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

export function Notificacoes(): JSX.Element | null {
  const [fila, setFila] = useState<Notificacao[]>([])
  const [expandida, setExpandida] = useState(false)
  useEffect(() => {
    const receber = (evento: Event): void => {
      const notificacao = (evento as CustomEvent<Notificacao>).detail
      if (notificacao?.mensagem)
        setFila((atual) =>
          atual.some((item) => item.id === notificacao.id) ? atual : [...atual, notificacao]
        )
    }
    const remover = (evento: Event): void => {
      const chave = (evento as CustomEvent<string>).detail
      setFila((atual) => atual.filter((item) => item.chave !== chave))
    }
    const atualizarAcao = (evento: Event): void => {
      const { chave, desabilitada } = (
        evento as CustomEvent<{ chave: string; desabilitada: boolean }>
      ).detail
      setFila((atual) =>
        atual.map((item) =>
          item.chave === chave && item.acao
            ? { ...item, acao: { ...item.acao, desabilitada } }
            : item
        )
      )
    }
    window.addEventListener('gdo:notificacao-acao', atualizarAcao)
    window.addEventListener('gdo:notificacao-remover', remover)
    window.addEventListener(eventoNotificacao(), receber)
    return () => {
      window.removeEventListener(eventoNotificacao(), receber)
      window.removeEventListener('gdo:notificacao-acao', atualizarAcao)
      window.removeEventListener('gdo:notificacao-remover', remover)
    }
  }, [])

  const dispensar = useCallback((id: string): void => {
    setFila((atual) => {
      const item = atual.find((notificacao) => notificacao.id === id)
      if (item?.chave) dispensarNotificacao(item.chave)
      return atual.filter((notificacao) => notificacao.id !== id)
    })
  }, [])
  if (!fila.length) return null
  const prioritarias = [...fila].sort((a, b) => Number(!!b.persistente) - Number(!!a.persistente))
  const visiveis = expandida ? prioritarias : prioritarias.slice(0, 3)
  return (
    <section
      aria-label="Avisos"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {visiveis.map((item) => (
        <AvisoFlutuante key={item.id} notificacao={item} aoFechar={dispensar} />
      ))}
      {fila.length > 3 && (
        <button
          type="button"
          className="self-end rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-white shadow"
          aria-expanded={expandida}
          onClick={() => setExpandida((aberta) => !aberta)}
        >
          {expandida
            ? 'Mostrar menos avisos'
            : `Ver ${fila.length - 3} aviso${fila.length - 3 === 1 ? '' : 's'} oculto${fila.length - 3 === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}

function AvisoFlutuante({
  notificacao,
  aoFechar
}: {
  notificacao: Notificacao
  aoFechar: (id: string) => void
}): JSX.Element {
  const [pausado, setPausado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const estilo = aparencia[notificacao.nivel]
  useEffect(() => {
    if (pausado) return
    if (notificacao.persistente) return
    const timer = window.setTimeout(() => aoFechar(notificacao.id), estilo.tempo)
    return () => window.clearTimeout(timer)
  }, [notificacao.id, notificacao.persistente, pausado, estilo.tempo, aoFechar])
  const Icone = estilo.icone
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg ${estilo.cor}`}
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
                .catch(() =>
                  notificar(
                    'Não foi possível confirmar a solicitação. Verifique a conexão e tente novamente.',
                    'aviso'
                  )
                )
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
