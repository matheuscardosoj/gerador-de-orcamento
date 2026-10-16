import { consultarEdicao, aceitarEstadoEdicao } from './lib/controle-edicao'
import { RecibosPage } from './pages/RecibosPage'
import { ContaGate, useConta } from './components/ContaGate'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StatusNuvem } from '@shared/types'
import { resumirSincronizacao } from '@shared/status-sincronizacao'
import { mensagemErro } from '@shared/erros'
import { NavProvider, useNav, type Rota } from './lib/nav'
import { cn, AppIcon } from './ui/primitives'
import {
  ClipboardList,
  ContactRound,
  FileText,
  ReceiptText,
  Settings,
  RefreshCw,
  LogOut,
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
import { notificar, concluirNotificacao, atualizarAcaoNotificacao } from './lib/notificacoes'
import { CicloPedidosEdicao, pedidosAtuais } from './lib/pedidos-edicao'
import type { ControleEdicao } from '@shared/evolucao'

const itens: Array<{ nome: Rota['nome']; label: string; icon: LucideIcon }> = [
  { nome: 'historico', label: 'Orçamentos', icon: FileText },
  { nome: 'historicoRelatorios', label: 'Relatórios', icon: ClipboardList },
  { nome: 'recibos', label: 'Recibos', icon: ReceiptText },
  { nome: 'cadastros', label: 'Cadastros', icon: ContactRound },
  { nome: 'configuracoes', label: 'Configurações', icon: Settings }
]

function Sidebar(): JSX.Element {
  const { rota, navegar, avisar, executarComConfirmacao } = useNav()
  const { atualizar } = useConta()
  // Recarrega o nome da empresa ao trocar de tela (reflete edições nas Configurações).
  const { data: empresa } = useAsync(() => api.empresa.get(), [rota.nome], ['configuracoes'])
  const { data: versao } = useAsync(() => api.aplicativo.versao(), [])
  const [nuvem, setNuvem] = useState<StatusNuvem | null>(null)
  const [acao, setAcao] = useState<'sincronizar' | 'sair' | null>(null)
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
      <div className="border-t border-slate-200 px-3 py-3 text-[11px] text-slate-400">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={acao !== null}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 disabled:opacity-50"
            onClick={() => {
              setAcao('sincronizar')
              void api.nuvem
                .sincronizar()
                .then((status) => {
                  setNuvem(status)
                  avisar(
                    status.erro || 'Sincronização concluída.',
                    status.erro ? 'erro' : 'sucesso'
                  )
                })
                .catch((e) => avisar(mensagemErro(e), 'erro'))
                .finally(() => setAcao(null))
            }}
          >
            <AppIcon icon={RefreshCw} size="sm" />
            {acao === 'sincronizar' ? 'Aguarde…' : 'Sincronizar'}
          </button>
          <button
            type="button"
            disabled={acao !== null}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 disabled:opacity-50"
            onClick={() =>
              executarComConfirmacao(() => {
                setAcao('sair')
                void api.conta
                  .sair()
                  .then(atualizar)
                  .catch((e) => avisar(mensagemErro(e), 'erro'))
                  .finally(() => setAcao(null))
              })
            }
          >
            <AppIcon icon={LogOut} size="sm" />
            Sair
          </button>
        </div>
        v{versao ?? '…'} · base da empresa
        <button
          className="mt-1 block rounded-lg text-left text-slate-600 hover:text-brand-tealDark focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
          onClick={() => navegar({ nome: 'configuracoes', aba: 'nuvem' })}
        >
          {resumirSincronizacao(nuvem).titulo}
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
      return (
        <EditorOrcamentoPage
          key={`${revisaoRota}:${rota.orcamentoId ?? 'novo'}`}
          orcamentoId={rota.orcamentoId}
        />
      )
    case 'historicoRelatorios':
      return <HistoricoRelatoriosPage />
    case 'editorRelatorio':
      return (
        <EditorRelatorioPage
          key={`${revisaoRota}:${rota.relatorioId ?? 'novo'}`}
          relatorioId={rota.relatorioId}
        />
      )
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
      return <ConfiguracoesPage key={revisaoRota} />
    default:
      return <HistoricoPage />
  }
}

function RecepcaoPedidosEdicao(): null {
  const { conta } = useConta()
  const empresaId = conta.empresa?.id
  const { navegarAposSalvar, executarComConfirmacao } = useNav()
  const ciclo = useRef(new CicloPedidosEdicao())
  const ativosRef = useRef(new Set<string>())
  const navegacaoRef = useRef({ navegarAposSalvar, executarComConfirmacao })
  navegacaoRef.current = { navegarAposSalvar, executarComConfirmacao }
  const verificar = useCallback(
    async (continua: () => boolean) => {
      if (conta.fase !== 'pronto' || !empresaId) return
      const status = await api.nuvem.status()
      if (!continua() || (status.protocolo ?? 1) < 2) return
      if (!status.autenticada) throw new Error('Aguarde a conexão para confirmar as solicitações.')
      const acompanhados = await api.colaboracao.acompanhados()
      const ativos = new Map<
        string,
        {
          tipo: 'orcamento' | 'relatorio' | 'recibo'
          id: string
          geracao: number
          pedido: NonNullable<ControleEdicao['solicitacoes']>[number]
        }
      >()
      for (const { tipo, id } of acompanhados) {
        if (!continua()) return
        const controle = (await consultarEdicao(tipo, id)) as ControleEdicao | null
        if (!continua()) return
        const chaves = pedidosAtuais(empresaId, tipo, id, controle)
        for (const chave of [...ativosRef.current]) {
          const partes = JSON.parse(chave)
          if (partes[1] === tipo && partes[2] === id && !chaves.includes(chave))
            ativosRef.current.delete(chave)
        }
        for (const chave of chaves) ativosRef.current.add(chave)
        for (const pedido of controle?.solicitacoes ?? []) {
          const chave = JSON.stringify([
            empresaId,
            tipo,
            id,
            controle?.geracao,
            pedido.computador,
            pedido.criadoEm
          ])
          if (chaves.includes(chave) && controle)
            ativos.set(chave, { tipo, id, geracao: controle.geracao, pedido })
        }
      }
      // Respostas aceitas por outros consumidores podem ter atualizado o documento durante a varredura.
      for (const { tipo, id } of acompanhados) {
        const chaves = [...ativos.keys()].filter((chave) => {
          const partes = JSON.parse(chave)
          return partes[1] === tipo && partes[2] === id
        })
        for (const chave of chaves) if (!ativosRef.current.has(chave)) ativos.delete(chave)
      }
      for (const chave of ativos.keys()) atualizarAcaoNotificacao(chave, false)
      const { novos, removidos } = ciclo.current.reconciliar(ativos.keys())
      for (const chave of removidos) concluirNotificacao(chave)
      for (const chave of novos) {
        const { tipo, id, geracao, pedido } = ativos.get(chave)!
        notificar(
          `${pedido.usuarioNome} (${pedido.computador.slice(0, 8)}) solicitou edição.`,
          'aviso',
          {
            persistente: true,
            chave,
            acao: {
              rotulo: 'Abrir documento e solicitações',
              executar: () =>
                new Promise<boolean>((resolve, reject) => {
                  navegacaoRef.current.executarComConfirmacao(
                    () => {
                      void (async () => {
                        if (!continua()) return false
                        const atual = (await consultarEdicao(tipo, id)) as ControleEdicao | null
                        if (!continua()) return false
                        if (
                          atual?.geracao !== geracao ||
                          !pedidosAtuais(empresaId, tipo, id, atual).includes(chave)
                        ) {
                          concluirNotificacao(chave)
                          notificar(
                            'Esta solicitação já foi encerrada ou o responsável mudou.',
                            'info'
                          )
                          return true
                        }
                        window.sessionStorage.setItem(
                          'gdo:abrir-colaboracao-pendente',
                          JSON.stringify({ tipo, id, chave })
                        )
                        if (tipo === 'orcamento')
                          navegacaoRef.current.navegarAposSalvar({
                            nome: 'editor',
                            orcamentoId: id
                          })
                        else if (tipo === 'relatorio')
                          navegacaoRef.current.navegarAposSalvar({
                            nome: 'editorRelatorio',
                            relatorioId: id
                          })
                        else
                          navegacaoRef.current.navegarAposSalvar({ nome: 'recibos', reciboId: id })
                        window.dispatchEvent(
                          new CustomEvent('gdo:abrir-colaboracao', { detail: { tipo, id, chave } })
                        )
                        return true
                      })().then(resolve, reject)
                    },
                    () => resolve(false)
                  )
                })
            }
          }
        )
      }
    },
    [empresaId, conta.fase]
  )
  useEffect(() => {
    const cicloAtual = ciclo.current
    const ativosAtuais = ativosRef.current
    let ativo = true
    let executando = false
    let pendente = false
    const executar = (): void => {
      if (!ativo) return
      if (executando) {
        pendente = true
        return
      }
      executando = true
      void (async () => {
        do {
          pendente = false
          await verificar(() => ativo)
        } while (ativo && pendente)
      })()
        .catch(() => {
          if (ativo) for (const chave of ativosRef.current) atualizarAcaoNotificacao(chave, true)
        })
        .finally(() => {
          executando = false
        })
    }
    executar()
    const remover = api.eventos.observarDados((evento) => {
      if (evento.controleEdicao) {
        const estado = aceitarEstadoEdicao(evento.controleEdicao)
        if (!estado || estado.empresaId !== empresaId) return
        const atuais = new Set(
          pedidosAtuais(empresaId, estado.tipo, estado.documentoId, estado.controle)
        )
        for (const chave of ativosRef.current) {
          const partes = JSON.parse(chave)
          if (partes[1] === estado.tipo && partes[2] === estado.documentoId && !atuais.has(chave)) {
            ativosRef.current.delete(chave)
            concluirNotificacao(chave)
          }
        }
        for (const chave of atuais) ativosRef.current.add(chave)
        return
      }
      if (evento.status || evento.entidades.some((e) => e.startsWith('controle:'))) executar()
    })
    const timer = window.setInterval(executar, 15000)
    return () => {
      ativo = false
      ativosAtuais.clear()
      for (const chave of cicloAtual.reconciliar([]).removidos) concluirNotificacao(chave)
      window.sessionStorage.removeItem('gdo:abrir-colaboracao-pendente')
      window.clearInterval(timer)
      remover()
    }
  }, [verificar, empresaId])
  return null
}

function App(): JSX.Element {
  return (
    <ContaGate>
      <NavProvider>
        <div className="flex h-full">
          <RecepcaoPedidosEdicao />
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-100">
            <Conteudo />
          </main>
        </div>
      </NavProvider>
    </ContaGate>
  )
}

export default App
