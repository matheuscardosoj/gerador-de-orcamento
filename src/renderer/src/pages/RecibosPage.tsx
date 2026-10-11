import { useEffect, useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { api } from '../lib/api'
import { useNav, useBloqueioEdicao } from '../lib/nav'
import { PageShell } from '../ui/layout'
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  NumberField,
  ConfirmDialog,
  SectionTitle,
  EmptyState,
  Badge,
  IconButton,
  Mensagem
} from '../ui/primitives'
import { DadosClienteDocumento, LinhaTempo } from '../components/DocumentoExtras'
import type {
  Cliente,
  EmpresaConfig,
  Recibo,
  ResumoOrcamento,
  ResumoRelatorio,
  Relatorio
} from '@shared/types'
import { dataCivilHoje, formatMoeda, formatDataCurta } from '@shared/format'
import { gerarHtmlRecibo } from '@shared/documento/recibo-template'
import { resumoServicoRecibo } from '@shared/documento/recibo'
import { PreviaDocumentoModal } from '../components/PreviaDocumentoModal'
import { DataTableFrame, Pagination, SortableHeader, TableActions } from '../ui/dataTable'
const estados = {
  recebido: { label: 'Recebido', cor: 'green' },
  cancelado: { label: 'Cancelado', cor: 'red' },
  pendente: { label: 'Pagamento pendente', cor: 'amber' },
  rascunho: { label: 'Rascunho', cor: 'slate' }
} as const
type CampoLista = 'numero' | 'data' | 'destinatario' | 'valor' | 'status'
const vazio = (): Recibo => ({
  id: '',
  numero: 0,
  data: dataCivilHoje(),
  destinatario: '',
  descricao: '',
  valor: 0,
  local: '',
  formaPagamento: 'Pix',
  status: 'rascunho',
  quitacao: 'parcial',
  observacao: '',
  criadoEm: '',
  atualizadoEm: ''
})
export function RecibosPage({ reciboId }: { reciboId?: string }): JSX.Element {
  const { navegar } = useNav()
  const [lista, setLista] = useState<Recibo[]>([])
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState<Recibo['status'] | ''>('')
  const [campoLista, setCampoLista] = useState<CampoLista>('numero')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('desc')
  const [paginaLista, setPaginaLista] = useState(1)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [orcamentos, setOrcamentos] = useState<ResumoOrcamento[]>([])
  const [relatorios, setRelatorios] = useState<ResumoRelatorio[]>([])
  const [origem, setOrigem] = useState<Relatorio | null>(null)
  const [r, setR] = useState<Recibo | null>(null)
  const [salvo, setSalvo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [previa, setPrevia] = useState(false)
  const [confirmacao, setConfirmacao] = useState<'receber' | 'cancelar' | null>(null)
  useBloqueioEdicao(!!r && JSON.stringify(r) !== salvo)
  const recarregar = async (): Promise<void> => {
    setLista(await api.recibos.list())
  }
  useEffect(() => {
    void Promise.all([
      api.recibos.list(),
      api.clientes.list(),
      api.empresa.get(),
      api.orcamentos.list(),
      api.relatorios.list()
    ])
      .then(([l, c, e, o, rel]) => {
        setLista(l)
        setClientes(c)
        setEmpresa(e)
        setOrcamentos(o)
        setRelatorios(rel)
      })
      .catch((e) => setErro(String(e)))
  }, [])
  useEffect(() => {
    if (!reciboId) return
    void api.recibos
      .get(reciboId)
      .then((d) => {
        setR(d)
        setSalvo(JSON.stringify(d))
      })
      .catch((e) => setErro(String(e)))
  }, [reciboId])
  useEffect(() => {
    setOrigem(null)
    if (r?.origemTipo === 'relatorio' && r.origemId)
      void api.relatorios
        .get(r.origemId)
        .then(setOrigem)
        .catch((e) => setErro(String(e)))
  }, [r?.origemTipo, r?.origemId])
  const set = (p: Partial<Recibo>): void => {
    if (r) setR({ ...r, ...p })
  }
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(String(e))
    } finally {
      setOcupado(false)
    }
  }
  const salvar = async (): Promise<Recibo> => {
    if (!r) throw new Error('Abra um recibo.')
    const d = r.id ? await api.recibos.update(r.id, r) : await api.recibos.create(r)
    if (!d) throw new Error('Recibo não encontrado.')
    setR(d)
    setSalvo(JSON.stringify(d))
    await recarregar()
    return d
  }
  const fechar = (): void => {
    if (r && JSON.stringify(r) !== salvo) {
      setErro('Salve as alterações antes de voltar à lista.')
      return
    }
    setR(null)
    setSalvo('')
    navegar({ nome: 'recibos' })
  }
  const somenteLeitura = r?.status === 'recebido' || r?.status === 'cancelado'
  const filtrados = useMemo(() => {
    const normalizar = (texto: string): string =>
      texto
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
    const texto = normalizar(busca.trim())
    return lista
      .filter(
        (d) =>
          (!estado || d.status === estado) &&
          (!texto ||
            normalizar(
              `${String(d.numero).padStart(6, '0')} ${d.destinatario} ${d.descricao} ${formatMoeda(d.valor)} ${formatDataCurta(d.data)}`
            ).includes(texto))
      )
      .sort((a, b) => {
        const av = a[campoLista],
          bv = b[campoLista]
        const comparacao =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv), 'pt-BR')
        return direcao === 'asc' ? comparacao : -comparacao
      })
  }, [lista, busca, estado, campoLista, direcao])
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / 12))
  const paginaAtual = Math.min(paginaLista, totalPaginas)
  const inicio = (paginaAtual - 1) * 12
  const ordenar = (campo: CampoLista): void => {
    if (campo === campoLista) setDirecao((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    else {
      setCampoLista(campo)
      setDirecao(campo === 'destinatario' || campo === 'status' ? 'asc' : 'desc')
    }
    setPaginaLista(1)
  }
  const exportar = (formato: 'pdf' | 'docx'): void => {
    if (!r?.id) return
    void executar(async () => {
      const documento = somenteLeitura ? r : await salvar()
      await (formato === 'pdf' ? api.documentos.gerarReciboPdf : api.documentos.gerarReciboDocx)(
        documento.id
      )
    })
  }
  return (
    <PageShell
      titulo={
        r
          ? `${r.status === 'recebido' ? 'Recibo' : r.status === 'cancelado' ? 'Documento cancelado' : 'Cobrança'} ${r.numero > 0 ? String(r.numero).padStart(6, '0') : '— rascunho'}`
          : 'Recibos e cobranças'
      }
      descricao="Prepare a cobrança e confirme o recebimento para emitir a quitação."
      acoes={
        r ? (
          <>
            <Button variant="outline" onClick={fechar}>
              Voltar à lista
            </Button>
            {!somenteLeitura && (
              <Button
                disabled={ocupado}
                onClick={() =>
                  void executar(async () => {
                    await salvar()
                  })
                }
              >
                Salvar
              </Button>
            )}
            <Button variant="outline" onClick={() => setPrevia(true)}>
              Prévia
            </Button>
            {somenteLeitura &&
              (['pdf', 'docx'] as const).map((formato) => (
                <Button
                  key={formato}
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => exportar(formato)}
                >
                  Exportar {formato.toUpperCase()}
                </Button>
              ))}
          </>
        ) : (
          <Button
            onClick={() => {
              const d = {
                ...vazio(),
                camposCliente:
                  empresa?.camposClientePadrao ?? (['documento'] as Recibo['camposCliente'])
              }
              setR(d)
              setSalvo(JSON.stringify(d))
            }}
          >
            Novo recibo
          </Button>
        )
      }
    >
      {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
      {!r ? (
        <div className="space-y-4">
          {lista.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                aria-label="Buscar recibos"
                className="max-w-md"
                placeholder="Buscar por número, cliente, serviço ou valor…"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPaginaLista(1)
                }}
              />
              <Select
                aria-label="Filtrar estado dos recibos"
                className="w-full md:w-56"
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value as typeof estado)
                  setPaginaLista(1)
                }}
              >
                <option value="">Todos os estados</option>
                {Object.entries(estados).map(([id, e]) => (
                  <option key={id} value={id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {filtrados.length === 0 ? (
            <EmptyState
              title={lista.length ? 'Nenhum recibo encontrado' : 'Nenhum recibo cadastrado'}
              description={
                lista.length
                  ? 'Tente outro termo ou altere o filtro de estado.'
                  : 'Crie uma cobrança ou um recibo para registrar o pagamento de um serviço.'
              }
              action={
                lista.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBusca('')
                      setEstado('')
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataTableFrame minWidth="880px">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {(
                      [
                        ['numero', 'Nº', 'w-[9%]'],
                        ['data', 'Data', 'w-[12%]'],
                        ['destinatario', 'Cliente / serviço', 'w-[33%]'],
                        ['valor', 'Valor', 'w-[16%]'],
                        ['status', 'Estado', 'w-[22%]']
                      ] as const
                    ).map(([campo, label, className]) => (
                      <SortableHeader
                        key={campo}
                        label={label}
                        className={className}
                        active={campoLista === campo}
                        direction={direcao}
                        onSort={() => ordenar(campo)}
                        align={campo === 'valor' ? 'right' : 'left'}
                      />
                    ))}
                    <th scope="col" className="w-[8%] px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrados.slice(inicio, inicio + 12).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium tabular-nums text-slate-700">
                        {d.numero > 0 ? String(d.numero).padStart(6, '0') : 'Rascunho'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDataCurta(d.data)}</td>
                      <td className="px-4 py-3">
                        <p
                          className="line-clamp-2 font-medium text-slate-800"
                          title={d.destinatario}
                        >
                          {d.destinatario || 'Cliente não informado'}
                        </p>
                        <p
                          className="mt-0.5 line-clamp-1 text-xs text-slate-500"
                          title={d.descricao}
                        >
                          {d.descricao || 'Serviço não informado'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-800">
                        {formatMoeda(d.valor)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={estados[d.status].cor}>{estados[d.status].label}</Badge>
                        {d.status === 'recebido' && (
                          <p className="mt-1 text-xs text-slate-500">
                            Quitação {d.quitacao === 'total' ? 'total' : 'parcial'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <TableActions>
                          <IconButton
                            icon={FolderOpen}
                            label={`Abrir recibo Nº ${d.numero}`}
                            onClick={() => {
                              setR(d)
                              setSalvo(JSON.stringify(d))
                            }}
                          />
                        </TableActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTableFrame>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  {inicio + 1}–{Math.min(inicio + 12, filtrados.length)} de {filtrados.length}{' '}
                  {filtrados.length === 1 ? 'documento' : 'documentos'}
                </p>
                {totalPaginas > 1 && (
                  <Pagination pagina={paginaAtual} total={totalPaginas} onIr={setPaginaLista} />
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle
              title="Dados do recibo"
              description="Identificação do serviço e do pagamento"
            />
            <fieldset disabled={somenteLeitura || ocupado} className="grid gap-4 md:grid-cols-2">
              <Field label="Cliente">
                <Select
                  value={r.clienteId ?? ''}
                  onChange={(e) => {
                    const c = clientes.find((c) => c.id === e.target.value)
                    set({
                      clienteId: c?.id ?? null,
                      clienteSnapshot: c ?? null,
                      destinatario: c?.nome ?? ''
                    })
                  }}
                >
                  <option value="">Avulso / informar manualmente</option>
                  {clientes
                    .filter((c) => c.ativo || c.id === r.clienteId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Nome ou razão social">
                <Input
                  value={r.destinatario}
                  onChange={(e) =>
                    set({ destinatario: e.target.value, clienteId: null, clienteSnapshot: null })
                  }
                />
              </Field>
              <Field label="Data do documento / pagamento">
                <Input type="date" value={r.data} onChange={(e) => set({ data: e.target.value })} />
              </Field>
              <Field label="Local do pagamento">
                <Input value={r.local} onChange={(e) => set({ local: e.target.value })} />
              </Field>
              <Field label="Valor">
                <NumberField min={0} value={r.valor} onChange={(valor) => set({ valor })} />
              </Field>
              <Field label="Forma de pagamento">
                <Input
                  value={r.formaPagamento}
                  onChange={(e) => set({ formaPagamento: e.target.value })}
                />
              </Field>
              <Field label="Estado">
                <Select
                  value={r.status}
                  onChange={(e) => set({ status: e.target.value as Recibo['status'] })}
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="pendente">Pagamento pendente</option>
                  {somenteLeitura && (
                    <option value={r.status}>
                      {r.status === 'recebido' ? 'Recebido' : 'Cancelado'}
                    </option>
                  )}
                </Select>
              </Field>
              <Field label="Quitação">
                <Select
                  value={r.quitacao}
                  onChange={(e) => set({ quitacao: e.target.value as Recibo['quitacao'] })}
                >
                  <option value="parcial">Parcial — apenas o valor indicado</option>
                  <option value="total">Total — serviço integralmente pago</option>
                </Select>
              </Field>
              <Field label="Vínculo">
                <Select
                  value={r.origemTipo ?? ''}
                  onChange={(e) =>
                    set({
                      origemTipo: e.target.value
                        ? (e.target.value as 'orcamento' | 'relatorio')
                        : undefined,
                      origemId: null,
                      adiantamentoId: null
                    })
                  }
                >
                  <option value="">Avulso</option>
                  <option value="orcamento">Proposta</option>
                  <option value="relatorio">Relatório</option>
                </Select>
              </Field>
              {r.origemTipo && (
                <Field label="Documento de origem">
                  <Select
                    value={r.origemId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) {
                        set({ origemId: null, adiantamentoId: null })
                        return
                      }
                      void executar(async () => {
                        const d = await (r.origemTipo === 'relatorio'
                          ? api.relatorios.get(id)
                          : api.orcamentos.get(id))
                        if (!d) throw new Error('Documento de origem não encontrado.')
                        set({
                          origemId: id,
                          adiantamentoId: null,
                          destinatario: d.destinatario,
                          clienteId: d.clienteId,
                          clienteSnapshot: d.clienteSnapshot,
                          empresaSnapshot: d.empresaSnapshot,
                          camposCliente: d.camposCliente,
                          descricao: resumoServicoRecibo(d.itensServico, d.numero, r.origemTipo!),
                          valor: 'totais' in d ? Math.max(0, d.totais.saldo) : d.valorTotal
                        })
                      })
                    }}
                  >
                    <option value="">Escolha o documento</option>
                    {(r.origemTipo === 'relatorio' ? relatorios : orcamentos).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.numero} · {d.destinatario}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {origem && (
                <Field label="Recebimento">
                  <Select
                    value={r.adiantamentoId ?? ''}
                    onChange={(e) => {
                      const a = origem.adiantamentos.find((a) => a.id === e.target.value)
                      set({ adiantamentoId: a?.id ?? null, ...(a ? { valor: a.valor } : {}) })
                    }}
                  >
                    <option value="">Novo pagamento — descontar do saldo</option>
                    {origem.adiantamentos.map((a) => (
                      <option key={a.id} value={a.id}>
                        Já lançado: {a.descricao} · {formatMoeda(a.valor)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="md:col-span-2">
                <Field
                  label="Serviço prestado"
                  hint="Use um resumo do serviço; os detalhes podem ficar na proposta ou no relatório de origem."
                >
                  <Textarea
                    value={r.descricao}
                    onChange={(e) => set({ descricao: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Observação">
                  <Textarea
                    value={r.observacao}
                    onChange={(e) => set({ observacao: e.target.value })}
                  />
                </Field>
              </div>
            </fieldset>
          </Card>
          {!somenteLeitura && (
            <DadosClienteDocumento documento={r} clientes={clientes} onChange={set} />
          )}
          <Card className="p-6">
            <SectionTitle title="Pagamento e emissão" />
            <div className="flex flex-wrap gap-2">
              {r.status !== 'recebido' && r.status !== 'cancelado' && (
                <Button disabled={ocupado} onClick={() => setConfirmacao('receber')}>
                  Confirmar recebimento
                </Button>
              )}
              {r.id && r.status !== 'cancelado' && (
                <Button
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => setConfirmacao('cancelar')}
                >
                  Cancelar / estornar
                </Button>
              )}
              {r.id &&
                !somenteLeitura &&
                (['pdf', 'docx'] as const).map((f) => (
                  <Button variant="outline" disabled={ocupado} key={f} onClick={() => exportar(f)}>
                    Exportar {f.toUpperCase()}
                  </Button>
                ))}
              {r.id && (
                <LinhaTempo
                  tipo="recibo"
                  id={r.id}
                  onRestaurado={() =>
                    void api.recibos.get(r.id).then((d) => {
                      setR(d)
                      setSalvo(JSON.stringify(d))
                      void recarregar()
                    })
                  }
                />
              )}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {r.status === 'recebido'
                ? 'Recebimento confirmado. O documento está preservado.'
                : r.status === 'cancelado'
                  ? 'Documento cancelado, preservado no histórico.'
                  : 'Pagamento pendente não comprova quitação.'}
            </p>
          </Card>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmacao}
        title={confirmacao === 'receber' ? 'Confirmar recebimento' : 'Cancelar documento'}
        confirmLabel={confirmacao === 'receber' ? 'Confirmar recebimento' : 'Cancelar / estornar'}
        danger={confirmacao !== 'receber'}
        description={
          confirmacao === 'receber'
            ? 'Confirme somente se o valor foi efetivamente recebido. O saldo do relatório vinculado será atualizado uma única vez.'
            : 'O documento será preservado. Um novo recebimento criado por este recibo será estornado; adiantamentos preexistentes serão mantidos.'
        }
        onCancel={() => setConfirmacao(null)}
        onConfirm={() => {
          const acao = confirmacao
          setConfirmacao(null)
          void executar(async () => {
            const d = somenteLeitura ? r! : await salvar()
            const novo =
              acao === 'receber'
                ? await api.recibos.confirmar(d.id)
                : await api.recibos.cancelar(d.id)
            setR(novo)
            setSalvo(JSON.stringify(novo))
            await recarregar()
          })
        }}
      />
      {previa && r && empresa && (
        <PreviaDocumentoModal
          titulo={r.status === 'recebido' ? 'Prévia do recibo' : 'Prévia da cobrança'}
          tituloFrame="Recibo"
          html={gerarHtmlRecibo(r, r.empresaSnapshot ?? empresa)}
          onClose={() => setPrevia(false)}
        />
      )}
    </PageShell>
  )
}
