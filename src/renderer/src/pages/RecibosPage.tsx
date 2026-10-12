import { RevisaoIA } from '../components/RevisaoIA'
import { HistoricoDocumentos, registroRecibo } from '../components/HistoricoDocumentos'
import { useEffect, useState } from 'react'
import { ArrowLeft, Eye, FileDown, Save, Plus, HandCoins, Undo2 } from 'lucide-react'
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
import { dataCivilHoje, formatMoeda } from '@shared/format'
import { gerarHtmlRecibo } from '@shared/documento/recibo-template'
import { vincularRecibo } from '@shared/recibo-rascunho'
import {
  errosConfirmacaoRecibo,
  localPagamentoSugerido,
  type ErrosRecibo
} from '@shared/validacao-recibo'
import { PreviaDocumentoModal } from '../components/PreviaDocumentoModal'
const vazio = (empresa?: EmpresaConfig | null): Recibo => ({
  id: '',
  numero: 0,
  data: dataCivilHoje(),
  destinatario: '',
  descricao: '',
  valor: 0,
  local: localPagamentoSugerido(empresa),
  formaPagamento: 'Pix',
  status: 'rascunho',
  quitacao: 'parcial',
  observacao: '',
  criadoEm: '',
  atualizadoEm: ''
})
export function RecibosPage({
  reciboId,
  origemDocumento
}: {
  reciboId?: string
  origemDocumento?: { tipo: 'orcamento' | 'relatorio'; id: string }
}): JSX.Element {
  const { navegar, executarComConfirmacao } = useNav()
  const [lista, setLista] = useState<Recibo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [orcamentos, setOrcamentos] = useState<ResumoOrcamento[]>([])
  const [relatorios, setRelatorios] = useState<ResumoRelatorio[]>([])
  const [origem, setOrigem] = useState<Relatorio | null>(null)
  const [r, setR] = useState<Recibo | null>(null)
  const [salvo, setSalvo] = useState('')
  const [erro, setErro] = useState('')
  const [errosCampos, setErrosCampos] = useState<ErrosRecibo>({})
  const [ocupado, setOcupado] = useState(false)
  const [previa, setPrevia] = useState(false)
  const [confirmacao, setConfirmacao] = useState<'receber' | 'cancelar' | null>(null)
  useBloqueioEdicao(!!r && (!r.id || JSON.stringify(r) !== salvo))
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
    if (!origemDocumento) return
    let vivo = true
    void (
      origemDocumento.tipo === 'orcamento'
        ? api.orcamentos.get(origemDocumento.id)
        : api.relatorios.get(origemDocumento.id)
    )
      .then((d) => {
        if (!d) throw new Error('Documento de origem não encontrado.')
        if (vivo) setR(vincularRecibo(vazio(), d, origemDocumento.tipo))
      })
      .catch((e) => {
        if (vivo) setErro(String(e))
      })
    return () => {
      vivo = false
    }
  }, [origemDocumento])
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
    setErrosCampos((atuais) =>
      Object.fromEntries(Object.entries(atuais).filter(([campo]) => !(campo in p)))
    )
  }
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(
        String(e)
          .replace(/^Error:\s*/, '')
          .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
      )
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
    executarComConfirmacao(() => {
      setR(null)
      setSalvo('')
      setErrosCampos({})
      setErro('')
      navegar({ nome: 'recibos' })
    })
  }
  const somenteLeitura = r?.status === 'recebido' || r?.status === 'cancelado'
  const confirmarRecebimento = (): void => {
    if (!r) return
    const local = r.local.trim() || localPagamentoSugerido(r.empresaSnapshot ?? empresa)
    const atualizado = { ...r, local }
    const erros = errosConfirmacaoRecibo(atualizado)
    setR(atualizado)
    setErrosCampos(erros)
    if (Object.keys(erros).length) {
      setErro('Revise os campos indicados antes de confirmar o recebimento.')
      requestAnimationFrame(() => {
        const campo = document.querySelector<HTMLElement>(`[name="${Object.keys(erros)[0]}"]`)
        campo?.focus()
        campo?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }
    setErro('')
    setConfirmacao('receber')
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
      largura={r ? 'xl' : 'full'}
      titulo={
        r
          ? `${r.status === 'recebido' ? 'Recibo' : r.status === 'cancelado' ? 'Documento cancelado' : 'Cobrança'} ${r.numero > 0 ? String(r.numero).padStart(6, '0') : '— rascunho'}`
          : 'Recibos e cobranças'
      }
      descricao="Prepare a cobrança e confirme o recebimento para emitir a quitação."
      acoes={
        r ? (
          <>
            <Button icon={ArrowLeft} variant="outline" onClick={fechar}>
              Voltar à lista
            </Button>
            {!somenteLeitura && (
              <Button
                icon={Save}
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
            <Button icon={Eye} variant="outline" onClick={() => setPrevia(true)}>
              Prévia
            </Button>
            {somenteLeitura &&
              (['pdf', 'docx'] as const).map((formato) => (
                <Button
                  icon={FileDown}
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
            icon={Plus}
            onClick={() => {
              setErrosCampos({})
              setErro('')
              const d = {
                ...vazio(empresa),
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
        <HistoricoDocumentos
          tipo="recibo"
          registros={lista.map((d) =>
            registroRecibo(
              d,
              d.origemTipo
                ? `${d.origemTipo === 'orcamento' ? 'Proposta' : 'Relatório'} Nº ${(d.origemTipo === 'orcamento' ? orcamentos : relatorios).find((o) => o.id === d.origemId)?.numero ?? '—'}`
                : ''
            )
          )}
          onAbrir={(id) =>
            void executar(async () => {
              const d = await api.recibos.get(id)
              if (!d) throw new Error('Recibo não encontrado.')
              setR(d)
              setSalvo(JSON.stringify(d))
            })
          }
        />
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
              <Field label="Nome ou razão social" error={errosCampos.destinatario}>
                <Input
                  name="destinatario"
                  value={r.destinatario}
                  onChange={(e) =>
                    set({ destinatario: e.target.value, clienteId: null, clienteSnapshot: null })
                  }
                />
              </Field>
              <Field label="Data do documento / pagamento" error={errosCampos.data}>
                <Input
                  name="data"
                  type="date"
                  value={r.data}
                  onChange={(e) => set({ data: e.target.value })}
                />
              </Field>
              <Field
                label="Local do pagamento"
                error={errosCampos.local}
                hint="Confira a cidade e UF onde o pagamento foi recebido."
              >
                <Input
                  name="local"
                  placeholder="Ex.: Rio Verde - GO"
                  value={r.local}
                  onChange={(e) => set({ local: e.target.value })}
                />
              </Field>
              <Field label="Valor" error={errosCampos.valor}>
                <NumberField
                  name="valor"
                  format="money"
                  min={0}
                  value={r.valor}
                  onChange={(valor) => set({ valor })}
                />
              </Field>
              <Field label="Forma de pagamento" error={errosCampos.formaPagamento}>
                <Input
                  name="formaPagamento"
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
                        setR(vincularRecibo(r, d, r.origemTipo!))
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
              {origem && origem.totais.saldo <= 0 && !r.adiantamentoId && (
                <Mensagem tom="aviso" className="md:col-span-2">
                  {origem.totais.saldo < 0
                    ? 'Este relatório tem valor a devolver.'
                    : 'Este relatório já está quitado.'}{' '}
                  Para emitir um recibo de pagamento anterior, selecione um recebimento já lançado.
                </Mensagem>
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
                  error={errosCampos.descricao}
                  hint="Use um resumo do serviço; os detalhes podem ficar na proposta ou no relatório de origem."
                >
                  <Textarea
                    name="descricao"
                    value={r.descricao}
                    onChange={(e) => set({ descricao: e.target.value })}
                  />
                  <RevisaoIA
                    disabled={somenteLeitura || ocupado}
                    texto={r.descricao}
                    campo="descricaoRecibo"
                    onAplicar={(descricao) => set({ descricao })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Observação">
                  <Textarea
                    value={r.observacao}
                    onChange={(e) => set({ observacao: e.target.value })}
                  />
                  <RevisaoIA
                    disabled={somenteLeitura || ocupado}
                    texto={r.observacao}
                    campo="observacaoRecibo"
                    onAplicar={(observacao) => set({ observacao })}
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
                <Button icon={HandCoins} disabled={ocupado} onClick={confirmarRecebimento}>
                  Confirmar recebimento
                </Button>
              )}
              {r.id && r.status !== 'cancelado' && (
                <Button
                  icon={Undo2}
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
                  <Button
                    icon={FileDown}
                    variant="outline"
                    disabled={ocupado}
                    key={f}
                    onClick={() => exportar(f)}
                  >
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
            ? `Recebimento de ${formatMoeda(r?.valor ?? 0)} de ${r?.destinatario ?? ''}, em ${r?.local ?? ''}. Confirme somente se o valor foi efetivamente recebido. ${
                r?.origemTipo === 'relatorio' && r.origemId
                  ? 'O saldo do relatório vinculado será atualizado uma única vez.'
                  : 'Este recibo registrará o pagamento sem exigir ou alterar um relatório.'
              }`
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
