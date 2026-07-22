import { NavProvider, useNav, type Rota } from './lib/nav'
import { cn, Icone } from './ui/primitives'
import { api } from './lib/api'
import { useAsync } from './lib/hooks'
import { HistoricoPage } from './pages/HistoricoPage'
import { CadastrosPage } from './pages/CadastrosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { EditorOrcamentoPage } from './pages/EditorOrcamentoPage'

const itens: Array<{ nome: Rota['nome']; label: string; icon: string }> = [
  { nome: 'historico', label: 'Orçamentos', icon: '📄' },
  { nome: 'cadastros', label: 'Cadastros', icon: '📇' },
  { nome: 'configuracoes', label: 'Configurações', icon: '⚙️' }
]

function Sidebar(): JSX.Element {
  const { rota, navegar } = useNav()
  // Recarrega o nome da empresa ao trocar de tela (reflete edições nas Configurações).
  const { data: empresa } = useAsync(() => api.empresa.get(), [rota.nome])
  const nomeEmpresa = empresa
    ? empresa.nomeExibicao === 'razaoSocial'
      ? empresa.razaoSocial
      : empresa.nome
    : ''
  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        {nomeEmpresa && (
          <div className="inline-flex max-w-full items-center truncate rounded-full bg-brand-teal px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            {nomeEmpresa}
          </div>
        )}
        <h1 className="mt-2 text-sm font-semibold leading-tight text-slate-700">
          Gerador de Orçamentos
        </h1>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {itens.map((item) => {
          const ativo =
            rota.nome === item.nome || (item.nome === 'historico' && rota.nome === 'editor')
          return (
            <button
              key={item.nome}
              onClick={() => navegar({ nome: item.nome })}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                ativo ? 'bg-brand-teal/10 text-brand-tealDark' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <Icone>{item.icon}</Icone>
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-slate-200 px-5 py-3 text-[11px] text-slate-400">
        v0.1.0 · dados locais
      </div>
    </aside>
  )
}

function Conteudo(): JSX.Element {
  const { rota } = useNav()
  switch (rota.nome) {
    case 'historico':
      return <HistoricoPage />
    case 'editor':
      return <EditorOrcamentoPage orcamentoId={rota.orcamentoId} />
    case 'cadastros':
      return <CadastrosPage />
    case 'configuracoes':
      return <ConfiguracoesPage />
    default:
      return <HistoricoPage />
  }
}

function App(): JSX.Element {
  return (
    <NavProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-100">
          <Conteudo />
        </main>
      </div>
    </NavProvider>
  )
}

export default App
