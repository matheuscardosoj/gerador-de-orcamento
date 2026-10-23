import { RevisaoIA } from './RevisaoIA'
import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import {
  atingirPrecoDesejado,
  retirarMetaPreco,
  calcularCustoServico,
  criarEntradaCalculo,
  normalizarEntrada
} from '@shared/calculo/engine'
import type { EntradaCalculo, ParametrosFinanceiros } from '@shared/types'
import { formatMoeda } from '@shared/format'
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Modal,
  NumberField,
  NumericInput,
  Select
} from '../ui/primitives'
import { concluirNotificacao, notificar } from '../lib/notificacoes'
import { type ResultadoServico } from './tipos'
import {
  MaoDeObraBloco,
  AlimentacaoBloco,
  FerramentasBloco,
  CombustivelBloco,
  EstadiaBloco,
  AvulsosBloco,
  Bloco,
  Linha
} from './ServicoCalculoBlocos'
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
  useEffect(() => {
    const chave = 'calculo-servico-validacao'
    concluirNotificacao(chave)
    if (erro) notificar(erro, 'erro', { chave, persistente: true })
    return () => concluirNotificacao(chave)
  }, [erro])
  useEffect(() => {
    const chave = 'calculo-servico-meta-erro'
    concluirNotificacao(chave)
    if (erroMeta) notificar(erroMeta, 'erro', { chave, persistente: true })
    return () => concluirNotificacao(chave)
  }, [erroMeta])
  useEffect(() => {
    const chave = 'calculo-servico-meta-aviso'
    concluirNotificacao(chave)
    if (!avisoMeta) return () => concluirNotificacao(chave)
    const persistente =
      avisoMeta.startsWith('A meta não cobre') || avisoMeta.startsWith('O cálculo foi alterado')
    notificar(avisoMeta, persistente ? 'aviso' : 'info', { chave, persistente })
    return () => concluirNotificacao(chave)
  }, [avisoMeta])
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
                  </div>
                </div>
              </Bloco>
            </>
          )}
        </div>

        {/* Coluna de resumo */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 bg-surface px-4 py-3">
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
            <div className="space-y-1.5 border-t border-slate-200 bg-surface px-4 py-3 text-sm">
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
