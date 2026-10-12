import { RecibosPage } from './pages/RecibosPage'
import { useEffect, useState } from 'react'
import type { StatusNuvem } from '@shared/types'
import { NavProvider, useNav, type Rota } from './lib/nav'
import { cn, AppIcon } from './ui/primitives'
import {
  ClipboardList,
  ContactRound,
  FileText,
  ReceiptText,
  Settings,
  type LucideIcon
} from 'lucide-react'
import { api } from './lib/api'
import { useAsync } from './lib/hooks'
import { HistoricoPage } from './pages/HistoricoPage'
import { CadastrosPage } from './pages/CadastrosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { EditorOrcamentoPage } from './pages/EditorOrcamentoPage'
import { HistoricoRelatoriosPage } from './pages/HistoricoRelatoriosPage'
import { EditorRelatorioPage } from './pages/EditorRelatorioPage'

const itens: Array<{ nome: Rota['nome']; label: string; icon: LucideIcon }> = [
  { nome: 'historico', label: 'Orçamentos', icon: FileText },
  { nome: 'historicoRelatorios', label: 'Relatórios', icon: ClipboardList },
  { nome: 'recibos', label: 'Recibos', icon: ReceiptText },
  { nome: 'cadastros', label: 'Cadastros', icon: ContactRound },
  { nome: 'configuracoes', label: 'Configurações', icon: Settings }
]

function Sidebar(): JSX.Element {
  const { rota, navegar } = useNav()
  // Recarrega o nome da empresa ao trocar de tela (reflete edições nas Configurações).
  const { data: empresa } = useAsync(() => api.empresa.get(), [rota.nome], ['configuracoes'])
  const { data: versao } = useAsync(() => api.aplicativo.versao(), [])
  const [nuvem, setNuvem] = useState<StatusNuvem | null>(null)
  useEffect(() => {
    let vivo = true
    const atualizar = (): void => {
      void api.nuvem
        .status()
        .then((s) => {
          if (vivo) setNuvem(s)
        })
        .catch(() => undefined)
    }
    atualizar()
    const remover = api.eventos.observarDados((evento) => {
      if (evento.status) atualizar()
    })
    const timer = setInterval(atualizar, 5000)
    return () => {
      vivo = false
      clearInterval(timer)
      remover()
    }
  }, [])
  const nomeEmpresa = empresa
    ? empresa.nomeExibicao === 'razaoSocial'
      ? empresa.razaoSocial
      : empresa.nome
    : ''
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
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
            rota.nome === item.nome ||
            (item.nome === 'historico' && rota.nome === 'editor') ||
            (item.nome === 'historicoRelatorios' && rota.nome === 'editorRelatorio')
          return (
            <button
              key={item.nome}
              onClick={() => navegar({ nome: item.nome })}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal/40',
                ativo ? 'bg-brand-teal/10 text-brand-tealDark' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <AppIcon icon={item.icon} size="lg" />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-slate-200 px-5 py-3 text-[11px] text-slate-400">
        v{versao ?? '…'} · base da empresa
        <button
          className="mt-1 block rounded-lg text-left text-slate-600 hover:text-brand-tealDark focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
          onClick={() => navegar({ nome: 'configuracoes' })}
        >
          {nuvem?.configurada
            ? nuvem.conflitos.length
              ? 'Conflito de sincronização'
              : nuvem.erro
                ? 'Offline / sincronização pendente'
                : nuvem.pendentes
                  ? `${nuvem.pendentes} alterações para sincronizar`
                  : 'Nuvem sincronizada'
            : 'Dados neste computador'}
        </button>
      </div>
    </aside>
  )
}

function Conteudo(): JSX.Element {
  const { rota, revisaoRota } = useNav()
  switch (rota.nome) {
    case 'historico':
      return <HistoricoPage />
    case 'editor':
      return <EditorOrcamentoPage key={rota.orcamentoId ?? 'novo'} orcamentoId={rota.orcamentoId} />
    case 'historicoRelatorios':
      return <HistoricoRelatoriosPage />
    case 'editorRelatorio':
      return <EditorRelatorioPage key={rota.relatorioId ?? 'novo'} relatorioId={rota.relatorioId} />
    case 'recibos':
      return (
        <RecibosPage
          key={`${revisaoRota}:${rota.reciboId ?? rota.origem?.id ?? 'lista'}`}
          reciboId={rota.reciboId}
          origemDocumento={rota.origem}
        />
      )
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
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-100">
          <Conteudo />
        </main>
      </div>
    </NavProvider>
  )
}

export default App
