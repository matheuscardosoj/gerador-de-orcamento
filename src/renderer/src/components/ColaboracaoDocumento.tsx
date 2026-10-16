import { MensagemFlutuante } from './MensagemFlutuante'
import { useConta } from './ContaGate'
import { consultarEdicao, aceitarEstadoEdicao, estadoEdicaoAtual } from '../lib/controle-edicao'
import { mensagemErro } from '@shared/erros'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  CloudDownload,
  CopyPlus,
  GitCompareArrows,
  LockKeyhole,
  Save,
  UnlockKeyhole,
  UsersRound,
  Pencil,
  Trash2,
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
import { compararDocumentos } from '@shared/comparacao-documentos'
import { formatMoeda } from '@shared/format'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import {
  Button,
  Card,
  SectionTitle,
  Modal,
  Field,
  Select,
  Mensagem,
  Badge,
  ConfirmDialog
} from '../ui/primitives'
import { DataTableViewport } from '../ui/dataTable'
import { notificar, concluirNotificacao } from '../lib/notificacoes'

const rotuloCampo = (campo: string): string =>
  campo
    .split('.')
    .map(
      (p) =>
        ({
          descricao: 'Descrição',
          preco: 'Preço e cálculo do serviço',
          observacao: 'Observação',
          observacaoInterna: 'Anotação interna',
          introducao: 'Introdução',
          destinatario: 'Cliente',
          valor: 'Valor',
          valorUnitario: 'Valor unitário',
          quantidade: 'Quantidade',
          itensServico: 'Serviços',
          pagamentos: 'Condições de pagamento',
          observacoes: 'Observações',
          materiais: 'Materiais',
          anexos: 'Fotos',
          __ordem: 'Ordem dos itens',
          status: 'Estado',
          quitacao: 'Quitação',
          adiantamentos: 'Adiantamentos',
          reembolsos: 'Reembolsos'
        })[p] ?? (p.length > 30 ? 'Item' : p)
    )
    .join(' / ')
function texto(v: unknown): string {
  if (v === undefined || v === null) return 'Ausente'
  if (typeof v === 'string') return v || 'Vazio'
  return JSON.stringify(v, null, 2)
}
function trechoComputador(id: string, ids: string[]): string {
  let tamanho = 8
  while (
    tamanho < id.length &&
    ids.some((outro) => outro !== id && outro.startsWith(id.slice(0, tamanho)))
  )
    tamanho += 1
  return id.slice(0, tamanho)
}

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
}): JSX.Element | null {
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
        <div className="space-y-5">
          <SectionTitle
            title="Rascunhos deste computador"
            description="Alternativas preservadas a partir de uma revisão conhecida. Salvar um rascunho não registra pagamento nem altera o documento compartilhado."
          />
          {rascunhos.length ? (
            <DataTableViewport minWidth="660px">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3">Revisão de partida</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="w-72 px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rascunhos.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {new Date(r.atualizadoEm).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">{r.baseRevisao}</td>
                    <td className="px-4 py-3">
                      <Badge color={r.estado === 'conflito' ? 'amber' : 'slate'}>
                        {r.estado === 'envio_interrompido'
                          ? 'Envio precisa de revisão'
                          : r.estado === 'aguardando_confirmacao'
                            ? 'Aguardando confirmação da nuvem'
                            : r.estado === 'conflito'
                              ? 'Conflito'
                              : 'Local'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          icon={Trash2}
                          size="sm"
                          variant="outline"
                          disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                          onClick={() => setExcluir(r)}
                        >
                          Excluir rascunho
                        </Button>
                        <Button
                          icon={Pencil}
                          size="sm"
                          variant="outline"
                          disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                          onClick={() =>
                            executarComConfirmacao(() => {
                              onAbrir(r.documento, r.id)
                              setAberto(false)
                            })
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          icon={GitCompareArrows}
                          size="sm"
                          variant="outline"
                          disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                          onClick={() => void executar(() => comparar(r))}
                        >
                          Comparar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTableViewport>
          ) : (
            <p className="text-sm text-slate-500">
              Não há rascunhos guardados para este documento.
            </p>
          )}
          {comparacao && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <SectionTitle
                title="Comparar com a versão da empresa"
                description={`Revisão atual: ${comparacao.revisaoRemota}. Alterações em campos diferentes são combinadas; disputas precisam da sua escolha.`}
              />
              {!comparacao.remoto && (
                <Mensagem tom="aviso">
                  O documento foi excluído. Preserve este trabalho criando um novo documento.
                </Mensagem>
              )}
              {comparacao.conflitos.map((c) => (
                <Card key={c.caminho} className="p-4">
                  <p className="mb-3 font-medium text-slate-700">
                    {rotuloCampo(c.caminho)}{' '}
                    {c.financeiro && <Badge color="amber">Revisar valores / condições</Badge>}
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(
                      [
                        ['Partida', c.base],
                        ['Seu rascunho', c.local],
                        ['Empresa', c.remoto]
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label}>
                        <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
                          {texto(v)}
                        </pre>
                      </div>
                    ))}
                  </div>
                  <Field label="Usar neste campo">
                    <Select
                      value={escolhas[c.caminho] ?? ''}
                      onChange={(e) =>
                        setEscolhas({
                          ...escolhas,
                          [c.caminho]: e.target.value as 'local' | 'remoto'
                        })
                      }
                    >
                      <option value="">Escolha uma alternativa</option>
                      <option value="local">Seu rascunho</option>
                      <option value="remoto">Versão da empresa</option>
                    </Select>
                  </Field>
                </Card>
              ))}
              {!!comparacao.remoto && (
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <DataTableViewport minWidth="640px">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Mudança independente</th>
                        <th className="px-4 py-3">Empresa</th>
                        <th className="px-4 py-3">Resultado combinado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {compararDocumentos(comparacao.remoto, comparacao.documento).map((d) => (
                        <tr key={d.campo}>
                          <th className="px-4 py-3 text-left font-medium">{d.campo}</th>
                          <td className="break-words px-4 py-3">{d.anterior}</td>
                          <td className="break-words px-4 py-3">{d.atual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTableViewport>
                </div>
              )}
              <Mensagem tom="info">
                Recebimentos, estornos e quitação não são desfeitos por esta comparação. Uma nova
                revisão preserva todas as anteriores.
              </Mensagem>
              {reciboProtegido && (
                <Mensagem tom="info">
                  Este recibo já foi confirmado ou cancelado. Para corrigir, use cancelamento e crie
                  uma cobrança substituta. O rascunho pode ser comparado, copiado ou excluído.
                </Mensagem>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={Save}
                  disabled={
                    ocupado ||
                    !!reciboProtegido ||
                    !comparacao.remoto ||
                    comparacao.conflitos.some((c) => !escolhas[c.caminho])
                  }
                  onClick={() =>
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
                >
                  Aplicar como nova revisão
                </Button>
                <Button
                  icon={CopyPlus}
                  variant="outline"
                  disabled={ocupado}
                  onClick={() =>
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
                >
                  Criar novo documento
                </Button>
              </div>
            </div>
          )}
          {(status?.protocolo ?? 1) >= 2 && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              {(tipo === 'recibo' || tipo === 'relatorio') && (
                <>
                  <SectionTitle
                    title="Recebimentos pendentes"
                    description="Revise operações que não receberam confirmação da nuvem. A conciliação de textos não altera pagamentos."
                  />
                  <Button
                    variant="outline"
                    disabled={ocupado}
                    onClick={() =>
                      void executar(async () =>
                        setRecebimentos(
                          await api.colaboracao.revisarRecebimentos(tipo, documento.id)
                        )
                      )
                    }
                  >
                    Revisar recebimentos
                  </Button>
                  {recebimentos && (
                    <>
                      {recebimentos.operacoes.length ? (
                        <DataTableViewport minWidth="700px">
                          <thead className="bg-slate-50 text-left text-xs text-slate-500">
                            <tr>
                              <th className="w-24 px-4 py-3">Recibo</th>
                              <th className="w-32 px-4 py-3">Operação</th>
                              <th className="w-32 px-4 py-3">Valor</th>
                              <th className="px-4 py-3">Conferência</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {recebimentos.operacoes.map((o) => (
                              <tr key={o.reciboId}>
                                <td className="px-4 py-3">{o.numero}</td>
                                <td className="px-4 py-3">
                                  {o.acao === 'confirmar'
                                    ? 'Recebimento'
                                    : o.excluir
                                      ? 'Estorno e exclusão'
                                      : 'Estorno'}
                                </td>
                                <td className="px-4 py-3">{formatMoeda(o.valor)}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-700">{o.cliente}</p>
                                  <p className="mt-1 text-slate-500">{o.detalhe}</p>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTableViewport>
                      ) : (
                        <p className="text-sm text-slate-500">
                          Não há recebimentos pendentes neste conjunto.
                        </p>
                      )}
                      {!!recebimentos.operacoes.length && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={
                              ocupado ||
                              recebimentos.operacoes.some((o) => o.situacao === 'divergente')
                            }
                            onClick={() => setConfirmarFinanceiro('reaplicar')}
                          >
                            Confirmar operações revisadas
                          </Button>
                          <Button
                            variant="outline"
                            disabled={ocupado}
                            onClick={() => setConfirmarFinanceiro('arquivar')}
                          >
                            Arquivar pendências locais
                          </Button>
                        </div>
                      )}
                      {confirmarFinanceiro && (
                        <Mensagem tom="aviso">
                          <p className="mb-3">
                            {confirmarFinanceiro === 'reaplicar'
                              ? 'As operações serão refeitas sobre o saldo atual, com autorização e nova transação. O que a nuvem já confirmou não será contabilizado novamente.'
                              : 'As operações locais ainda não confirmadas serão arquivadas com backup, rascunhos e registro de auditoria. Os pagamentos confirmados na empresa permanecem iguais. Se houve recebimento físico divergente, prepare um novo recibo após revisar.'}{' '}
                            As alterações de conteúdo locais ficarão em rascunhos para comparação
                            separada.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={ocupado || sujo}
                              onClick={() =>
                                void executar(async () => {
                                  await api.colaboracao.conciliarRecebimentos(
                                    recebimentos,
                                    confirmarFinanceiro
                                  )
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
                            >
                              Confirmar revisão financeira
                            </Button>
                            <Button variant="outline" onClick={() => setConfirmarFinanceiro(null)}>
                              Voltar
                            </Button>
                          </div>
                        </Mensagem>
                      )}
                    </>
                  )}
                </>
              )}
              <SectionTitle
                title="Controle da edição"
                description="A emissão offline é exclusiva. Recuperar revoga a autorização anterior; alterações de computadores desconectados serão conciliadas quando retornarem."
              />
              <div className="flex flex-wrap items-end gap-3">
                {controle?.podeEditar && (
                  <>
                    <Field label="Transferir para">
                      <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                        <option value="">Escolha o computador</option>
                        {computadores.map((c) => {
                          const atual = c.id === status?.computador
                          return (
                            <option value={c.id} key={c.id} title={c.id} disabled={atual}>
                              {c.nome} ·{' '}
                              {trechoComputador(
                                c.id,
                                computadores.map((item) => item.id)
                              )}
                              {atual ? ' (este computador)' : ''}
                            </option>
                          )
                        })}
                      </Select>
                    </Field>
                    <Button
                      variant="outline"
                      icon={ArrowRightLeft}
                      disabled={!destino || ocupado || sujo}
                      onClick={() => controlar('transferir', destino)}
                    >
                      Transferir controle
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  icon={LockKeyhole}
                  disabled={ocupado}
                  onClick={() => setRecuperar(true)}
                >
                  Recuperar controle
                </Button>
              </div>
              {recuperar && (
                <Mensagem tom="aviso">
                  <p className="mb-3">
                    A autorização anterior será revogada no servidor. Um computador desconectado só
                    receberá a revogação ao reconectar, e seus números reservados não serão
                    reutilizados. Preserve seu rascunho antes de continuar.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={ocupado || sujo} onClick={() => controlar('recuperar')}>
                      Confirmar recuperação
                    </Button>
                    <Button variant="outline" onClick={() => setRecuperar(false)}>
                      Voltar
                    </Button>
                  </div>
                </Mensagem>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
