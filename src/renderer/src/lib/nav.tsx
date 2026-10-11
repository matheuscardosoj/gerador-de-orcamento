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
import { ConfirmDialog } from '../ui/primitives'

export type Rota =
  | { nome: 'historico' }
  | { nome: 'editor'; orcamentoId?: string }
  | { nome: 'historicoRelatorios' }
  | { nome: 'editorRelatorio'; relatorioId?: string }
  | { nome: 'recibos'; reciboId?: string }
  | { nome: 'cadastros' }
  | { nome: 'configuracoes' }

interface NavContexto {
  rota: Rota
  navegar: (rota: Rota) => void
  registrarBloqueio: (bloqueio: (() => boolean) | null) => void
}

const Ctx = createContext<NavContexto | null>(null)

export function NavProvider({ children }: { children: ReactNode }): JSX.Element {
  const [rota, setRota] = useState<Rota>({ nome: 'historico' })
  const [pendente, setPendente] = useState<Rota | null>(null)
  const bloqueio = useRef<(() => boolean) | null>(null)
  const registrarBloqueio = useCallback((proximo: (() => boolean) | null) => {
    bloqueio.current = proximo
  }, [])
  const navegar = useCallback((proxima: Rota) => {
    if (bloqueio.current?.()) setPendente(proxima)
    else setRota(proxima)
  }, [])
  const descartar = (): void => {
    const destino = pendente
    setPendente(null)
    bloqueio.current = null
    void api.aplicativo.alteracoesPendentes(false)
    if (destino) setRota(destino)
  }
  return (
    <Ctx.Provider value={{ rota, navegar, registrarBloqueio }}>
      {children}
      <ConfirmDialog
        open={pendente !== null}
        title="Alterações não salvas"
        description="Se você sair deste editor agora, as alterações feitas desde o último salvamento serão perdidas."
        confirmLabel="Descartar alterações"
        cancelLabel="Continuar editando"
        onCancel={() => setPendente(null)}
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
