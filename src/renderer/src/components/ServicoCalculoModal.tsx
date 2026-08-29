import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { calcularCustoServico, criarEntradaCalculo, normalizarEntrada } from '@shared/calculo/engine'
import type { EntradaCalculo, ModoAplicacao, ParametrosFinanceiros } from '@shared/types'
import { formatMoeda } from '@shared/format'
import { Button, Card, Checkbox, Field, IconButton, Input, NumberField, Select, cn } from '../ui/primitives'
import { novoId, type ResultadoServico } from './tipos'

interface Props {
  parametros: ParametrosFinanceiros
  descricaoInicial?: string
  unidadeInicial?: string
  quantidadeInicial?: number
  entradaInicial?: EntradaCalculo
  onCancel: () => void
  onConfirm: (r: ResultadoServico) => void
}

function ModoSelect({
  value,
  onChange
}: {
  value: ModoAplicacao
  onChange: (m: ModoAplicacao) => void
}): JSX.Element {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ModoAplicacao)} className="w-32">
      <option value="cheio">Valor cheio</option>
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
  onConfirm
}: Props): JSX.Element {
  const [descricao, setDescricao] = useState(descricaoInicial ?? '')
  const [unidade, setUnidade] = useState(unidadeInicial ?? 'serviço')
  const [quantidade, setQuantidade] = useState(quantidadeInicial ?? 1)
  const [e, setE] = useState<EntradaCalculo>(() =>
    normalizarEntrada(entradaInicial ?? criarEntradaCalculo(parametros))
  )

  const set = (patch: Partial<EntradaCalculo>): void => setE((prev) => ({ ...prev, ...patch }))
  const resultado = useMemo(() => calcularCustoServico(e), [e])

  const valorUnitario = quantidade > 0 ? resultado.precoFinal / quantidade : resultado.precoFinal

  const confirmar = (): void => {
    onConfirm({
      descricao: descricao.trim() || 'Serviço',
      unidade,
      quantidade,
      valorUnitario,
      valorTotal: resultado.precoFinal,
      calculo: { entrada: e, resultado }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Calcular custo do serviço</h3>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 overflow-y-auto p-6 lg:grid-cols-[1fr_340px]">
          {/* Coluna de entradas */}
          <div className="space-y-4">
            <Bloco titulo="Serviço">
              <div className="space-y-3">
                <Field label="Descrição do serviço">
                  <Input value={descricao} onChange={(ev) => setDescricao(ev.target.value)} placeholder="Ex.: Construção de 400m de cerca…" />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Unidade">
                    <Input value={unidade} onChange={(ev) => setUnidade(ev.target.value)} />
                  </Field>
                  <Field label="Quantidade" hint="Para derivar valor unitário">
                    <NumberField value={quantidade} onChange={setQuantidade} min={0} />
                  </Field>
                  <Field label="Dias de serviço" hint="Multiplica custos 'por dia'">
                    <NumberField value={e.dias} onChange={(v) => set({ dias: v })} min={0} />
                  </Field>
                </div>
              </div>
            </Bloco>

            <MaoDeObraBloco e={e} set={set} />
            <AlimentacaoBloco e={e} set={set} parametros={parametros} />
            <FerramentasBloco e={e} set={set} />
            <CombustivelBloco e={e} set={set} parametros={parametros} />
            <EstadiaBloco e={e} set={set} />
            <AvulsosBloco e={e} set={set} />

            <Bloco titulo="Nota fiscal e margem">
              <div className="space-y-3">
                <Checkbox
                  label="Emitir Nota Fiscal de Serviço (adiciona imposto ao preço)"
                  checked={e.emitirNota}
                  onChange={(v) => set({ emitirNota: v })}
                />
                {e.emitirNota && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Alíquota da nota (%)">
                      <NumberField value={e.aliquotaNotaPercent} onChange={(v) => set({ aliquotaNotaPercent: v })} />
                    </Field>
                    <Field label="Modo do imposto">
                      <Select
                        value={e.modoImposto}
                        onChange={(ev) => set({ modoImposto: ev.target.value as EntradaCalculo['modoImposto'] })}
                      >
                        <option value="gross_up">Gross-up (preserva margem)</option>
                        <option value="simples">Simples (soma alíquota)</option>
                      </Select>
                    </Field>
                  </div>
                )}
                <Field label="Margem de lucro (%)">
                  <NumberField value={e.margemLucroPercent} onChange={(v) => set({ margemLucroPercent: v })} />
                </Field>
              </div>
            </Bloco>
          </div>

          {/* Coluna de resumo */}
          <div className="lg:sticky lg:top-4 lg:self-start">
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
                {resultado.breakdown.map((l) => (
                  <div key={l.chave} className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-500" title={l.detalhe}>
                      {l.descricao}
                    </span>
                    <span className="shrink-0 font-medium text-slate-700">{formatMoeda(l.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 border-t border-slate-200 bg-white px-4 py-3 text-sm">
                <Linha label="Custo total" valor={resultado.custoTotal} />
                <Linha label={`Margem (${resultado.margemLucroPercent}%)`} valor={resultado.valorMargem} />
                {resultado.emitirNota && (
                  <Linha label={`Imposto NFS (${resultado.aliquotaNotaPercent}%)`} valor={resultado.impostoNota} />
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
              <Button className="flex-1" onClick={confirmar}>
                Usar no orçamento
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Linha({ label, valor }: { label: string; valor: number }): JSX.Element {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-medium">{formatMoeda(valor)}</span>
    </div>
  )
}

// ----------------------------------------------------- Blocos de componentes
type BlocoProps = { e: EntradaCalculo; set: (p: Partial<EntradaCalculo>) => void }

function MaoDeObraBloco({ e, set }: BlocoProps): JSX.Element {
  const add = (): void =>
    set({
      maoDeObra: [
        ...e.maoDeObra,
        { id: novoId(), qtdFuncionarios: 1, base: 'diaria', valor: 0 }
      ]
    })
  const upd = (id: string, patch: Partial<EntradaCalculo['maoDeObra'][number]>): void =>
    set({ maoDeObra: e.maoDeObra.map((g) => (g.id === id ? { ...g, ...patch } : g)) })
  const rem = (id: string): void => set({ maoDeObra: e.maoDeObra.filter((g) => g.id !== id) })

  return (
    <Bloco
      titulo="Mão de obra"
      acao={
        <Button size="sm" variant="outline" onClick={add}>
          + Grupo
        </Button>
      }
    >
      <div className="space-y-3">
        {e.maoDeObra.length === 0 && <p className="text-xs text-slate-400">Nenhum grupo de mão de obra.</p>}
        {e.maoDeObra.map((g) => (
          <div key={g.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-end gap-2">
              <Field label="Descrição" className="flex-1">
                <Input
                  placeholder="Ex.: Diária a R$ 170 — equipe de cerca"
                  value={g.descricao ?? ''}
                  onChange={(ev) => upd(g.id, { descricao: ev.target.value })}
                />
              </Field>
              <IconButton icon={X} label="Remover grupo de mão de obra" onClick={() => rem(g.id)} className="text-slate-400" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Field label="Funcionários">
                <NumberField value={g.qtdFuncionarios} onChange={(v) => upd(g.id, { qtdFuncionarios: v })} min={0} />
              </Field>
              <Field label="Forma de pagamento">
                <Select value={g.base} onChange={(ev) => upd(g.id, { base: ev.target.value as typeof g.base })}>
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
                <NumberField value={g.valor} onChange={(v) => upd(g.id, { valor: v })} min={0} />
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
                      v && g.salarioCarteira === undefined && g.base === 'mensal' ? g.valor : g.salarioCarteira
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
                      label="Demitido ao fim (rescisão)"
                      checked={!!g.demitidoAoFim}
                      onChange={(v) => upd(g.id, { demitidoAoFim: v })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
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
        <Input placeholder={placeholder} value={valor} onChange={(ev) => onChange(ev.target.value)} />
      </Field>
      <IconButton icon={X} label="Remover item" onClick={onRemove} className="text-slate-400" />
    </div>
  )
}

function AlimentacaoBloco({ e, set, parametros }: BlocoProps & { parametros: ParametrosFinanceiros }): JSX.Element {
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
        <Button size="sm" variant="outline" onClick={add}>
          + Refeição
        </Button>
      }
    >
      <div className="space-y-3">
        {e.alimentacoes.length === 0 && (
          <p className="text-xs text-slate-400">Ex.: café da manhã, almoço, janta.</p>
        )}
        {e.alimentacoes.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-200 p-3">
            <LinhaDescricao
              valor={a.descricao ?? ''}
              placeholder="Ex.: Almoço na obra"
              onChange={(v) => upd(a.id, { descricao: v })}
              onRemove={() => rem(a.id)}
            />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Pessoas">
                <NumberField value={a.qtdPessoas} onChange={(v) => upd(a.id, { qtdPessoas: v })} min={0} />
              </Field>
              <Field label="Valor por refeição">
                <NumberField value={a.valorRefeicao} onChange={(v) => upd(a.id, { valorRefeicao: v })} min={0} />
              </Field>
              <Field label="Aplicação">
                <ModoSelect value={a.modo} onChange={(m) => upd(a.id, { modo: m })} />
              </Field>
            </div>
          </div>
        ))}
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
        <Button size="sm" variant="outline" onClick={add}>
          + Item
        </Button>
      }
    >
      <div className="space-y-2">
        {e.ferramentas.length === 0 && (
          <p className="text-xs text-slate-400">Ex.: gasolina de motoserra, manutenção de roçadeira.</p>
        )}
        {e.ferramentas.map((f) => (
          <div key={f.id} className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Input placeholder="Descrição" value={f.descricao} onChange={(ev) => upd(f.id, { descricao: ev.target.value })} />
            <Select value={f.tipo} onChange={(ev) => upd(f.id, { tipo: ev.target.value as typeof f.tipo })}>
              <option value="insumo">Insumo</option>
              <option value="manutencao">Manutenção</option>
            </Select>
            <NumberField value={f.valor} onChange={(v) => upd(f.id, { valor: v })} min={0} />
            <div className="flex items-center gap-1">
              <ModoSelect value={f.modo} onChange={(m) => upd(f.id, { modo: m })} />
              <IconButton icon={X} label="Remover ferramenta" onClick={() => rem(f.id)} className="text-slate-400" />
            </div>
          </div>
        ))}
      </div>
    </Bloco>
  )
}

function CombustivelBloco({ e, set, parametros }: BlocoProps & { parametros: ParametrosFinanceiros }): JSX.Element {
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
        <Button size="sm" variant="outline" onClick={add}>
          + Veículo
        </Button>
      }
    >
      <div className="space-y-3">
        {e.combustiveis.length === 0 && (
          <p className="text-xs text-slate-400">Um item por veículo usado no serviço.</p>
        )}
        {e.combustiveis.map((c) => {
          const dist = c.modo === 'diario' ? c.distanciaKm * (e.dias || 0) : c.distanciaKm
          const litros = c.consumoKmL > 0 ? dist / c.consumoKmL : 0
          return (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3">
              <LinhaDescricao
                valor={c.descricao ?? ''}
                placeholder="Ex.: Caminhonete da equipe"
                onChange={(v) => upd(c.id, { descricao: v })}
                onRemove={() => rem(c.id)}
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label={c.modo === 'diario' ? 'Km por dia' : 'Km total'}>
                  <NumberField value={c.distanciaKm} onChange={(v) => upd(c.id, { distanciaKm: v })} min={0} />
                </Field>
                <Field label="Consumo (km/l)">
                  <NumberField value={c.consumoKmL} onChange={(v) => upd(c.id, { consumoKmL: v })} min={0} />
                </Field>
                <Field label="Preço do litro">
                  <NumberField value={c.precoLitro} onChange={(v) => upd(c.id, { precoLitro: v })} min={0} />
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
        <Button size="sm" variant="outline" onClick={add}>
          + Estadia
        </Button>
      }
    >
      <div className="space-y-3">
        {e.estadias.length === 0 && (
          <p className="text-xs text-slate-400">Ex.: hotel por pessoa, casa alugada por mês.</p>
        )}
        {e.estadias.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-200 p-3">
            <LinhaDescricao
              valor={s.descricao ?? ''}
              placeholder="Ex.: Casa alugada em Itaberaí"
              onChange={(v) => upd(s.id, { descricao: v })}
              onRemove={() => rem(s.id)}
            />
            <div className={cn('grid gap-3', s.tipo === 'aluguel' ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4')}>
              <Field label="Tipo">
                <Select value={s.tipo} onChange={(ev) => upd(s.id, { tipo: ev.target.value as typeof s.tipo })}>
                  <option value="por_pessoa">Por pessoa</option>
                  <option value="aluguel">Aluguel de imóvel</option>
                </Select>
              </Field>
              {s.tipo === 'aluguel' ? (
                <>
                  <Field label="Valor mensal">
                    <NumberField value={s.valorMensal ?? 0} onChange={(v) => upd(s.id, { valorMensal: v })} min={0} />
                  </Field>
                  <Field label="Meses" hint="Aceita fração (ex.: 1,5)">
                    <NumberField value={s.qtdMeses ?? 0} onChange={(v) => upd(s.id, { qtdMeses: v })} min={0} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Pessoas">
                    <NumberField value={s.qtdPessoas} onChange={(v) => upd(s.id, { qtdPessoas: v })} min={0} />
                  </Field>
                  <Field label="Valor por pessoa">
                    <NumberField
                      value={s.valorPorPessoa}
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
      titulo="Outros custos"
      acao={
        <Button size="sm" variant="outline" onClick={add}>
          + Custo
        </Button>
      }
    >
      <div className="space-y-2">
        {e.avulsos.length === 0 && <p className="text-xs text-slate-400">Custos que não se encaixam nas categorias acima.</p>}
        {e.avulsos.map((a) => (
          <div key={a.id} className="grid grid-cols-[2fr_1fr_auto] gap-2">
            <Input placeholder="Descrição" value={a.descricao} onChange={(ev) => upd(a.id, { descricao: ev.target.value })} />
            <NumberField value={a.valor} onChange={(v) => upd(a.id, { valor: v })} min={0} />
            <div className="flex items-center gap-1">
              <ModoSelect value={a.modo} onChange={(m) => upd(a.id, { modo: m })} />
              <IconButton icon={X} label="Remover outro custo" onClick={() => rem(a.id)} className={cn('text-slate-400')} />
            </div>
          </div>
        ))}
      </div>
    </Bloco>
  )
}
