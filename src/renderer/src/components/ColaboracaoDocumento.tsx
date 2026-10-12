import { useEffect, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  CloudDownload,
  CopyPlus,
  GitCompareArrows,
  LockKeyhole,
  Save,
  UnlockKeyhole,
  UsersRound,
  Pencil
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
import { Button, Card, SectionTitle, Modal, Field, Select, Mensagem, Badge } from '../ui/primitives'
import { DataTableViewport } from '../ui/dataTable'

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

/** O controle de edição e os rascunhos nunca executam recebimentos implicitamente. */
export function ColaboracaoDocumento({
  tipo,
  documento,
  sujo,
  rascunhoId,
  onAbrir
}: {
  tipo: TipoDocumento
  documento: Documento
  sujo: boolean
  rascunhoId?: string
  onAbrir: (documento: Documento, rascunhoId?: string) => void
}): JSX.Element | null {
  const { navegar, executarComConfirmacao } = useNav()
  const [status, setStatus] = useState<StatusNuvem | null>(null)
  const [controle, setControle] = useState<ControleEdicao | null>(null)
  const [erro, setErro] = useState(''),
    [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState(false),
    [ocupado, setOcupado] = useState(false)
  const [rascunhos, setRascunhos] = useState<RascunhoCompartilhado[]>([])
  const [comparacao, setComparacao] = useState<ComparacaoRascunho | null>(null)
  const [recebimentos, setRecebimentos] = useState<RevisaoRecebimentos | null>(null)
  const [confirmarFinanceiro, setConfirmarFinanceiro] = useState<'reaplicar' | 'arquivar' | null>(
    null
  )
  const [escolhas, setEscolhas] = useState<Record<string, 'local' | 'remoto'>>({})
  const [recuperar, setRecuperar] = useState(false),
    [destino, setDestino] = useState('')
  const [computadores, setComputadores] = useState<Array<{ id: string; nome: string }>>([])
  const vivo = useRef(true)
  const renovarRef = useRef<() => Promise<void>>(async () => {})
  const executar = async (tarefa: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    setAviso('')
    try {
      await tarefa()
    } catch (e) {
      if (vivo.current) setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      if (vivo.current) setOcupado(false)
    }
  }
  renovarRef.current = async () => {
    const s = await api.nuvem.status()
    if (!vivo.current) return
    setStatus(s)
    if ((s.protocolo ?? 1) >= 2 && s.autenticada && documento.id) {
      const c = await api.colaboracao.edicao(tipo, documento.id)
      if (vivo.current) setControle(c)
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
      const c = await api.colaboracao.edicao(tipo, documento.id)
      if (!ativo) return
      setControle(c)
      const livre = !c || (!c.offline && (!c.expiraEm || Date.parse(c.expiraEm) <= Date.now()))
      if (!rascunhoId && (livre || c?.podeEditar)) {
        const adquirido = await api.colaboracao.edicao(tipo, documento.id, 'adquirir')
        if (ativo) setControle(adquirido)
      }
    }
    void iniciar().catch(() => undefined)
    const cancelar = api.eventos.observarDados((e) => {
      if (e.status || e.entidades.includes(`controle:${tipo}:${documento.id}`))
        void renovarRef.current().catch(() => undefined)
    })
    return () => {
      ativo = false
      vivo.current = false
      cancelar()
      if (documento.id && !rascunhoId)
        void api.colaboracao.acompanhar(tipo, documento.id, false).catch(() => undefined)
    }
  }, [tipo, documento.id, rascunhoId])
  // A liberação no encerramento é feita pelo main, após salvar/enviar pendências.
  if (!documento.id || (!rascunhoId && (status?.protocolo ?? 1) < 2)) return null
  const controlar = (acao: Parameters<typeof api.colaboracao.edicao>[2], pc?: string): void => {
    executarComConfirmacao(
      () =>
        void executar(async () => {
          const c = await api.colaboracao.edicao(tipo, documento.id, acao, pc)
          setControle(c)
          setRecuperar(false)
          setAviso(
            acao === 'solicitar'
              ? 'Pedido de edição registrado para o responsável.'
              : 'Controle atualizado.'
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
      if ((status?.protocolo ?? 1) >= 2) setComputadores(await api.nuvem.dispositivos())
    })
  }
  const guardar = (): void => {
    void executar(async () => {
      const r = rascunhoId
        ? await api.rascunhos.save(rascunhoId, documento)
        : await api.rascunhos.create(tipo, documento.id, documento)
      onAbrir(r.documento, r.id)
      setAviso(
        'Rascunho guardado neste computador. O documento da empresa e seus pagamentos não foram alterados.'
      )
    })
  }
  const abrirDocumento = (d: Documento): void => {
    onAbrir(d)
    setAberto(false)
  }
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
          </Mensagem>
        )}
        {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
        {aviso && (
          <Mensagem tom="info" className="mb-4">
            {aviso}
          </Mensagem>
        )}
        <div className="flex flex-wrap gap-2">
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
              onClick={() => controlar('solicitar')}
            >
              Solicitar edição
            </Button>
          )}
        </div>
      </Card>
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
          {erro && <Mensagem>{erro}</Mensagem>}
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
                        {r.estado === 'conflito' ? 'Conflito' : 'Local'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          icon={Pencil}
                          size="sm"
                          variant="outline"
                          disabled={ocupado}
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
                          disabled={ocupado}
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
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={Save}
                  disabled={
                    ocupado ||
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
                                  setAviso(
                                    'Operações conferidas; os registros originais foram preservados.'
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
                        {computadores
                          .filter((c) => c.id !== status?.computador)
                          .map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.nome}
                            </option>
                          ))}
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
