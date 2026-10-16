import { RevisaoIA } from './RevisaoIA'
import { ListaOrdenavel } from '../ui/ordenavel'
import { useMemo, useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import {
  atingirPrecoDesejado,
  retirarMetaPreco,
  calcularCustoServico,
  criarEntradaCalculo,
  normalizarEntrada
} from '@shared/calculo/engine'
import type { EntradaCalculo, ModoAplicacao, ParametrosFinanceiros } from '@shared/types'
import { formatMoeda } from '@shared/format'
import {
  Button,
  Card,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  NumberField,
  NumericInput,
  Select,
  cn,
  Mensagem
} from '../ui/primitives'
import { novoId, type ResultadoServico } from './tipos'
import { mensagemValidacao, validarEntradaCalculo } from '@shared/validacao'

interface Props {
  parametros: ParametrosFinanceiros
  descricaoInicial?: string
  unidadeInicial?: string
  quantidadeInicial?: number
  entradaInicial?: EntradaCalculo
  onCancel: () => void
  onConfirm: (r: ResultadoServico) => void
  rotuloDocumento?: 'orçamento' | 'relatório'
  modoServico?: 'calculado' | 'manual'
}

function ModoSelect({
  value,
  onChange
}: {
  value: ModoAplicacao
  onChange: (m: ModoAplicacao) => void
}): JSX.Element {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ModoAplicacao)}>
      <option value="cheio">Valor total</option>
      <option value="diario">Por dia</option>
    </Select>
  )
}

/** Cartão de uma seção de custo com um cabeçalho e conteúdo. */
function Bloco({
  titulo,
  children,
  acao
}: {
  titulo: string
  children: React.ReactNode
  acao?: React.ReactNode
}): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{titulo}</h4>
        {acao}
      </div>
      {children}
    </Card>
  )
}

export function ServicoCalculoModal({
  parametros,
  descricaoInicial,
  unidadeInicial,
  quantidadeInicial,
  entradaInicial,
  onCancel,
  onConfirm,
  rotuloDocumento = 'orçamento',
  modoServico = 'calculado'
}: Props): JSX.Element {
  const [descricao, setDescricao] = useState(descricaoInicial ?? '')
  const [unidade, setUnidade] = useState(unidadeInicial ?? 'serviço')
  const [quantidade, setQuantidade] = useState(quantidadeInicial ?? 1)
  const [e, setE] = useState<EntradaCalculo>(() =>
    normalizarEntrada(entradaInicial ?? criarEntradaCalculo(parametros))
  )
  const [erro, setErro] = useState<string | null>(null)

  const [precoDesejado, setPrecoDesejado] = useState<number | ''>(
    () =>
      entradaInicial?.precoFinalDesejado ??
      calcularCustoServico(normalizarEntrada(entradaInicial ?? criarEntradaCalculo(parametros)))
        .precoFinal
  )
  const [avisoMeta, setAvisoMeta] = useState('')
  const [erroMeta, setErroMeta] = useState('')
  const set = (patch: Partial<EntradaCalculo>): void => {
    const tinhaMetaAplicada = e.precoFinalDesejado != null
    if (tinhaMetaAplicada)
      setAvisoMeta(
        'O cálculo foi alterado. Aplique o preço desejado novamente se quiser manter a meta.'
      )
    setErroMeta('')
    setE((prev) => ({ ...retirarMetaPreco(prev), ...patch }))
    if (!tinhaMetaAplicada) setPrecoDesejado(calcularCustoServico({ ...e, ...patch }).precoFinal)
  }
  const sincronizarPrecoDesejado = (valor: number | ''): void => {
    setPrecoDesejado(valor)
    setErroMeta('')
    setAvisoMeta('')
    const semMeta = retirarMetaPreco(e)
    if (valor === '') {
      setE(semMeta)
      return
    }
    try {
      const erros = validarEntradaCalculo(semMeta)
      if (erros.length) throw new Error(mensagemValidacao(erros))
      const meta = atingirPrecoDesejado(semMeta, valor)
      if (meta.alterado) setE(meta.entrada)
      setAvisoMeta(meta.mensagem)
    } catch (erro) {
      setE(semMeta)
      setErroMeta(erro instanceof Error ? erro.message : 'Revise o preço desejado.')
    }
  }
  const sincronizarPercentual = (percentual: number): void => {
    const entradaAtualizada = { ...retirarMetaPreco(e), margemLucroPercent: percentual }
    const precoAtual = calcularCustoServico(entradaAtualizada).precoFinal
    setE({ ...entradaAtualizada, precoFinalDesejado: precoAtual, ajustePreco: 0 })
    setPrecoDesejado(precoAtual)
    setErroMeta('')
    setAvisoMeta('O preço desejado acompanha automaticamente o percentual e os custos atuais.')
  }
  const resultado = useMemo(() => calcularCustoServico(e), [e])

  const valorUnitario = quantidade > 0 ? resultado.precoFinal / quantidade : resultado.precoFinal

  const confirmar = (): void => {
    const erros = validarEntradaCalculo(e)
    if (!descricao.trim())
      erros.unshift({ campo: 'descricao', mensagem: 'Informe a descrição do serviço.' })
    if (!unidade.trim())
      erros.unshift({ campo: 'unidade', mensagem: 'Informe a unidade do serviço.' })
    if (!Number.isFinite(quantidade) || quantidade <= 0)
      erros.unshift({ campo: 'quantidade', mensagem: 'A quantidade deve ser maior que zero.' })
    if (erros.length) {
      setErro(mensagemValidacao(erros))
      return
    }
    onConfirm({
      descricao: descricao.trim(),
      unidade: unidade.trim(),
      quantidade,
      valorUnitario,
      valorTotal: resultado.precoFinal,
      calculo: modoServico === 'manual' ? null : { entrada: e, resultado }
    })
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={modoServico === 'manual' ? 'Adicionar serviço' : 'Calcular preço do serviço'}
      size="3xl"
    >
      {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Coluna de entradas */}
        <div className="space-y-4">
          <Bloco titulo="Serviço">
            <div className="space-y-3">
              <Field label="Descrição do serviço">
                <Input
                  value={descricao}
                  onChange={(ev) => setDescricao(ev.target.value)}
                  placeholder="Descreva o serviço que será executado"
                />
                <RevisaoIA texto={descricao} campo="descricaoServico" onAplicar={setDescricao} />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Unidade">
                  <Input value={unidade} onChange={(ev) => setUnidade(ev.target.value)} />
                </Field>
                <Field
                  label="Quantidade"
                  hint="Quantidade de unidades usada para calcular o preço unitário"
                >
                  <NumberField value={quantidade} onChange={setQuantidade} min={1} />
                </Field>
                <Field label="Dias de serviço" hint="Duração usada nos custos aplicados por dia">
                  <NumberField value={e.dias} onChange={(v) => set({ dias: v })} min={1} />
                </Field>
              </div>
            </div>
          </Bloco>

          {modoServico === 'calculado' && (
            <>
              <MaoDeObraBloco e={e} set={set} />
              <AlimentacaoBloco e={e} set={set} parametros={parametros} />
              <FerramentasBloco e={e} set={set} />
              <CombustivelBloco e={e} set={set} parametros={parametros} />
              <EstadiaBloco e={e} set={set} />
              <AvulsosBloco e={e} set={set} />

              <Bloco titulo="Formação do preço">
                <div className="space-y-3">
                  <Checkbox
                    label="Incluir imposto da nota fiscal no preço"
                    checked={e.emitirNota}
                    onChange={(v) => set({ emitirNota: v })}
                  />
                  {e.emitirNota && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Alíquota do imposto (%)">
                        <NumberField
                          value={e.aliquotaNotaPercent}
                          onChange={(v) => set({ aliquotaNotaPercent: v })}
                          min={0}
                          max={e.modoImposto === 'gross_up' ? 99.99 : 100}
                        />
                      </Field>
                      <Field label="Cálculo do imposto">
                        <Select
                          value={e.modoImposto}
                          onChange={(ev) =>
                            set({ modoImposto: ev.target.value as EntradaCalculo['modoImposto'] })
                          }
                        >
                          <option value="gross_up">Preservar valor líquido (gross-up)</option>
                          <option value="simples">Somar imposto ao preço</option>
                        </Select>
                      </Field>
                    </div>
                  )}
                  <Field
                    label="Percentual geral de lucro sobre o custo (%)"
                    hint="Aplicado aos custos sem percentual próprio. O preço desejado acompanha esse percentual automaticamente."
                  >
                    <NumberField
                      value={e.margemLucroPercent}
                      onChange={sincronizarPercentual}
                      min={0}
                    />
                  </Field>
                  <div className="space-y-3 border-t border-slate-200 pt-3">
                    <Field
                      label="Preço final desejado deste serviço (R$)"
                      hint="Considera todas as unidades deste serviço e o imposto habilitado. Ao alterar o valor, o percentual geral se ajusta automaticamente; custos, lucros próprios e repasses são preservados."
                    >
                      <NumericInput
                        format="money"
                        value={precoDesejado}
                        onValueChange={(v) => sincronizarPrecoDesejado(v === '' ? '' : Number(v))}
                        min={0}
                      />
                    </Field>
                    {erroMeta && <Mensagem>{erroMeta}</Mensagem>}
                    {avisoMeta && <Mensagem tom="info">{avisoMeta}</Mensagem>}
                  </div>
                </div>
              </Bloco>
            </>
          )}
        </div>

        {/* Coluna de resumo */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <h4 className="text-sm font-semibold text-slate-700">Resumo do cálculo</h4>
            </div>
            <div className="max-h-[40vh] space-y-1.5 overflow-y-auto px-4 py-3">
              {resultado.breakdown.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-400">
                  Adicione custos para ver o detalhamento
                </p>
              )}
              {(['servico', 'avulsos'] as const).map((grupo) => {
                const itens = resultado.breakdown.filter((l) =>
                  grupo === 'avulsos'
                    ? l.chave.startsWith('avulso:')
                    : !l.chave.startsWith('avulso:')
                )
                if (itens.length === 0) return null
                return (
                  <div key={grupo} className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-600">
                      {grupo === 'servico' ? 'Custos do serviço' : 'Outros custos e repasses'}
                    </p>
                    {itens.map((l) => (
                      <div key={l.chave} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words text-slate-500" title={l.detalhe}>
                          {l.descricao}
                        </span>
                        <span className="shrink-0 font-medium text-slate-700">
                          {formatMoeda(l.valorApresentado ?? l.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="space-y-1.5 border-t border-slate-200 bg-white px-4 py-3 text-sm">
              <Linha
                label="Custo do serviço"
                valor={resultado.custoServico ?? resultado.custoTotal}
              />
              <Linha label="Outros custos e repasses" valor={resultado.outrosCustosRepasses ?? 0} />
              <Linha label="Lucro" valor={resultado.lucroServico ?? 0} />
              {(resultado.ajustePreco ?? 0) > 0 && (
                <Linha label="Complemento até o preço desejado" valor={resultado.ajustePreco!} />
              )}
              {resultado.emitirNota && (
                <Linha
                  label={`Imposto (${new Intl.NumberFormat('pt-BR').format(resultado.aliquotaNotaPercent)}%)`}
                  valor={resultado.impostoNota}
                />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-800">Preço final</span>
                <span className="text-lg font-bold text-brand-tealDark">
                  {formatMoeda(resultado.precoFinal)}
                </span>
              </div>
              {quantidade > 0 && (
                <p className="text-right text-xs text-slate-400">
                  {formatMoeda(valorUnitario)} / {unidade}
                </p>
              )}
            </div>
          </Card>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
            <Button icon={Check} className="flex-1" onClick={confirmar}>
              Usar no {rotuloDocumento}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Linha({ label, valor }: { label: string; valor: number }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 text-slate-600">
      <span className="min-w-0 leading-5">{label}</span>
      <span className="shrink-0 whitespace-nowrap font-medium">{formatMoeda(valor)}</span>
    </div>
  )
}

// ----------------------------------------------------- Blocos de componentes
type BlocoProps = { e: EntradaCalculo; set: (p: Partial<EntradaCalculo>) => void }

function MaoDeObraBloco({ e, set }: BlocoProps): JSX.Element {
  const add = (): void =>
    set({
      maoDeObra: [...e.maoDeObra, { id: novoId(), qtdFuncionarios: 1, base: 'diaria', valor: 0 }]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['maoDeObra'][number]>): void =>
    set({ maoDeObra: e.maoDeObra.map((g) => (g.id === id ? { ...g, ...patch } : g)) })
  const rem = (id: string): void => set({ maoDeObra: e.maoDeObra.filter((g) => g.id !== id) })

  return (
    <Bloco
      titulo="Mão de obra"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Grupo
        </Button>
      }
    >
      <div className="space-y-3">
        {e.maoDeObra.length === 0 && (
          <p className="text-xs text-slate-400">Nenhum grupo de mão de obra.</p>
        )}
        <ListaOrdenavel itens={e.maoDeObra} onChange={(maoDeObra) => set({ maoDeObra })}>
          {e.maoDeObra.map((g) => (
            <div key={g.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-end gap-2">
                <Field label="Descrição" className="flex-1">
                  <Input
                    placeholder="Identifique a equipe ou o profissional"
                    value={g.descricao ?? ''}
                    onChange={(ev) => upd(g.id, { descricao: ev.target.value })}
                  />
                </Field>
                <IconButton
                  icon={X}
                  label="Remover grupo de mão de obra"
                  onClick={() => rem(g.id)}
                  className="text-slate-400"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Funcionários">
                  <NumberField
                    value={g.qtdFuncionarios}
                    step={1}
                    onChange={(v) => upd(g.id, { qtdFuncionarios: v })}
                    min={0}
                  />
                </Field>
                <Field label="Forma de pagamento">
                  <Select
                    value={g.base}
                    onChange={(ev) => upd(g.id, { base: ev.target.value as typeof g.base })}
                  >
                    <option value="diaria">Por diária</option>
                    <option value="valor_cheio">Valor fechado</option>
                    <option value="mensal">Valor mensal</option>
                  </Select>
                </Field>
                <Field
                  label={
                    g.base === 'diaria'
                      ? 'Valor da diária'
                      : g.base === 'mensal'
                        ? 'Valor mensal pago'
                        : 'Valor por func.'
                  }
                >
                  <NumberField
                    format="money"
                    value={g.valor}
                    onChange={(v) => upd(g.id, { valor: v })}
                    min={0}
                  />
                </Field>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Checkbox
                  label="CLT (carteira assinada)"
                  checked={!!g.clt}
                  onChange={(v) =>
                    upd(g.id, {
                      clt: v,
                      salarioCarteira:
                        v && g.salarioCarteira === undefined && g.base === 'mensal'
                          ? g.valor
                          : g.salarioCarteira
                    })
                  }
                />
                {g.clt && (
                  <div className="mt-2 space-y-2">
                    <Field
                      label="Salário registrado na carteira (mensal)"
                      hint="Base dos encargos e da rescisão — pode diferir do valor pago"
                    >
                      <NumberField
                        value={g.salarioCarteira ?? 0}
                        format="money"
                        onChange={(v) => upd(g.id, { salarioCarteira: v })}
                        min={0}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-4">
                      <Checkbox
                        label="Houve contratação"
                        checked={!!g.houveContratacao}
                        onChange={(v) => upd(g.id, { houveContratacao: v })}
                      />
                      <Checkbox
                        label="Incluir provisão rescisória estimada"
                        checked={!!g.demitidoAoFim}
                        onChange={(v) => upd(g.id, { demitidoAoFim: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}

/** Cabeçalho de um item de lista: descrição livre + botão de remover. */
function LinhaDescricao({
  valor,
  placeholder,
  onChange,
  onRemove
}: {
  valor: string
  placeholder: string
  onChange: (v: string) => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="mb-2 flex items-end gap-2">
      <Field label="Descrição" className="flex-1">
        <Input
          placeholder={placeholder}
          value={valor}
          onChange={(ev) => onChange(ev.target.value)}
        />
      </Field>
      <IconButton icon={X} label="Remover item" onClick={onRemove} className="text-slate-400" />
    </div>
  )
}

function AlimentacaoBloco({
  e,
  set,
  parametros
}: BlocoProps & { parametros: ParametrosFinanceiros }): JSX.Element {
  const add = (): void =>
    set({
      alimentacoes: [
        ...e.alimentacoes,
        {
          id: novoId(),
          descricao: '',
          qtdPessoas: 0,
          valorRefeicao: parametros.valorRefeicaoPadrao,
          modo: 'diario'
        }
      ]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['alimentacoes'][number]>): void =>
    set({ alimentacoes: e.alimentacoes.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const rem = (id: string): void => set({ alimentacoes: e.alimentacoes.filter((a) => a.id !== id) })

  return (
    <Bloco
      titulo="Alimentação"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Refeição
        </Button>
      }
    >
      <div className="space-y-3">
        {e.alimentacoes.length === 0 && (
          <p className="text-xs text-slate-400">
            Inclua os custos de alimentação das pessoas envolvidas no serviço.
          </p>
        )}
        <ListaOrdenavel itens={e.alimentacoes} onChange={(alimentacoes) => set({ alimentacoes })}>
          {e.alimentacoes.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <LinhaDescricao
                valor={a.descricao ?? ''}
                placeholder="Identifique a despesa de alimentação"
                onChange={(v) => upd(a.id, { descricao: v })}
                onRemove={() => rem(a.id)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Pessoas">
                  <NumberField
                    value={a.qtdPessoas}
                    onChange={(v) => upd(a.id, { qtdPessoas: v })}
                    min={0}
                  />
                </Field>
                <Field label="Valor por refeição">
                  <NumberField
                    value={a.valorRefeicao}
                    format="money"
                    onChange={(v) => upd(a.id, { valorRefeicao: v })}
                    min={0}
                  />
                </Field>
                <Field label="Aplicação">
                  <ModoSelect value={a.modo} onChange={(m) => upd(a.id, { modo: m })} />
                </Field>
              </div>
            </div>
          ))}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}

function FerramentasBloco({ e, set }: BlocoProps): JSX.Element {
  const add = (): void =>
    set({
      ferramentas: [
        ...e.ferramentas,
        { id: novoId(), descricao: '', tipo: 'insumo', valor: 0, modo: 'diario' }
      ]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['ferramentas'][number]>): void =>
    set({ ferramentas: e.ferramentas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const rem = (id: string): void => set({ ferramentas: e.ferramentas.filter((f) => f.id !== id) })

  return (
    <Bloco
      titulo="Ferramentas (manutenção / insumos)"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Item
        </Button>
      }
    >
      <div className="space-y-2">
        {e.ferramentas.length === 0 && (
          <p className="text-xs text-slate-400">
            Inclua insumos e despesas de manutenção dos equipamentos usados no serviço.
          </p>
        )}
        <ListaOrdenavel itens={e.ferramentas} onChange={(ferramentas) => set({ ferramentas })}>
          {e.ferramentas.map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200 p-3">
              <LinhaDescricao
                valor={f.descricao}
                placeholder="Identifique o insumo ou a manutenção"
                onChange={(descricao) => upd(f.id, { descricao })}
                onRemove={() => rem(f.id)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Categoria">
                  <Select
                    value={f.tipo}
                    onChange={(ev) => upd(f.id, { tipo: ev.target.value as typeof f.tipo })}
                  >
                    <option value="insumo">Insumo</option>
                    <option value="manutencao">Manutenção</option>
                  </Select>
                </Field>
                <Field label="Valor do custo (R$)">
                  <NumberField
                    format="money"
                    value={f.valor}
                    onChange={(v) => upd(f.id, { valor: v })}
                    min={0}
                  />
                </Field>
                <Field label="Aplicação">
                  <ModoSelect value={f.modo} onChange={(m) => upd(f.id, { modo: m })} />
                </Field>
              </div>
            </div>
          ))}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}

function CombustivelBloco({
  e,
  set,
  parametros
}: BlocoProps & { parametros: ParametrosFinanceiros }): JSX.Element {
  const add = (): void =>
    set({
      combustiveis: [
        ...e.combustiveis,
        {
          id: novoId(),
          descricao: '',
          distanciaKm: 0,
          consumoKmL: parametros.consumoVeiculoPadrao,
          precoLitro: parametros.precoCombustivelPadrao,
          modo: 'cheio'
        }
      ]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['combustiveis'][number]>): void =>
    set({ combustiveis: e.combustiveis.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const rem = (id: string): void => set({ combustiveis: e.combustiveis.filter((c) => c.id !== id) })

  return (
    <Bloco
      titulo="Combustível / deslocamento"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Veículo
        </Button>
      }
    >
      <div className="space-y-3">
        {e.combustiveis.length === 0 && (
          <p className="text-xs text-slate-400">Um item por veículo usado no serviço.</p>
        )}
        <ListaOrdenavel itens={e.combustiveis} onChange={(combustiveis) => set({ combustiveis })}>
          {e.combustiveis.map((c) => {
            const dist = c.modo === 'diario' ? c.distanciaKm * (e.dias || 0) : c.distanciaKm
            const litros = c.consumoKmL > 0 ? dist / c.consumoKmL : 0
            return (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                <LinhaDescricao
                  valor={c.descricao ?? ''}
                  placeholder="Identifique o veículo ou o deslocamento"
                  onChange={(v) => upd(c.id, { descricao: v })}
                  onRemove={() => rem(c.id)}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={c.modo === 'diario' ? 'Km por dia' : 'Km total'}>
                    <NumberField
                      value={c.distanciaKm}
                      onChange={(v) => upd(c.id, { distanciaKm: v })}
                      min={0}
                    />
                  </Field>
                  <Field label="Consumo (km/l)">
                    <NumberField
                      value={c.consumoKmL}
                      onChange={(v) => upd(c.id, { consumoKmL: v })}
                      min={0}
                    />
                  </Field>
                  <Field label="Preço do litro">
                    <NumberField
                      value={c.precoLitro}
                      format="money"
                      onChange={(v) => upd(c.id, { precoLitro: v })}
                      min={0}
                    />
                  </Field>
                  <Field label="Aplicação">
                    <ModoSelect value={c.modo} onChange={(m) => upd(c.id, { modo: m })} />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {dist} km ÷ {c.consumoKmL || 0} km/l = {litros.toFixed(1)} litros
                </p>
              </div>
            )
          })}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}

function EstadiaBloco({ e, set }: BlocoProps): JSX.Element {
  const add = (): void =>
    set({
      estadias: [
        ...e.estadias,
        {
          id: novoId(),
          descricao: '',
          tipo: 'por_pessoa',
          qtdPessoas: 0,
          valorPorPessoa: 0,
          modo: 'diario',
          valorMensal: 0,
          qtdMeses: 1
        }
      ]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['estadias'][number]>): void =>
    set({ estadias: e.estadias.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const rem = (id: string): void => set({ estadias: e.estadias.filter((s) => s.id !== id) })

  return (
    <Bloco
      titulo="Estadia / hospedagem"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Estadia
        </Button>
      }
    >
      <div className="space-y-3">
        {e.estadias.length === 0 && (
          <p className="text-xs text-slate-400">
            Inclua despesas de hospedagem por pessoa ou de aluguel de imóvel.
          </p>
        )}
        <ListaOrdenavel itens={e.estadias} onChange={(estadias) => set({ estadias })}>
          {e.estadias.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3">
              <LinhaDescricao
                valor={s.descricao ?? ''}
                placeholder="Identifique a hospedagem ou o aluguel"
                onChange={(v) => upd(s.id, { descricao: v })}
                onRemove={() => rem(s.id)}
              />
              <div
                className={cn(
                  'grid gap-3',
                  s.tipo === 'aluguel' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
                )}
              >
                <Field label="Tipo">
                  <Select
                    value={s.tipo}
                    onChange={(ev) => upd(s.id, { tipo: ev.target.value as typeof s.tipo })}
                  >
                    <option value="por_pessoa">Por pessoa</option>
                    <option value="aluguel">Aluguel de imóvel</option>
                  </Select>
                </Field>
                {s.tipo === 'aluguel' ? (
                  <>
                    <Field label="Valor mensal">
                      <NumberField
                        value={s.valorMensal ?? 0}
                        format="money"
                        onChange={(v) => upd(s.id, { valorMensal: v })}
                        min={0}
                      />
                    </Field>
                    <Field label="Meses" hint="Aceita fração (ex.: 1,5)">
                      <NumberField
                        value={s.qtdMeses ?? 0}
                        onChange={(v) => upd(s.id, { qtdMeses: v })}
                        min={0}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Pessoas">
                      <NumberField
                        value={s.qtdPessoas}
                        onChange={(v) => upd(s.id, { qtdPessoas: v })}
                        min={0}
                      />
                    </Field>
                    <Field label="Valor por pessoa">
                      <NumberField
                        value={s.valorPorPessoa}
                        format="money"
                        onChange={(v) => upd(s.id, { valorPorPessoa: v })}
                        min={0}
                      />
                    </Field>
                    <Field label="Aplicação">
                      <ModoSelect value={s.modo} onChange={(m) => upd(s.id, { modo: m })} />
                    </Field>
                  </>
                )}
              </div>
            </div>
          ))}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}

function AvulsosBloco({ e, set }: BlocoProps): JSX.Element {
  const add = (): void =>
    set({ avulsos: [...e.avulsos, { id: novoId(), descricao: '', valor: 0, modo: 'cheio' }] })
  const upd = (id: string, patch: Partial<EntradaCalculo['avulsos'][number]>): void =>
    set({ avulsos: e.avulsos.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
  const rem = (id: string): void => set({ avulsos: e.avulsos.filter((a) => a.id !== id) })

  return (
    <Bloco
      titulo="Outros custos e repasses"
      acao={
        <Button icon={Plus} size="sm" variant="outline" onClick={add}>
          Custo
        </Button>
      }
    >
      <div className="space-y-2">
        {e.avulsos.length === 0 && (
          <p className="text-xs text-slate-400">
            Inclua despesas adicionais do serviço. Escolha o percentual de lucro ou o repasse pelo
            custo em cada item.
          </p>
        )}
        <ListaOrdenavel itens={e.avulsos} onChange={(avulsos) => set({ avulsos })}>
          {e.avulsos.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <LinhaDescricao
                valor={a.descricao}
                placeholder="Identifique a despesa adicional"
                onChange={(descricao) => upd(a.id, { descricao })}
                onRemove={() => rem(a.id)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Valor do custo (R$)">
                  <NumberField
                    format="money"
                    value={a.valor}
                    onChange={(v) => upd(a.id, { valor: v })}
                    min={0}
                  />
                </Field>
                <Field label="Aplicação">
                  <ModoSelect value={a.modo} onChange={(m) => upd(a.id, { modo: m })} />
                </Field>
              </div>
              <div className="mt-3 space-y-1.5">
                <Field label="Cálculo do lucro deste item">
                  <Select
                    value={
                      a.aplicarAcrescimo === false
                        ? 'sem'
                        : a.acrescimoPersonalizadoPercent != null
                          ? 'proprio'
                          : 'geral'
                    }
                    onChange={(ev) =>
                      upd(a.id, {
                        aplicarAcrescimo: ev.target.value !== 'sem',
                        acrescimoPersonalizadoPercent:
                          ev.target.value === 'proprio'
                            ? (a.acrescimoPersonalizadoPercent ?? e.margemLucroPercent)
                            : undefined
                      })
                    }
                  >
                    <option value="geral">
                      Usar percentual geral de lucro ({e.margemLucroPercent}%)
                    </option>
                    <option value="proprio">Usar percentual próprio de lucro</option>
                    <option value="sem">Sem lucro — repassar pelo custo</option>
                  </Select>
                </Field>
                {a.aplicarAcrescimo !== false && a.acrescimoPersonalizadoPercent != null && (
                  <Field
                    label="Percentual próprio de lucro deste item (%)"
                    hint="Substitui o percentual geral somente neste item."
                  >
                    <NumberField
                      value={a.acrescimoPersonalizadoPercent}
                      min={0}
                      onChange={(v) => upd(a.id, { acrescimoPersonalizadoPercent: v })}
                    />
                  </Field>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  {a.aplicarAcrescimo === false
                    ? 'Cobrado pelo valor do custo. O imposto da nota será incluído se aplicável.'
                    : `O lucro será calculado uma vez, à taxa de ${a.acrescimoPersonalizadoPercent ?? e.margemLucroPercent}% sobre este custo.`}
                </p>
              </div>
            </div>
          ))}
        </ListaOrdenavel>
      </div>
    </Bloco>
  )
}
