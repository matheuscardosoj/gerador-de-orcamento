import { useEffect, useMemo, useState } from 'react'
import { Icone } from '../ui/primitives'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  NumberField,
  Select,
  Textarea,
  Badge,
  SectionTitle,
  cn
} from '../ui/primitives'
import { formatMoeda } from '@shared/format'
import { round2 } from '@shared/format'
import type {
  Orcamento,
  ItemServico,
  ItemMaterial,
  ItemTexto,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  EmpresaConfig
} from '@shared/types'
import { ServicoCalculoModal } from '../components/ServicoCalculoModal'
import { PreviaModal } from '../components/PreviaModal'
import { AnexosCard } from '../components/AnexosCard'
import { novoId, type ResultadoServico } from '../components/tipos'
import { normalizarDestinatario } from '@shared/documento/comum'

export interface Dados {
  empresa: EmpresaConfig
  parametros: ParametrosFinanceiros
  clientes: Cliente[]
  servicos: ServicoCatalogo[]
  observacoesPadrao: ObservacaoPadrao[]
  pagamentosPadrao: FormaPagamentoPadrao[]
}

export function EditorOrcamentoPage({ orcamentoId }: { orcamentoId?: string }): JSX.Element {
  const { navegar } = useNav()
  const [dados, setDados] = useState<Dados | null>(null)
  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previaAberta, setPreviaAberta] = useState(false)
  // Número com que o orçamento foi carregado: só mexemos na numeração se mudou.
  const [numeroOriginal, setNumeroOriginal] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao] =
        await Promise.all([
          api.empresa.get(),
          api.parametros.get(),
          api.clientes.list(),
          api.servicos.list(),
          api.observacoes.list(),
          api.pagamentos.list()
        ])
      if (!vivo) return
      setDados({ empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao })

      if (orcamentoId) {
        const existente = await api.orcamentos.get(orcamentoId)
        if (vivo && existente) {
          setOrc(existente)
          setNumeroOriginal(existente.numero)
        }
      } else {
        const numero = await api.orcamentos.proximoNumero()
        if (!vivo) return
        setNumeroOriginal(numero)
        setOrc({
          id: '',
          numero,
          data: new Date().toISOString(),
          clienteId: null,
          destinatario: '',
          formato: 'carta',
          titulo: 'Proposta de Serviço',
          introducao: '',
          itensServico: [],
          materiais: [],
          observacoes: observacoesPadrao.filter((o) => o.padrao && (o.aplicacao === 'ambos' || o.aplicacao === 'orcamento')).map((o) => ({ id: novoId(), texto: o.texto, origemPadraoId: o.id })),
          pagamentos: pagamentosPadrao.filter((p) => p.padrao && (p.aplicacao === 'ambos' || p.aplicacao === 'orcamento')).map((p) => ({ id: novoId(), texto: p.texto, origemPadraoId: p.id })),
          anexos: [],
          prazoDias: null,
          observacaoInterna: '',
          valorTotal: 0,
          status: 'rascunho',
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        })
      }
    })()
    return () => {
      vivo = false
    }
  }, [orcamentoId])

  const total = useMemo(
    () => (orc ? round2(orc.itensServico.reduce((s, i) => s + (i.valorTotal || 0), 0)) : 0),
    [orc]
  )

  if (!orc || !dados) {
    return (
      <PageShell titulo="Carregando…">
        <p className="text-sm text-slate-500">Carregando dados…</p>
      </PageShell>
    )
  }

  const set = (patch: Partial<Orcamento>): void => setOrc({ ...orc, ...patch })

  const salvar = async (): Promise<Orcamento | null> => {
    setSalvando(true)
    setErro(null)
    try {
      const payload = { ...orc, valorTotal: total }
      const numeroMudou = numeroOriginal !== null && orc.numero !== numeroOriginal
      let salvo: Orcamento | null

      if (orc.id) {
        // A troca de número vem primeiro: se o número estiver em uso, nada é
        // salvo e o usuário vê a mensagem com a sugestão de número livre.
        if (numeroMudou) {
          const r = await api.orcamentos.alterarNumero(orc.id, orc.numero)
          if (!r.ok) {
            setErro(r.erro ?? 'Não foi possível alterar o número do orçamento.')
            return null
          }
        }
        salvo = await api.orcamentos.update(orc.id, payload)
      } else {
        const { id: _id, numero, criadoEm: _c, atualizadoEm: _a, ...novo } = payload
        // Só pede um número específico se o usuário mexeu no campo; senão o
        // main escolhe o próximo livre no momento da criação.
        salvo = await api.orcamentos.create(numeroMudou ? { ...novo, numero } : novo)
      }

      if (salvo) {
        setOrc(salvo)
        setNumeroOriginal(salvo.numero)
        // Orçamento novo com número já ocupado: o main usa o próximo livre em
        // vez de perder o que foi digitado — mas o usuário precisa saber disso.
        if (!orc.id && numeroMudou && salvo.numero !== orc.numero) {
          setErro(
            `O número ${orc.numero} já estava em uso. O orçamento foi salvo com o número ${salvo.numero}.`
          )
        }
      }
      return salvo
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
      return null
    } finally {
      setSalvando(false)
    }
  }

  const exportar = async (tipo: 'pdf' | 'docx'): Promise<void> => {
    const salvo = await salvar()
    if (!salvo) return
    try {
      const r = tipo === 'pdf' ? await api.documentos.gerarPdf(salvo.id) : await api.documentos.gerarDocx(salvo.id)
      if (r.caminho) alert(`Documento gerado:\n${r.caminho}`)
    } catch (e) {
      alert(`Não foi possível gerar o documento.\n${String(e)}`)
    }
  }

  const gerarRelatorio = async (): Promise<void> => {
    const salvo = await salvar()
    if (!salvo) return
    const rel = await api.relatorios.criarDeOrcamento(salvo.id)
    if (rel) navegar({ nome: 'editorRelatorio', relatorioId: rel.id })
  }

  return (
    <PageShell
      titulo={orc.id ? `Orçamento ${orc.numero}` : 'Novo orçamento'}
      descricao={`Total: ${formatMoeda(total)}`}
      acoes={
        <>
          <Button variant="ghost" onClick={() => navegar({ nome: 'historico' })}>
            Voltar
          </Button>
          <Button variant="outline" onClick={() => setPreviaAberta(true)}>
            Prévia
          </Button>
          <Button variant="outline" onClick={gerarRelatorio}>
            Gerar relatório
          </Button>
          <Button variant="outline" onClick={() => exportar('docx')}>
            DOCX
          </Button>
          <Button variant="outline" onClick={() => exportar('pdf')}>
            PDF
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      {erro && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</div>}
      <div className="space-y-5">
        <DadosGeraisCard orc={orc} set={set} clientes={dados.clientes} />
        <ServicosCard orc={orc} set={set} dados={dados} total={total} />
        <MateriaisCard orc={orc} set={set} />
        <TextosCard
          titulo="Observações"
          descricao="Textos que aparecem no rodapé do orçamento"
          itens={orc.observacoes}
          sugestoes={dados.observacoesPadrao.filter((o) => o.aplicacao === 'ambos' || o.aplicacao === 'orcamento')}
          onChange={(observacoes) => set({ observacoes })}
        />
        <TextosCard
          titulo="Formas de pagamento"
          descricao="Podem ser várias"
          itens={orc.pagamentos}
          sugestoes={dados.pagamentosPadrao.filter((p) => p.aplicacao === 'ambos' || p.aplicacao === 'orcamento')}
          onChange={(pagamentos) => set({ pagamentos })}
        />
        <AnexosCard
          anexos={orc.anexos ?? []}
          itensServico={orc.itensServico}
          onChange={(anexos) => set({ anexos })}
        />
      </div>
      {previaAberta && (
        <PreviaModal orc={{ ...orc, valorTotal: total }} empresa={dados.empresa} onClose={() => setPreviaAberta(false)} />
      )}
    </PageShell>
  )
}

// -------------------------------------------------------------- Dados gerais
function DadosGeraisCard({
  orc,
  set,
  clientes
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
  clientes: Cliente[]
}): JSX.Element {
  return (
    <Card className="p-6">
      <SectionTitle title="Dados gerais" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Número" hint="Sugerido automaticamente; pode ser ajustado">
          <NumberField value={orc.numero} onChange={(v) => set({ numero: v })} min={1} step={1} />
        </Field>
        <Field label="Data">
          <Input
            type="date"
            value={orc.data.slice(0, 10)}
            onChange={(e) => set({ data: new Date(e.target.value + 'T12:00:00').toISOString() })}
          />
        </Field>
        <Field label="Formato do documento">
          <Select value={orc.formato} onChange={(e) => set({ formato: e.target.value as Orcamento['formato'] })}>
            <option value="carta">Carta (parágrafos)</option>
            <option value="tabela">Tabela (colunas)</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={orc.status} onChange={(e) => set({ status: e.target.value as Orcamento['status'] })}>
            <option value="rascunho">Rascunho</option>
            <option value="enviado">Enviado</option>
            <option value="aprovado">Aprovado</option>
            <option value="recusado">Recusado</option>
          </Select>
        </Field>
        <Field label="Cliente cadastrado" hint="Preenche o destinatário" className="md:col-span-1">
          <Select
            value={orc.clienteId ?? ''}
            onChange={(e) => {
              const c = clientes.find((x) => x.id === e.target.value)
              set({
                clienteId: c?.id ?? null,
                destinatario: c ? normalizarDestinatario(`${c.tratamento} ${c.nome}`) : orc.destinatario
              })
            }}
          >
            <option value="">— livre —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destinatário (sem vírgula)" hint="A vírgula será acrescentada apenas no PDF e DOCX" className="md:col-span-2">
          <Input
            value={orc.destinatario}
            onChange={(e) => set({ destinatario: normalizarDestinatario(e.target.value), clienteId: null })}
            placeholder="Ex.: A TMG"
          />
        </Field>
        <Field label="Título" className="md:col-span-2">
          <Input value={orc.titulo} onChange={(e) => set({ titulo: e.target.value })} />
        </Field>
        <Field label="Prazo (dias)" hint="Opcional">
          <NumberField value={orc.prazoDias ?? 0} onChange={(v) => set({ prazoDias: v || null })} min={0} />
        </Field>
        <Field label="Introdução / apresentação" hint="Parágrafo opcional antes dos serviços" className="md:col-span-3">
          <Textarea value={orc.introducao ?? ''} onChange={(e) => set({ introducao: e.target.value })} />
        </Field>
        <AnotacaoInterna orc={orc} set={set} />
      </div>
    </Card>
  )
}

/**
 * Anotação livre que identifica o orçamento na listagem (e alimenta a busca).
 * Não sai no documento. O botão preenche uma sugestão com a IA local; o texto
 * continua totalmente editável — ou pode ser escrito do zero, sem usar a IA.
 */
function AnotacaoInterna({
  orc,
  set
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
}): JSX.Element {
  const [gerando, setGerando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const sugerir = async (): Promise<void> => {
    setGerando(true)
    setAviso(null)
    try {
      const texto = await api.ia.sugerirObservacao(orc)
      if (texto) set({ observacaoInterna: texto })
      else setAviso('A IA não retornou nenhum texto.')
    } catch (e) {
      setAviso(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setGerando(false)
    }
  }

  return (
    <Field
      label="Anotação interna"
      hint="Aparece só na listagem de orçamentos e na busca — não sai no documento."
      className="md:col-span-3"
    >
      {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{aviso}</p>}
      <div className="flex items-start gap-2">
        <Textarea
          value={orc.observacaoInterna ?? ''}
          onChange={(e) => set({ observacaoInterna: e.target.value })}
          placeholder="Ex.: Cercamento da fazenda do Sr. João, 1.200 m, aguardando retorno."
          className="min-h-[64px]"
        />
        <Button variant="outline" className="mt-0.5 shrink-0" onClick={sugerir} disabled={gerando}>
          {gerando ? 'Gerando…' : 'Sugerir com IA'}
        </Button>
      </div>
    </Field>
  )
}

// ----------------------------------------------------------------- Serviços
export function ServicosCard({
  orc,
  set,
  dados,
  total,
  titulo = 'Serviços a executar',
  rotuloTotal = 'Total do orçamento'
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
  dados: Dados
  total: number
  titulo?: string
  rotuloTotal?: string
}): JSX.Element {
  const [calcAberto, setCalcAberto] = useState<ItemServico | 'novo' | null>(null)
  const [manualAberto, setManualAberto] = useState<ItemServico | 'novo' | null>(null)
  const [catalogoSel, setCatalogoSel] = useState('')

  const catalogoAtual = dados.servicos.find((s) => s.id === catalogoSel)

  const itemDeResultado = (r: ResultadoServico, base?: ItemServico | null, servicoId?: string | null): ItemServico => ({
    id: base?.id ?? novoId(),
    servicoId: base?.servicoId ?? servicoId ?? null,
    descricao: r.descricao,
    unidade: r.unidade,
    quantidade: r.quantidade,
    valorUnitario: round2(r.valorUnitario),
    valorTotal: round2(r.valorTotal),
    calculo: r.calculo
  })

  const atualizar = (item: ItemServico): void =>
    set({ itensServico: orc.itensServico.map((i) => (i.id === item.id ? item : i)) })
  const remover = (id: string): void =>
    set({ itensServico: orc.itensServico.filter((i) => i.id !== id) })

  // Ao editar um item: se foi calculado, reabre o modal de cálculo; senão, o manual.
  const editarItem = (i: ItemServico): void => {
    if (i.calculo) setCalcAberto(i)
    else setManualAberto(i)
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title={titulo}
        description="Adicione com cálculo de custo ou informe o valor manualmente"
        action={
          <div className="flex items-center gap-2">
            <Select value={catalogoSel} onChange={(e) => setCatalogoSel(e.target.value)} className="w-52">
              <option value="">Do catálogo…</option>
              {dados.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => setCalcAberto('novo')}>
              + Com cálculo
            </Button>
            <Button variant="outline" onClick={() => setManualAberto('novo')}>
              + Manual
            </Button>
          </div>
        }
      />

      {orc.itensServico.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
          Nenhum serviço adicionado.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2">Unid.</th>
                <th className="px-3 py-2 text-right">Valor unit.</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orc.itensServico.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700">{i.descricao}</span>
                      {i.calculo && <Badge color="green">calculado</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{i.quantidade}</td>
                  <td className="px-3 py-2 text-slate-600">{i.unidade}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatMoeda(i.valorUnitario)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{formatMoeda(i.valorTotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-xs text-slate-400 hover:text-brand-tealDark"
                      onClick={() => editarItem(i)}
                    >
                      editar
                    </button>{' '}
                    <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => remover(i.id)}>
                      excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-600">
                  {rotuloTotal}
                </td>
                <td className="px-3 py-2 text-right text-base font-bold text-brand-tealDark">
                  {formatMoeda(total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {calcAberto && (
        <ServicoCalculoModal
          parametros={dados.parametros}
          descricaoInicial={
            calcAberto === 'novo' ? catalogoAtual?.descricaoPadrao : calcAberto.descricao
          }
          unidadeInicial={calcAberto === 'novo' ? catalogoAtual?.unidade : calcAberto.unidade}
          quantidadeInicial={calcAberto === 'novo' ? undefined : calcAberto.quantidade}
          entradaInicial={calcAberto === 'novo' ? undefined : calcAberto.calculo?.entrada}
          onCancel={() => setCalcAberto(null)}
          onConfirm={(r) => {
            if (calcAberto === 'novo') {
              set({ itensServico: [...orc.itensServico, itemDeResultado(r, null, catalogoAtual?.id ?? null)] })
            } else {
              atualizar(itemDeResultado(r, calcAberto))
            }
            setCalcAberto(null)
          }}
        />
      )}

      {manualAberto && (
        <ServicoManualModal
          item={manualAberto === 'novo' ? null : manualAberto}
          descricaoInicial={manualAberto === 'novo' ? catalogoAtual?.descricaoPadrao : undefined}
          unidadeInicial={manualAberto === 'novo' ? catalogoAtual?.unidade : undefined}
          precoRefInicial={manualAberto === 'novo' ? catalogoAtual?.precoReferencia ?? undefined : undefined}
          onClose={() => setManualAberto(null)}
          onSave={(item) => {
            if (manualAberto === 'novo') set({ itensServico: [...orc.itensServico, item] })
            else atualizar(item)
            setManualAberto(null)
          }}
        />
      )}
    </Card>
  )
}

function ServicoManualModal({
  item,
  descricaoInicial,
  unidadeInicial,
  precoRefInicial,
  onClose,
  onSave
}: {
  item: ItemServico | null
  descricaoInicial?: string
  unidadeInicial?: string
  precoRefInicial?: number
  onClose: () => void
  onSave: (i: ItemServico) => void
}): JSX.Element {
  const [descricao, setDescricao] = useState(item?.descricao ?? descricaoInicial ?? '')
  const [unidade, setUnidade] = useState(item?.unidade ?? unidadeInicial ?? 'serviço')
  const [quantidade, setQuantidade] = useState(item?.quantidade ?? 1)
  const [valorUnitario, setValorUnitario] = useState(item?.valorUnitario ?? precoRefInicial ?? 0)

  const total = round2(quantidade * valorUnitario)

  const salvar = (): void => {
    onSave({
      id: item?.id ?? novoId(),
      servicoId: item?.servicoId ?? null,
      descricao: descricao.trim() || 'Serviço',
      unidade,
      quantidade,
      valorUnitario: round2(valorUnitario),
      valorTotal: total,
      calculo: item?.calculo ?? null
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Editar serviço' : 'Adicionar serviço (sem cálculo)'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Descrição do serviço">
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantidade">
            <NumberField value={quantidade} onChange={setQuantidade} min={0} />
          </Field>
          <Field label="Unidade">
            <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} />
          </Field>
          <Field label="Valor unitário">
            <NumberField value={valorUnitario} onChange={setValorUnitario} min={0} />
          </Field>
        </div>
        <div className="flex justify-end text-sm text-slate-600">
          Total: <span className="ml-2 font-bold text-brand-tealDark">{formatMoeda(total)}</span>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Materiais
function MateriaisCard({
  orc,
  set
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
}): JSX.Element {
  const add = (): void =>
    set({ materiais: [...orc.materiais, { id: novoId(), quantidade: 1, unidade: 'un', especificacao: '' }] })
  const upd = (id: string, patch: Partial<ItemMaterial>): void =>
    set({ materiais: orc.materiais.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const rem = (id: string): void => set({ materiais: orc.materiais.filter((m) => m.id !== id) })

  return (
    <Card className="p-6">
      <SectionTitle
        title="Lista de materiais"
        description="Opcional"
        action={
          <Button variant="outline" onClick={add}>
            + Material
          </Button>
        }
      />
      {orc.materiais.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-6 text-center text-sm text-slate-500">
          Nenhum material.
        </p>
      ) : (
        <div className="space-y-2">
          {orc.materiais.map((m) => (
            <div key={m.id} className="grid grid-cols-[80px_100px_1fr_auto] gap-2">
              <NumberField value={m.quantidade} onChange={(v) => upd(m.id, { quantidade: v })} min={0} />
              <Input value={m.unidade} onChange={(e) => upd(m.id, { unidade: e.target.value })} placeholder="un" />
              <Input
                value={m.especificacao}
                onChange={(e) => upd(m.id, { especificacao: e.target.value })}
                placeholder="Especificação do material"
              />
              <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => rem(m.id)}>
                <Icone>✕</Icone>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------- Observações / Pagamentos
export function TextosCard({
  titulo,
  descricao,
  itens,
  sugestoes,
  onChange
}: {
  titulo: string
  descricao?: string
  itens: ItemTexto[]
  sugestoes: Array<{ id: string; texto: string }>
  onChange: (itens: ItemTexto[]) => void
}): JSX.Element {
  const add = (texto = '', origemPadraoId?: string): void => onChange([...itens, { id: novoId(), texto, origemPadraoId }])
  const upd = (id: string, texto: string): void =>
    onChange(itens.map((i) => (i.id === id ? { ...i, texto, origemPadraoId: null } : i)))
  const rem = (id: string): void => onChange(itens.filter((i) => i.id !== id))

  const usadas = new Set(itens.map((i) => i.texto))
  const disponiveis = sugestoes.filter((s) => !usadas.has(s.texto))

  return (
    <Card className="p-6">
      <SectionTitle
        title={titulo}
        description={descricao}
        action={
          <Button variant="outline" onClick={() => add()}>
            + Adicionar
          </Button>
        }
      />
      <div className="space-y-2">
        {itens.map((i) => (
          <div key={i.id} className="flex items-start gap-2">
            <Textarea
              value={i.texto}
              onChange={(e) => upd(i.id, e.target.value)}
              className="min-h-[52px]"
            />
            <Button variant="ghost" size="sm" className="mt-1 shrink-0 text-slate-400" onClick={() => rem(i.id)}>
              <Icone>✕</Icone>
            </Button>
          </div>
        ))}
      </div>
      {disponiveis.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-400">Inserir padrão:</p>
          <div className="flex flex-wrap gap-2">
            {disponiveis.map((s) => (
              <button
                key={s.id}
                onClick={() => add(s.texto, s.id)}
                className={cn(
                  'max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-left text-xs text-slate-600 hover:border-brand-teal hover:text-brand-tealDark'
                )}
                title={s.texto}
              >
                {s.texto.length > 70 ? s.texto.slice(0, 70) + '…' : s.texto}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
