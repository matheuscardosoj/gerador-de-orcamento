import { RevisaoIA } from '../../components/RevisaoIA'
import { ListaOrdenavel } from '../../ui/ordenavel'
import { useState } from 'react'
import { Pencil, X, Save, Calculator, Plus } from 'lucide-react'
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
  IconButton,
  cn,
  Mensagem
} from '../../ui/primitives'
import { formatMoeda, normalizarDataCivil, round2 } from '@shared/format'
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
  EmpresaConfig,
  Relatorio
} from '@shared/types'
import { ServicoCalculoModal } from '../../components/ServicoCalculoModal'
import { novoId, type ResultadoServico } from '../../components/tipos'
import { normalizarDestinatario } from '@shared/documento/comum'
import { normalizarOrcamento, validarOrcamentoFinal, type ErroValidacao } from '@shared/validacao'
import { DataTableViewport } from '../../ui/dataTable'
import { notificar } from '../../lib/notificacoes'
import type { ReactElement } from 'react'
export interface Dados {
  empresa: EmpresaConfig
  parametros: ParametrosFinanceiros
  clientes: Cliente[]
  servicos: ServicoCatalogo[]
  observacoesPadrao: ObservacaoPadrao[]
  pagamentosPadrao: FormaPagamentoPadrao[]
}

export function mensagemDoCampo(erros: ErroValidacao[], campo: string): string | undefined {
  return erros.find((erro) => erro.campo === campo)?.mensagem
}

export function errosDoGrupo(erros: ErroValidacao[], grupo: string): ErroValidacao[] {
  return erros.filter((erro) => erro.campo === grupo || erro.campo.startsWith(`${grupo}.`))
}

// -------------------------------------------------------------- Dados gerais
export function DadosGeraisCard({
  orc,
  set,
  clientes,
  erroDoCampo,
  onValidacao
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
  clientes: Cliente[]
  erroDoCampo: (campo: string) => string | undefined
  onValidacao: (erros: ErroValidacao[]) => void
}): ReactElement {
  return (
    <Card className="p-6">
      <SectionTitle title="Dados gerais" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Número" hint="Sugerido automaticamente; pode ser ajustado">
          {orc.numero <= 0 ? (
            <p className="text-sm text-slate-500">
              Aguardando numeração — o número será confirmado ao sincronizar.
            </p>
          ) : (
            <NumberField value={orc.numero} onChange={(v) => set({ numero: v })} min={1} step={1} />
          )}
        </Field>
        <Field label="Data" error={erroDoCampo('data')}>
          <Input
            type="date"
            value={normalizarDataCivil(orc.data)}
            onChange={(e) => set({ data: normalizarDataCivil(e.target.value) })}
          />
        </Field>
        <Field label="Formato do documento">
          <Select
            value={orc.formato}
            onChange={(e) => set({ formato: e.target.value as Orcamento['formato'] })}
          >
            <option value="carta">Carta (parágrafos)</option>
            <option value="tabela">Tabela (colunas)</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={orc.status}
            onChange={(e) => {
              const status = e.target.value as Orcamento['status']
              if (status !== 'rascunho') {
                const erros = validarOrcamentoFinal(normalizarOrcamento({ ...orc, status }))
                if (erros.length) {
                  onValidacao(erros)
                  return
                }
              }
              onValidacao([])
              set({ status })
            }}
          >
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
                clienteSnapshot: c ?? null,
                destinatario: c ? c.nome : orc.destinatario
              })
            }}
          >
            <option value="">— livre —</option>
            {clientes
              .filter((c) => c.ativo || c.id === orc.clienteId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label="Destinatário (sem vírgula)"
          hint="A vírgula será acrescentada apenas no PDF e Word"
          className="md:col-span-2"
          error={erroDoCampo('destinatario')}
        >
          <Input
            value={orc.destinatario}
            onChange={(e) =>
              set({
                destinatario: normalizarDestinatario(e.target.value),
                clienteId: null,
                clienteSnapshot: null
              })
            }
            placeholder="Ex.: TMG"
          />
        </Field>
        <Field label="Título" className="md:col-span-2" error={erroDoCampo('titulo')}>
          <Input value={orc.titulo} onChange={(e) => set({ titulo: e.target.value })} />
        </Field>
        <Field label="Prazo (dias)" hint="Opcional">
          <NumberField
            value={orc.prazoDias ?? 0}
            step={1}
            onChange={(v) => set({ prazoDias: v || null })}
            min={0}
          />
        </Field>
        <Field
          label="Introdução / apresentação"
          hint="Parágrafo opcional antes dos serviços"
          className="md:col-span-3"
        >
          <Textarea
            value={orc.introducao ?? ''}
            onChange={(e) => set({ introducao: e.target.value })}
          />
          <RevisaoIA
            texto={orc.introducao ?? ''}
            campo="introducao"
            onAplicar={(introducao) => set({ introducao })}
          />
        </Field>
        <AnotacaoInterna documento={orc} set={set} tipoDocumento="orcamento" />
      </div>
    </Card>
  )
}

/**
 * Anotação livre que identifica o orçamento na listagem (e alimenta a busca).
 * Não sai no documento. O botão preenche uma sugestão com a IA local; o texto
 * continua totalmente editável — ou pode ser escrito do zero, sem usar a IA.
 */
export function AnotacaoInterna({
  documento,
  set,
  tipoDocumento
}: {
  documento: Orcamento | Relatorio
  set: (p: { observacaoInterna?: string }) => void
  tipoDocumento: 'orcamento' | 'relatorio'
}): ReactElement {
  const entrada =
    tipoDocumento === 'orcamento'
      ? { tipo: 'orcamento' as const, documento: documento as Orcamento }
      : { tipo: 'relatorio' as const, documento: documento as Relatorio }
  return (
    <Field
      label="Anotação interna"
      hint="Aparece no histórico e na busca; não sai no documento."
      className="md:col-span-3"
    >
      <Textarea
        value={documento.observacaoInterna ?? ''}
        onChange={(e) => set({ observacaoInterna: e.target.value })}
        placeholder="Ex.: Cercamento da fazenda, aguardando retorno."
        className="min-h-[64px]"
      />
      <div className="flex flex-wrap gap-2">
        <RevisaoIA
          texto={documento.observacaoInterna ?? ''}
          campo="anotacao"
          onAplicar={(observacaoInterna) => set({ observacaoInterna })}
        />
        <RevisaoIA
          texto={documento.observacaoInterna ?? ''}
          campo="anotacao"
          anotacao={entrada}
          onAplicar={(observacaoInterna) => set({ observacaoInterna })}
        />
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
  rotuloTotal = 'Total do orçamento',
  rotuloDocumento = 'orçamento',
  errosValidacao = [],
  onRemover
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
  dados: Dados
  total: number
  titulo?: string
  rotuloTotal?: string
  rotuloDocumento?: 'orçamento' | 'relatório'
  errosValidacao?: ErroValidacao[]
  onRemover?: (id: string) => void
}): ReactElement {
  const [calcAberto, setCalcAberto] = useState<ItemServico | 'novo' | null>(null)
  const [manualAberto, setManualAberto] = useState<ItemServico | 'novo' | null>(null)
  const [catalogoSel, setCatalogoSel] = useState('')

  const catalogoAtual = dados.servicos.find((s) => s.id === catalogoSel)

  const itemDeResultado = (
    r: ResultadoServico,
    base?: ItemServico | null,
    servicoId?: string | null
  ): ItemServico => ({
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
  const remover = (id: string): void => {
    if (onRemover) onRemover(id)
    else set({ itensServico: orc.itensServico.filter((i) => i.id !== id) })
  }

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
            <Select
              value={catalogoSel}
              onChange={(e) => setCatalogoSel(e.target.value)}
              className="w-52"
            >
              <option value="">Do catálogo…</option>
              {dados.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
            <Button icon={Calculator} variant="outline" onClick={() => setCalcAberto('novo')}>
              Com cálculo
            </Button>
            <Button icon={Plus} variant="outline" onClick={() => setManualAberto('novo')}>
              Manual
            </Button>
          </div>
        }
      />

      {errosValidacao.length > 0 && (
        <Mensagem tom="aviso" className="mb-4">
          Revise os serviços destacados antes de concluir o documento.
        </Mensagem>
      )}

      {orc.itensServico.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
          Nenhum serviço adicionado.
        </p>
      ) : (
        <DataTableViewport minWidth="760px" className="rounded-lg border border-slate-200">
          <colgroup>
            <col className="w-[35%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Descrição</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Qtd</th>
              <th className="whitespace-nowrap px-3 py-2">Unid.</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Valor unit.</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <ListaOrdenavel
              itens={orc.itensServico}
              onChange={(itensServico) => set({ itensServico })}
            >
              {orc.itensServico.map((i, indice) => {
                const errosItem = errosDoGrupo(errosValidacao, `itensServico.${indice}`)
                return (
                  <tr key={i.id} className={errosItem.length ? 'bg-amber-50/70' : undefined}>
                    <td className="min-w-0 px-3 py-2 align-middle">
                      <div className="min-w-0 pilha-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 break-words text-slate-700">{i.descricao}</span>
                          {i.calculo && <Badge color="green">calculado</Badge>}
                        </div>
                        {errosItem.length > 0 && (
                          <p className="text-xs text-amber-800">
                            {errosItem.map((erro) => erro.mensagem).join(' ')} Edite o serviço para
                            corrigir.
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                      {i.quantidade}
                    </td>
                    <td className="min-w-0 break-words px-3 py-2 text-slate-600">{i.unidade}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                      {formatMoeda(i.valorUnitario)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-800">
                      {formatMoeda(i.valorTotal)}
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <IconButton
                          icon={Pencil}
                          label={`Editar serviço ${i.descricao}`}
                          onClick={() => editarItem(i)}
                        />
                        <IconButton
                          icon={X}
                          label={`Remover serviço ${i.descricao}`}
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => remover(i.id)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </ListaOrdenavel>
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
        </DataTableViewport>
      )}

      {calcAberto && (
        <ServicoCalculoModal
          parametros={dados.parametros}
          rotuloDocumento={rotuloDocumento}
          descricaoInicial={
            calcAberto === 'novo' ? catalogoAtual?.descricaoPadrao : calcAberto.descricao
          }
          unidadeInicial={calcAberto === 'novo' ? catalogoAtual?.unidade : calcAberto.unidade}
          quantidadeInicial={calcAberto === 'novo' ? undefined : calcAberto.quantidade}
          entradaInicial={calcAberto === 'novo' ? undefined : calcAberto.calculo?.entrada}
          onCancel={() => setCalcAberto(null)}
          onConfirm={(r) => {
            if (calcAberto === 'novo') {
              set({
                itensServico: [
                  ...orc.itensServico,
                  itemDeResultado(r, null, catalogoAtual?.id ?? null)
                ]
              })
              notificar(`Serviço incluído no ${rotuloDocumento}.`, 'sucesso')
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
          precoRefInicial={
            manualAberto === 'novo' ? (catalogoAtual?.precoReferencia ?? undefined) : undefined
          }
          onClose={() => setManualAberto(null)}
          onSave={(item) => {
            if (manualAberto === 'novo') {
              set({ itensServico: [...orc.itensServico, item] })
              notificar(`Serviço incluído no ${rotuloDocumento}.`, 'sucesso')
            } else atualizar(item)
            setManualAberto(null)
          }}
        />
      )}
    </Card>
  )
}

export function ServicoManualModal({
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
}): ReactElement {
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
          <Button icon={Save} onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="pilha-y-4">
        <Field label="Descrição do serviço">
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
          <RevisaoIA texto={descricao} campo="descricaoServico" onAplicar={setDescricao} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantidade">
            <NumberField value={quantidade} onChange={setQuantidade} min={0} />
          </Field>
          <Field label="Unidade">
            <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} />
          </Field>
          <Field label="Valor unitário">
            <NumberField format="money" value={valorUnitario} onChange={setValorUnitario} min={0} />
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
export function MateriaisCard({
  orc,
  set,
  erroDoCampo
}: {
  orc: Orcamento
  set: (p: Partial<Orcamento>) => void
  erroDoCampo: (campo: string) => string | undefined
}): ReactElement {
  const add = (): void =>
    set({
      materiais: [
        ...orc.materiais,
        { id: novoId(), quantidade: 1, unidade: 'un', especificacao: '' }
      ]
    })
  const upd = (id: string, patch: Partial<ItemMaterial>): void =>
    set({ materiais: orc.materiais.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  const rem = (id: string): void => set({ materiais: orc.materiais.filter((m) => m.id !== id) })

  return (
    <Card className="p-6">
      <SectionTitle
        title="Lista de materiais"
        description="Opcional"
        action={
          <Button icon={Plus} variant="outline" onClick={add}>
            Material
          </Button>
        }
      />
      {orc.materiais.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-6 text-center text-sm text-slate-500">
          Nenhum material.
        </p>
      ) : (
        <div className="pilha-y-2">
          <ListaOrdenavel itens={orc.materiais} onChange={(materiais) => set({ materiais })}>
            {orc.materiais.map((m, indice) => (
              <div
                key={m.id}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[80px_100px_minmax(0,1fr)_auto]"
              >
                <Field error={erroDoCampo(`materiais.${indice}.quantidade`)}>
                  <NumberField
                    value={m.quantidade}
                    onChange={(v) => upd(m.id, { quantidade: v })}
                    min={0}
                    aria-label={`Quantidade do material ${indice + 1}`}
                  />
                </Field>
                <Field error={erroDoCampo(`materiais.${indice}.unidade`)}>
                  <Input
                    value={m.unidade}
                    onChange={(e) => upd(m.id, { unidade: e.target.value })}
                    placeholder="un"
                    aria-label={`Unidade do material ${indice + 1}`}
                  />
                </Field>
                <Field error={erroDoCampo(`materiais.${indice}.especificacao`)}>
                  <Input
                    value={m.especificacao}
                    onChange={(e) => upd(m.id, { especificacao: e.target.value })}
                    placeholder="Especificação do material"
                    aria-label={`Especificação do material ${indice + 1}`}
                  />
                </Field>
                <IconButton
                  icon={X}
                  label={`Remover material ${m.especificacao || 'sem descrição'}`}
                  className="self-start text-slate-400"
                  onClick={() => rem(m.id)}
                />
              </div>
            ))}
          </ListaOrdenavel>
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
}): ReactElement {
  const add = (texto = '', origemPadraoId?: string): void =>
    onChange([...itens, { id: novoId(), texto, origemPadraoId }])
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
          <Button icon={Plus} variant="outline" onClick={() => add()}>
            Adicionar
          </Button>
        }
      />
      <div className="pilha-y-2">
        <ListaOrdenavel itens={itens} onChange={onChange}>
          {itens.map((i) => (
            <div key={i.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Textarea
                  value={i.texto}
                  onChange={(e) => upd(i.id, e.target.value)}
                  className="min-h-[52px]"
                />
                <RevisaoIA
                  texto={i.texto}
                  campo={titulo.toLowerCase().includes('pagamento') ? 'pagamento' : 'observacao'}
                  onAplicar={(texto) => upd(i.id, texto)}
                />
              </div>
              <IconButton
                icon={X}
                label="Remover observação ou texto"
                className="mt-1 shrink-0 text-slate-400"
                onClick={() => rem(i.id)}
              />
            </div>
          ))}
        </ListaOrdenavel>
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
