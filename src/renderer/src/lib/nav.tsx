import { createContext, useContext, useState, type ReactNode } from 'react'

export type Rota =
  | { nome: 'historico' }
  | { nome: 'editor'; orcamentoId?: string }
  | { nome: 'cadastros' }
  | { nome: 'configuracoes' }

interface NavContexto {
  rota: Rota
  navegar: (rota: Rota) => void
}

const Ctx = createContext<NavContexto | null>(null)

export function NavProvider({ children }: { children: ReactNode }): JSX.Element {
  const [rota, setRota] = useState<Rota>({ nome: 'historico' })
  return <Ctx.Provider value={{ rota, navegar: setRota }}>{children}</Ctx.Provider>
}

export function useNav(): NavContexto {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNav deve ser usado dentro de NavProvider')
  return ctx
}
