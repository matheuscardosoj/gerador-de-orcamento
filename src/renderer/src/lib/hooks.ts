import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

/** Carrega dados de uma Promise e expõe estado + recarregar. */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  escopos?: string[]
): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const chaveEscopos = escopos?.join(',')
  useEffect(() => {
    if (!chaveEscopos) return
    const nomes = chaveEscopos.split(',')
    return api.eventos.observarDados((evento) => {
      if (evento.entidades.some((entidade) => nomes.includes(entidade.split(':')[0]))) reload()
    })
  }, [chaveEscopos, reload])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    fn()
      .then((r) => {
        if (vivo) {
          setData(r)
          setError(null)
        }
      })
      .catch((e) => vivo && setError(String(e)))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { data, loading, error, reload }
}
