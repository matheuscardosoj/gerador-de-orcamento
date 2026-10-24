import { MensagemFlutuante } from './MensagemFlutuante'
import { useConta } from './ContaGate'
import { consultarEdicao, aceitarEstadoEdicao, estadoEdicaoAtual } from '../lib/controle-edicao'
import { mensagemErro } from '@shared/erros'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudDownload,
  GitCompareArrows,
  Save,
  UnlockKeyhole,
  UsersRound,
  ArrowLeft
} from 'lucide-react'
import type {
  Documento,
  TipoDocumento,
  ControleEdicao,
  StatusNuvem,
  RascunhoCompartilhado,
  ComparacaoRascunho,
  RevisaoRecebimentos
} from '@shared/evolucao'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import { Button, Card, SectionTitle, Modal, Mensagem, Badge, ConfirmDialog } from '../ui/primitives'
import { TabelaRascunhos, PainelComparacao } from './colaboracao/rascunhos'
import { RecebimentosPendentes } from './colaboracao/financeiro'
import { ControleDaEdicao } from './colaboracao/controle'
import { notificar, concluirNotificacao } from '../lib/notificacoes'
import type { ReactElement } from 'react'

/** O controle de edição e os rascunhos nunca executam recebimentos implicitamente. */
export function ColaboracaoDocumento({
  tipo,
  documento,
  sujo,
  rascunhoId,
  onSalvar,
  onAbrir
}: {
  tipo: TipoDocumento
  documento: Documento
  sujo: boolean
  rascunhoId?: string
  onSalvar?: () => Promise<Documento | null>
  onAbrir: (documento: Documento, rascunhoId?: string) => void
}): ReactElement | null {
  const { navegar, navegarAposSalvar, executarComConfirmacao } = useNav()
  const { conta } = useConta()
  const empresaId = conta.empresa?.id ?? ''
  const contexto = JSON.stringify([empresaId, tipo, documento.id, rascunhoId])
  const contextoAtual = useRef(contexto)
  contextoAtual.current = contexto
  const [status, setStatus] = useState<StatusNuvem | null>(null)
  const [controle, setControle] = useState<ControleEdicao | null>(null)
  const definirControle = useCallback(
    (valor: ControleEdicao | null): void => {
      if (contextoAtual.current !== contexto) return
      const atual = estadoEdicaoAtual(empresaId, tipo, documento.id)
      setControle(atual ? atual.controle : valor)
    },
    [contexto, empresaId, tipo, documento.id]
  )
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(false),
    [ocupado, setOcupado] = useState(false)
  const [rascunhos, setRascunhos] = useState<RascunhoCompartilhado[]>([])
  const [excluir, setExcluir] = useState<RascunhoCompartilhado | null>(null)
  const [voltar, setVoltar] = useState(false)
  const [comparacao, setComparacao] = useState<ComparacaoRascunho | null>(null)
  const [recebimentos, setRecebimentos] = useState<RevisaoRecebimentos | null>(null)
  const [confirmarFinanceiro, setConfirmarFinanceiro] = useState<'reaplicar' | 'arquivar' | null>(
    null
  )
  const [escolhas, setEscolhas] = useState<Record<string, 'local' | 'remoto'>>({})
  const [recuperar, setRecuperar] = useState(false),
    [destino, setDestino] = useState('')
  const [computadores, setComputadores] = useState<Array<{ id: string; nome: string }>>([])
  const aguardandoConfirmacao = useRef(false)
  const vivo = useRef(true)
  const renovarRef = useRef<() => Promise<void>>(async () => {})
  const abrirPainelRef = useRef<() => void>(() => {})
  const executar = async (tarefa: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await tarefa()
    } catch (e) {
      if (vivo.current) {
        const mensagem = mensagemErro(e)
        if (mensagem.includes('aguarda confirmação da nuvem')) {
          aguardandoConfirmacao.current = true
          notificar(mensagem, 'aviso', { chave: `rascunho-envio:${tipo}:${documento.id}` })
          setRascunhos(await api.rascunhos.list(tipo, documento.id))
          setComparacao(null)
        } else setErro(mensagem)
      }
    } finally {
      if (vivo.current) setOcupado(false)
    }
  }
  renovarRef.current = async () => {
    const s = await api.nuvem.status()
    if (!vivo.current) return
    setStatus(s)
    if ((s.protocolo ?? 1) >= 2 && s.autenticada && documento.id) {
      const c = await consultarEdicao(tipo, documento.id)
      if (vivo.current) definirControle(c)
    }
  }
  useEffect(() => {
    vivo.current = true
    if (documento.id && !rascunhoId) void api.colaboracao.acompanhar(tipo, documento.id, true)
    let ativo = true
    const iniciar = async (): Promise<void> => {
      const s = await api.nuvem.status()
      if (!ativo) return
      setStatus(s)
      if (!documento.id || (s.protocolo ?? 1) < 2 || !s.autenticada) return
      const c = await consultarEdicao(tipo, documento.id)
      if (!ativo) return
      definirControle(c)
      const livre = !c || (!c.offline && (!c.expiraEm || Date.parse(c.expiraEm) <= Date.now()))
      if (!rascunhoId && (livre || c?.podeEditar)) {
        const adquirido = await consultarEdicao(tipo, documento.id, 'adquirir')
        if (ativo) definirControle(adquirido)
      }
    }
    void iniciar().catch(() => undefined)
    const cancelar = api.eventos.observarDados((e) => {
      if (e.controleEdicao) {
        const estado = aceitarEstadoEdicao(e.controleEdicao)
        if (estado && ativo && estado.tipo === tipo && estado.documentoId === documento.id)
          definirControle(estado.controle)
        return
      }
      if (e.status || e.entidades.includes(`controle:${tipo}:${documento.id}`)) {
        void renovarRef.current().catch(() => undefined)
        void api.rascunhos
          .list(tipo, documento.id)
          .then((lista) => {
            if (ativo) {
              setRascunhos(lista)
              if (
                aguardandoConfirmacao.current &&
                !lista.some((r) => r.estado === 'aguardando_confirmacao')
              ) {
                aguardandoConfirmacao.current = false
                concluirNotificacao(`rascunho-envio:${tipo}:${documento.id}`)
                notificar(
                  lista.some((r) => r.estado === 'conflito' || r.estado === 'envio_interrompido')
                    ? 'O envio do rascunho precisa de revisão. Suas alterações estão preservadas.'
                    : 'Aplicação do rascunho confirmada na nuvem.',
                  lista.some((r) => r.estado === 'conflito' || r.estado === 'envio_interrompido')
                    ? 'aviso'
                    : 'sucesso'
                )
              }
            }
          })
          .catch(() => undefined)
      }
    })
    return () => {
      ativo = false
      vivo.current = false
      cancelar()
      if (documento.id && !rascunhoId)
        void api.colaboracao.acompanhar(tipo, documento.id, false).catch(() => undefined)
    }
  }, [tipo, documento.id, rascunhoId, definirControle])
  // A liberação no encerramento é feita pelo main, após salvar/enviar pendências.
  const controlar = (acao: Parameters<typeof api.colaboracao.edicao>[2], pc?: string): void => {
    executarComConfirmacao(
      () =>
        void executar(async () => {
          if (acao === 'solicitar') {
            const antes = await consultarEdicao(tipo, documento.id)
            if (antes?.pedidoPendente) {
              definirControle(antes)
              notificar('Seu pedido de edição já está aguardando o responsável.', 'info')
              return
            }
          }
          const c = await consultarEdicao(tipo, documento.id, acao, pc)
          definirControle(c)
          if (acao === 'solicitar' && c?.podeEditar) {
            await api.nuvem.sincronizar()
            const atual =
              tipo === 'orcamento'
                ? await api.orcamentos.get(documento.id)
                : tipo === 'relatorio'
                  ? await api.relatorios.get(documento.id)
                  : await api.recibos.get(documento.id)
            if (atual && vivo.current) onAbrir(atual)
          }
          setRecuperar(false)
          if (acao === 'solicitar' && !c?.podeEditar)
            notificar('Solicitação de edição enviada ao responsável.', 'info')
          else
            notificar(
              acao === 'solicitar'
                ? 'Edição liberada neste computador.'
                : 'Controle de edição atualizado.',
              'sucesso'
            )
        })
    )
  }
  const abrirRascunhos = (): void => {
    void executar(async () => {
      setRascunhos(await api.rascunhos.list(tipo, documento.id))
      setComparacao(null)
      setRecebimentos(null)
      setConfirmarFinanceiro(null)
      setAberto(true)
      // O aviso global pode abrir o painel antes de terminar a primeira consulta da tela.
      const atual = await api.nuvem.status()
      if (!vivo.current) return
      setStatus(atual)
      if ((atual.protocolo ?? 1) >= 2) setComputadores(await api.nuvem.dispositivos())
    })
  }
  abrirPainelRef.current = abrirRascunhos
  useEffect(() => {
    const evento = (e: Event): void => {
      const detalhe = (e as CustomEvent<{ tipo: TipoDocumento; id: string; chave?: string }>).detail
      if (detalhe?.tipo === tipo && detalhe.id === documento.id) {
        abrirPainelRef.current()
      }
    }
    window.addEventListener('gdo:abrir-colaboracao', evento)
    const valorPendente = window.sessionStorage.getItem('gdo:abrir-colaboracao-pendente')
    if (valorPendente) {
      try {
        const pendente = JSON.parse(valorPendente) as {
          tipo?: TipoDocumento
          id?: string
          chave?: string
        }
        if (pendente.tipo === tipo && pendente.id === documento.id)
          evento(new CustomEvent('gdo:abrir-colaboracao', { detail: pendente }))
      } catch {
        window.sessionStorage.removeItem('gdo:abrir-colaboracao-pendente')
      }
    }
    return () => window.removeEventListener('gdo:abrir-colaboracao', evento)
  }, [tipo, documento.id])
  useEffect(() => {
    if (!aberto) return
    const valor = window.sessionStorage.getItem('gdo:abrir-colaboracao-pendente')
    if (!valor) return
    try {
      const pendente = JSON.parse(valor) as { tipo?: TipoDocumento; id?: string; chave?: string }
      if (pendente.tipo !== tipo || pendente.id !== documento.id) return
      window.sessionStorage.removeItem('gdo:abrir-colaboracao-pendente')
      if (pendente.chave)
        window.dispatchEvent(
          new CustomEvent('gdo:painel-colaboracao-aberto', { detail: { chave: pendente.chave } })
        )
    } catch {
      window.sessionStorage.removeItem('gdo:abrir-colaboracao-pendente')
    }
  }, [aberto, tipo, documento.id])
  if (!documento.id || (!rascunhoId && (status?.protocolo ?? 1) < 2)) return null
  const guardar = (): void => {
    void executar(async () => {
      const r = rascunhoId
        ? await api.rascunhos.save(rascunhoId, documento)
        : await api.rascunhos.create(tipo, documento.id, documento)
      onAbrir(r.documento, r.id)
      notificar(
        'Rascunho guardado neste computador. O documento da empresa e seus pagamentos não foram alterados.',
        'sucesso'
      )
    })
  }
  const abrirDocumento = (d: Documento): void => {
    onAbrir(d)
    setAberto(false)
  }
  const voltarAoPrincipal = async (guardarAntes: boolean): Promise<void> => {
    if (guardarAntes && rascunhoId) await api.rascunhos.save(rascunhoId, documento)
    const principal =
      tipo === 'orcamento'
        ? await api.orcamentos.get(documento.id)
        : tipo === 'relatorio'
          ? await api.relatorios.get(documento.id)
          : await api.recibos.get(documento.id)
    if (!principal) {
      setVoltar(false)
      setAberto(false)
      notificar(
        'O documento principal foi excluído. Os rascunhos mantidos podem ser recuperados no histórico.',
        'aviso'
      )
      navegarAposSalvar(
        tipo === 'orcamento'
          ? { nome: 'historico' }
          : tipo === 'relatorio'
            ? { nome: 'historicoRelatorios' }
            : { nome: 'recibos' }
      )
      return
    }
    onAbrir(principal)
    setVoltar(false)
  }
  const reciboProtegido =
    comparacao?.remoto &&
    tipo === 'recibo' &&
    ['recebido', 'cancelado'].includes(comparacao.remoto.status)
  const comparar = async (r: RascunhoCompartilhado): Promise<void> => {
    setComparacao(await api.rascunhos.comparar(r.id))
    setEscolhas({})
  }
  return (
    <>
      <Card className="p-6">
        <SectionTitle
          title={rascunhoId ? 'Rascunho de trabalho' : 'Edição compartilhada'}
          description={
            rascunhoId
              ? 'Salve aqui seu trabalho; compare com a empresa antes de aplicar. Operações financeiras continuam separadas.'
              : 'Alterações salvas são compartilhadas. O bloqueio de edição evita sobrescritas entre usuários.'
          }
          action={
            <Badge color={rascunhoId ? 'amber' : controle?.podeEditar ? 'green' : 'slate'}>
              {rascunhoId
                ? 'Rascunho local'
                : controle?.podeEditar
                  ? controle.offline
                    ? 'Preparado offline'
                    : 'Você está editando'
                  : 'Consulta / rascunho'}
            </Badge>
          }
        />
        {controle && (
          <p className="mb-4 text-sm text-slate-500">
            Responsável pela edição: {controle.usuarioNome || 'Usuário'} ·{' '}
            {controle.computador === status?.computador
              ? 'Este computador'
              : controle.computador.slice(0, 8)}
            {controle.offline ? ' · autorização offline exclusiva' : ''}
          </p>
        )}
        {controle?.podeEditar && !!controle.solicitacoes?.length && (
          <Mensagem tom="aviso" className="mb-4">
            {controle.solicitacoes
              .map((p) => `${p.usuarioNome} (${p.computador.slice(0, 8)})`)
              .join(', ')}{' '}
            solicitou edição. Salve e libere o documento ou transfira o controle para esse
            computador.
            <div className="mt-3 flex flex-wrap gap-2">
              {controle.solicitacoes.map((p) => (
                <Button
                  key={p.computador}
                  size="sm"
                  variant="outline"
                  disabled={ocupado || (sujo && !onSalvar)}
                  onClick={() =>
                    void executar(async () => {
                      if (sujo && onSalvar && !(await onSalvar()))
                        throw new Error('Salve as alterações antes de transferir a edição.')
                      const atualizado = await consultarEdicao(
                        tipo,
                        documento.id,
                        'transferir',
                        p.computador
                      )
                      definirControle(atualizado)
                      notificar(
                        'Edição transferida. O documento está disponível no computador solicitante.',
                        'sucesso'
                      )
                    })
                  }
                >
                  {sujo ? 'Salvar e transferir' : 'Transferir edição'} para {p.usuarioNome}
                </Button>
              ))}
            </div>
          </Mensagem>
        )}
        {erro && <MensagemFlutuante className="mb-4">{erro}</MensagemFlutuante>}
        <div className="flex flex-wrap gap-2">
          {rascunhoId && (
            <Button
              icon={ArrowLeft}
              variant="outline"
              disabled={ocupado}
              onClick={() =>
                sujo ? setVoltar(true) : void executar(() => voltarAoPrincipal(false))
              }
            >
              Voltar ao documento principal
            </Button>
          )}
          <Button icon={Save} variant="outline" disabled={ocupado} onClick={guardar}>
            {rascunhoId
              ? 'Guardar rascunho'
              : sujo
                ? 'Preservar edição como rascunho'
                : 'Criar rascunho de trabalho'}
          </Button>
          <Button
            icon={GitCompareArrows}
            variant="outline"
            disabled={ocupado}
            onClick={abrirRascunhos}
          >
            Rascunhos e controle
          </Button>
          {!rascunhoId && controle?.podeEditar && (
            <>
              {!controle.offline && (
                <Button
                  icon={CloudDownload}
                  variant="outline"
                  disabled={ocupado || sujo}
                  onClick={() => controlar('offline')}
                >
                  Preparar offline
                </Button>
              )}
              <Button
                icon={UnlockKeyhole}
                variant="outline"
                disabled={ocupado || sujo}
                onClick={() => controlar('liberar')}
              >
                Liberar edição
              </Button>
            </>
          )}
          {!rascunhoId && !controle?.podeEditar && (
            <Button
              icon={UsersRound}
              variant="outline"
              disabled={ocupado}
              onClick={() => controlar(controle?.pedidoPendente ? 'cancelarPedido' : 'solicitar')}
            >
              {controle?.pedidoPendente ? 'Cancelar pedido de edição' : 'Solicitar edição'}
            </Button>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={!!excluir}
        title="Excluir rascunho local?"
        description="Somente este rascunho será removido deste computador. O documento principal e seus pagamentos serão preservados."
        confirmLabel="Excluir rascunho"
        busy={ocupado}
        onCancel={() => !ocupado && setExcluir(null)}
        onConfirm={() =>
          executar(async () => {
            if (!excluir) return
            await api.rascunhos.remove(excluir.id)
            setRascunhos(await api.rascunhos.list(tipo, documento.id))
            setComparacao(null)
            setExcluir(null)
            if (rascunhoId === excluir.id) await voltarAoPrincipal(false)
          })
        }
      />
      <Modal
        open={voltar}
        onClose={() => !ocupado && setVoltar(false)}
        title="Voltar ao documento principal"
        footer={
          <>
            <Button variant="secondary" disabled={ocupado} onClick={() => setVoltar(false)}>
              Continuar no rascunho
            </Button>
            <Button
              variant="outline"
              disabled={ocupado}
              onClick={() => void executar(() => voltarAoPrincipal(false))}
            >
              Descartar alterações não salvas
            </Button>
            <Button disabled={ocupado} onClick={() => void executar(() => voltarAoPrincipal(true))}>
              Guardar e voltar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Escolha como tratar as alterações feitas desde o último salvamento do rascunho.
        </p>
      </Modal>
      <Modal
        open={aberto}
        onClose={() => !ocupado && setAberto(false)}
        title="Rascunhos e controle de edição"
        size="xl"
        footer={
          <Button variant="secondary" disabled={ocupado} onClick={() => setAberto(false)}>
            Fechar
          </Button>
        }
      >
        <div className="pilha-y-5">
          <SectionTitle
            title="Rascunhos deste computador"
            description="Alternativas preservadas a partir de uma revisão conhecida. Salvar um rascunho não registra pagamento nem altera o documento compartilhado."
          />
          <TabelaRascunhos
            rascunhos={rascunhos}
            ocupado={ocupado}
            onExcluir={setExcluir}
            onEditar={(r) =>
              executarComConfirmacao(() => {
                onAbrir(r.documento, r.id)
                setAberto(false)
              })
            }
            onComparar={(r) => void executar(() => comparar(r))}
          />
          {comparacao && (
            <PainelComparacao
              comparacao={comparacao}
              escolhas={escolhas}
              ocupado={ocupado}
              reciboProtegido={!!reciboProtegido}
              onEscolher={(caminho, valor) => setEscolhas({ ...escolhas, [caminho]: valor })}
              onAplicar={() =>
                executarComConfirmacao(
                  () =>
                    void executar(async () =>
                      abrirDocumento(
                        await api.rascunhos.aplicar(
                          comparacao.rascunho.id,
                          comparacao.revisaoRemota,
                          escolhas
                        )
                      )
                    )
                )
              }
              onCriarNovo={() =>
                executarComConfirmacao(
                  () =>
                    void executar(async () => {
                      const d = await api.rascunhos.copiar(comparacao.rascunho.id)
                      setAberto(false)
                      navegar(
                        tipo === 'orcamento'
                          ? { nome: 'editor', orcamentoId: d.id }
                          : tipo === 'relatorio'
                            ? { nome: 'editorRelatorio', relatorioId: d.id }
                            : { nome: 'recibos', reciboId: d.id }
                      )
                    })
                )
              }
            />
          )}
          {(status?.protocolo ?? 1) >= 2 && (
            <div className="pilha-y-4 border-t border-slate-200 pt-5">
              <RecebimentosPendentes
                tipo={tipo}
                recebimentos={recebimentos}
                confirmarFinanceiro={confirmarFinanceiro}
                ocupado={ocupado}
                sujo={sujo}
                onRevisar={() =>
                  void executar(async () =>
                    setRecebimentos(await api.colaboracao.revisarRecebimentos(tipo, documento.id))
                  )
                }
                onEscolher={setConfirmarFinanceiro}
                onConfirmar={() =>
                  void executar(async () => {
                    if (!recebimentos || !confirmarFinanceiro) return
                    await api.colaboracao.conciliarRecebimentos(recebimentos, confirmarFinanceiro)
                    setRecebimentos(null)
                    setConfirmarFinanceiro(null)
                    notificar(
                      'Operações conferidas; os registros originais foram preservados.',
                      'sucesso'
                    )
                    const d = await (tipo === 'recibo'
                      ? api.recibos.get(documento.id)
                      : api.relatorios.get(documento.id))
                    if (d) onAbrir(d)
                    setAberto(false)
                  })
                }
              />
              <ControleDaEdicao
                controle={controle}
                status={status}
                computadores={computadores}
                destino={destino}
                recuperar={recuperar}
                ocupado={ocupado}
                sujo={sujo}
                onDestino={setDestino}
                onRecuperar={setRecuperar}
                onControlar={controlar}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
