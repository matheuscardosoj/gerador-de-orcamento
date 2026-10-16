import { useEffect } from 'react'
import { api } from '../lib/api'
import { notificar } from '../lib/notificacoes'

export function AvisosEmail(): null {
  useEffect(() => {
    let ativo = true
    const buscar = (): void => {
      void api.conta
        .avisosEmail()
        .then((novos) => {
          if (ativo) novos.forEach((aviso) => notificar(`Confirmação de e-mail: ${aviso}`, 'info'))
        })
        .catch(() => undefined)
    }
    const remover = api.eventos.observarDados((evento) => {
      if (evento.status) buscar()
    })
    buscar()
    return () => {
      ativo = false
      remover()
    }
  }, [])
  return null
}
