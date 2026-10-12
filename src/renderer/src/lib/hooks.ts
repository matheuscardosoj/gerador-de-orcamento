import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from './api'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao
} from '@shared/types'
type CadastrosEditor = {
  empresa: EmpresaConfig
  parametros: ParametrosFinanceiros
  clientes: Cliente[]
  servicos: ServicoCatalogo[]
  observacoesPadrao: ObservacaoPadrao[]
  pagamentosPadrao: FormaPagamentoPadrao[]
}
export function useCadastrosAtualizados<T extends CadastrosEditor>(
  setDados: Dispatch<SetStateAction<T | null>>
): void {
  useEffect(() => {
    let ativo = true,
      pedido = 0
    const cancelar = api.eventos.observarDados((e) => {
      if (
        !e.entidades.some((n) =>
          [
            'clientes',
            'servicos',
            'observacoes_padrao',
            'pagamentos_padrao',
            'configuracoes'
          ].includes(n.split(':')[0])
        )
      )
        return
      const atual = ++pedido
      void Promise.all([
        api.empresa.get(),
        api.parametros.get(),
        api.clientes.list(),
        api.servicos.list(),
        api.observacoes.list(),
        api.pagamentos.list()
      ])
        .then(([empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao]) => {
          if (ativo && pedido === atual)
            setDados((d) =>
              d
                ? {
                    ...d,
                    empresa,
                    parametros,
                    clientes,
                    servicos,
                    observacoesPadrao,
                    pagamentosPadrao
                  }
                : d
            )
        })
        .catch(() => undefined)
    })
    return () => {
      ativo = false
      cancelar()
    }
  }, [setDados])
}

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
