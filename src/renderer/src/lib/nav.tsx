import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { api } from './api'
import { notificar, type NivelNotificacao } from './notificacoes'
import { ConfirmDialog } from '../ui/primitives'

export type AbaConfiguracoes =
  | 'conta'
  | 'nuvem'
  | 'usuarios'
  | 'empresa'
  | 'parametros'
  | 'observacoes'
  | 'pagamentos'
  | 'dados'
  | 'ia'

export type Rota =
  | { nome: 'historico' }
  | { nome: 'editor'; orcamentoId?: string }
  | { nome: 'historicoRelatorios' }
  | { nome: 'editorRelatorio'; relatorioId?: string }
  | { nome: 'recibos'; reciboId?: string; origem?: { tipo: 'orcamento' | 'relatorio'; id: string } }
  | { nome: 'cadastros' }
  | { nome: 'configuracoes'; aba?: AbaConfiguracoes }

interface NavContexto {
  rota: Rota
  revisaoRota: number
  navegar: (rota: Rota) => void
  navegarAposSalvar: (rota: Rota) => void
  registrarBloqueio: (bloqueio: (() => boolean) | null) => void
  executarComConfirmacao: (acao: () => void, aoCancelar?: () => void) => void
  avisar: (mensagem: string, nivel?: NivelNotificacao) => void
}

const Ctx = createContext<NavContexto | null>(null)

export function NavProvider({ children }: { children: ReactNode }): JSX.Element {
  const [rota, setRota] = useState<Rota>({ nome: 'historico' })
  const [revisaoRota, setRevisaoRota] = useState(0)
  const [pendente, setPendente] = useState<{ executar: () => void; cancelar?: () => void } | null>(
    null
  )
  const bloqueio = useRef<(() => boolean) | null>(null)
  const registrarBloqueio = useCallback((proximo: (() => boolean) | null) => {
    bloqueio.current = proximo
  }, [])
  const executarComConfirmacao = useCallback((acao: () => void, aoCancelar?: () => void) => {
    if (bloqueio.current?.()) setPendente({ executar: acao, cancelar: aoCancelar })
    else acao()
  }, [])
  const navegar = useCallback(
    (proxima: Rota) =>
      executarComConfirmacao(() => {
        setRota(proxima)
        setRevisaoRota((r) => r + 1)
      }),
    [executarComConfirmacao]
  )
  const navegarAposSalvar = useCallback((proxima: Rota) => {
    bloqueio.current = null
    void api.aplicativo.alteracoesPendentes(false)
    setRota(proxima)
    setRevisaoRota((r) => r + 1)
  }, [])
  const descartar = (): void => {
    const destino = pendente
    setPendente(null)
    bloqueio.current = null
    void api.aplicativo.alteracoesPendentes(false)
    destino?.executar()
  }
  return (
    <Ctx.Provider
      value={{
        rota,
        revisaoRota,
        navegar,
        navegarAposSalvar,
        registrarBloqueio,
        executarComConfirmacao,
        avisar: (mensagem, nivel = 'info') => notificar(mensagem, nivel)
      }}
    >
      {children}
      <ConfirmDialog
        open={pendente !== null}
        title="Alterações não salvas"
        description="Se você sair agora, as alterações feitas desde o último salvamento serão perdidas."
        confirmLabel="Descartar alterações"
        cancelLabel="Continuar editando"
        onCancel={() => {
          pendente?.cancelar?.()
          setPendente(null)
        }}
        onConfirm={descartar}
      />
    </Ctx.Provider>
  )
}

export function useNav(): NavContexto {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNav deve ser usado dentro de NavProvider')
  return ctx
}

export function useBloqueioEdicao(ativo: boolean): void {
  const { registrarBloqueio } = useNav()
  useEffect(() => {
    registrarBloqueio(() => ativo)
    void api.aplicativo.alteracoesPendentes(ativo)
    return () => {
      registrarBloqueio(null)
      void api.aplicativo.alteracoesPendentes(false)
    }
  }, [ativo, registrarBloqueio])
}
