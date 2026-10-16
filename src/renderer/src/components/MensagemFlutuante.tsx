import { Children, useEffect, useId, type ReactNode } from 'react'
import { mensagemErro } from '@shared/erros'
import { concluirNotificacao, notificar, type NivelNotificacao } from '../lib/notificacoes'

/** Resultado operacional vinculado ao ciclo da tela; instruções continuam no formulário. */
export function MensagemFlutuante({
  children,
  tom = 'erro'
}: {
  children: ReactNode
  tom?: NivelNotificacao
  className?: string
  temporaria?: boolean
}): null {
  const id = useId()
  const texto = Children.toArray(children)
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
    .join('')
  useEffect(() => {
    if (texto.trim()) notificar(tom === 'erro' ? mensagemErro(texto) : texto, tom, { chave: id })
  }, [id, texto, tom])
  useEffect(() => () => concluirNotificacao(id), [id])
  return null
}
