import { mensagemErro } from '@shared/erros'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Save, Check } from 'lucide-react'
import { Button } from '../../ui/primitives'

export type EstadoSalvar = { salvando: boolean; ok: boolean; disabled: boolean }
export const AcoesFormulario = createContext<{
  formId?: string
  atualizar: (estado: EstadoSalvar) => void
} | null>(null)

export function BotaoSalvar({
  salvando,
  ok,
  disabled = salvando
}: {
  salvando: boolean
  ok: boolean
  disabled?: boolean
}): JSX.Element | null {
  const contexto = useContext(AcoesFormulario)
  const atualizar = contexto?.atualizar,
    formId = contexto?.formId
  useEffect(() => {
    if (formId && atualizar) atualizar({ salvando, ok, disabled })
  }, [formId, atualizar, salvando, ok, disabled])
  if (formId) return null
  return (
    <Button icon={ok && !salvando ? Check : Save} type="submit" disabled={disabled}>
      {salvando ? 'Salvando…' : ok ? 'Salvo' : 'Salvar alterações'}
    </Button>
  )
}

export type ExecutarMutacao<Operacao extends string> = (
  operacao: Operacao,
  tarefa: () => Promise<unknown>
) => Promise<boolean>

/** Serializa operações de uma mesma seção e sempre devolve o controle à interface. */
export function useMutacao<Operacao extends string>(): {
  operacao: Operacao | null
  ocupado: boolean
  erro: string | null
  executar: ExecutarMutacao<Operacao>
  limparErro: () => void
} {
  const [operacao, setOperacao] = useState<Operacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const emAndamento = useRef(false)

  const executar: ExecutarMutacao<Operacao> = async (proximaOperacao, tarefa) => {
    if (emAndamento.current) return false
    emAndamento.current = true
    setOperacao(proximaOperacao)
    setErro(null)
    try {
      await tarefa()
      return true
    } catch (causa) {
      setErro(mensagemErro(causa))
      return false
    } finally {
      emAndamento.current = false
      setOperacao(null)
    }
  }

  return { operacao, ocupado: operacao !== null, erro, executar, limparErro: () => setErro(null) }
}
