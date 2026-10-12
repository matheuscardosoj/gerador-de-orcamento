import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from './api'
import { useNav } from './nav'
import { Button } from '../ui/primitives'
import type { TipoDocumento } from '@shared/types'

export function useDocumentoRemoto<T>(
  tipo: TipoDocumento,
  id: string | undefined,
  sujo: boolean,
  documento: T | null,
  carregar: () => Promise<T | null>,
  adotar: (documento: T) => void
): { pendente: boolean; atualizar: () => Promise<void> } {
  const estado = useRef({ sujo, documento, carregar, adotar })
  estado.current = { sujo, documento, carregar, adotar }
  const [pendente, setPendente] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const contexto = useRef({ tipo, id, ativo: true, pedido: 0 })
  const carregarAtual = async (manual: boolean): Promise<void> => {
    const origem = contexto.current
    const pedido = ++origem.pedido
    const inicio = JSON.stringify(estado.current.documento)
    try {
      const atual = await estado.current.carregar()
      if (!origem.ativo || origem !== contexto.current || pedido !== origem.pedido) return
      if (!atual) {
        setPendente(true)
        return
      }
      if (JSON.stringify(estado.current.documento) !== inicio || (!manual && estado.current.sujo)) {
        setPendente(true)
        return
      }
      estado.current.adotar(atual)
      setPendente(false)
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
    setErro(null)
    const cancelar = id
      ? api.eventos.observarDados((evento) => {
          if (evento.origem !== 'nuvem' || !evento.entidades.includes(`${tipo}:${id}`)) return
          if (estado.current.sujo) setPendente(true)
          else void atualizarRef.current(false)
        })
      : () => undefined
    return () => {
      origem.ativo = false
      cancelar()
    }
  }, [tipo, id])
  return { pendente: pendente || !!erro, atualizar: () => atualizarRef.current(true) }
}
export function AvisoAtualizacao({
  pendente,
  atualizar
}: {
  pendente: boolean
  atualizar: () => Promise<void>
}): JSX.Element | null {
  const { executarComConfirmacao } = useNav()
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
        icon={RefreshCw}
        variant="outline"
        onClick={() =>
          executarComConfirmacao(() => {
            void atualizar()
          })
        }
      >
        Atualizar editor
      </Button>
    </div>
  )
}
