import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from './api'
import { useNav } from './nav'
import { Button } from '../ui/primitives'
import type { TipoDocumento } from '@shared/types'
import type { Documento } from '@shared/evolucao'

export function useDocumentoRemoto<T>(
  tipo: TipoDocumento,
  id: string | undefined,
  sujo: boolean,
  documento: T | null,
  carregar: () => Promise<T | null>,
  adotar: (documento: T) => void
): {
  pendente: boolean
  excluido: boolean
  tipo: TipoDocumento
  atualizar: () => Promise<void>
  guardarRascunhoESair: () => Promise<void>
  erroRascunho: string | null
} {
  const { navegarAposSalvar, avisar } = useNav()
  const estado = useRef({ sujo, documento, carregar, adotar })
  estado.current = { sujo, documento, carregar, adotar }
  const [pendente, setPendente] = useState(false)
  const [excluido, setExcluido] = useState(false)
  const [erroRascunho, setErroRascunho] = useState<string | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const contexto = useRef({ tipo, id, ativo: true, pedido: 0 })
  const carregarAtual = async (manual: boolean): Promise<void> => {
    if (!id) return
    const origem = contexto.current
    const pedido = ++origem.pedido
    const inicio = JSON.stringify(estado.current.documento)
    try {
      const atual = await estado.current.carregar()
      if (!origem.ativo || origem !== contexto.current || pedido !== origem.pedido) return
      if (!atual) {
        setPendente(false)
        setExcluido(true)
        if (estado.current.sujo && estado.current.documento) {
          try {
            await api.rascunhos.create(tipo, id, estado.current.documento as unknown as Documento)
          } catch {
            setErroRascunho(
              'Não foi possível guardar as alterações locais. Elas continuam nesta tela.'
            )
            return
          }
        }
        avisar(
          `Este ${tipo === 'orcamento' ? 'orçamento' : tipo === 'relatorio' ? 'relatório' : 'recibo'} foi excluído em outro computador. A tela foi fechada.${estado.current.sujo ? ' Suas alterações foram guardadas como rascunho local para criar outro documento.' : ''}`
        )
        navegarAposSalvar({
          nome:
            tipo === 'orcamento'
              ? 'historico'
              : tipo === 'relatorio'
                ? 'historicoRelatorios'
                : 'recibos'
        })
        return
      }
      if (JSON.stringify(estado.current.documento) !== inicio || (!manual && estado.current.sujo)) {
        setPendente(true)
        return
      }
      estado.current.adotar(atual)
      setPendente(false)
      setExcluido(false)
      setErro(null)
    } catch (e) {
      if (!origem.ativo || origem !== contexto.current || pedido !== origem.pedido) return
      setPendente(true)
      setErro(e)
    }
  }
  const atualizarRef = useRef(carregarAtual)
  atualizarRef.current = carregarAtual
  useEffect(() => {
    const origem = { tipo, id, ativo: true, pedido: 0 }
    contexto.current = origem
    setPendente(false)
    setExcluido(false)
    setErro(null)
    const cancelar = id
      ? api.eventos.observarDados((evento) => {
          if (evento.origem !== 'nuvem' || !evento.entidades.includes(`${tipo}:${id}`)) return
          void atualizarRef.current(false)
        })
      : () => undefined
    return () => {
      origem.ativo = false
      cancelar()
    }
  }, [tipo, id])
  const guardarRascunhoESair = async (): Promise<void> => {
    const atual = estado.current.documento
    if (!id || !atual) return
    try {
      setErroRascunho(null)
      await api.rascunhos.create(tipo, id, atual as unknown as Documento)
      navegarAposSalvar({
        nome:
          tipo === 'orcamento'
            ? 'historico'
            : tipo === 'relatorio'
              ? 'historicoRelatorios'
              : 'recibos'
      })
    } catch {
      setErroRascunho(
        'Não foi possível guardar as alterações como rascunho. Elas continuam nesta tela.'
      )
    }
  }
  return {
    pendente: pendente || !!erro,
    excluido,
    tipo,
    erroRascunho,
    atualizar: () => atualizarRef.current(true),
    guardarRascunhoESair
  }
}
export function AvisoAtualizacao({
  pendente,
  excluido,
  tipo,
  atualizar,
  erroRascunho,
  sujo,
  guardarRascunhoESair
}: {
  pendente: boolean
  excluido?: boolean
  tipo?: TipoDocumento
  atualizar?: () => Promise<void>
  erroRascunho?: string | null
  sujo?: boolean
  guardarRascunhoESair?: () => Promise<void>
}): JSX.Element | null {
  const { executarComConfirmacao, navegar } = useNav()
  if (excluido)
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p className="font-semibold">Este registro foi excluído em outro computador.</p>
        <p className="mt-1">Ele não pode mais ser salvo nem restaurado por esta tela.</p>
        {erroRascunho && <p className="mt-2 font-medium">{erroRascunho}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {sujo && guardarRascunhoESair && (
            <Button icon={Save} onClick={() => void guardarRascunhoESair()}>
              Guardar alterações como rascunho e sair
            </Button>
          )}
          <Button
            icon={ArrowLeft}
            variant="outline"
            onClick={() =>
              executarComConfirmacao(() =>
                navegar({
                  nome:
                    tipo === 'relatorio'
                      ? 'historicoRelatorios'
                      : tipo === 'recibo'
                        ? 'recibos'
                        : 'historico'
                })
              )
            }
          >
            Sair do registro excluído
          </Button>
        </div>
      </div>
    )
  if (!pendente) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p>
        Existe uma nova versão na nuvem. Suas alterações neste editor foram preservadas. Você pode
        guardar um rascunho antes de atualizar.
      </p>
      <Button
        icon={ArrowLeft}
        variant="outline"
        onClick={() => executarComConfirmacao(() => void atualizar?.())}
      >
        Atualizar editor
      </Button>
    </div>
  )
}
