import { MensagemFlutuante } from '../../components/MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { useBloqueioEdicao } from '../../lib/nav'
import { Card, Field, NumberField, Select, SectionTitle, Mensagem } from '../../ui/primitives'
import type { ParametrosFinanceiros } from '@shared/types'
import { mensagemValidacao, validarParametrosFinanceiros } from '@shared/validacao'
import { BotaoSalvar } from './comum'
import type { ReactElement } from 'react'

// ------------------------------------------------------------ Parâmetros
export function SecaoParametros(): ReactElement {
  const { data, error: erroCarga } = useAsync(() => api.parametros.get(), [])
  const [form, setForm] = useState<ParametrosFinanceiros | null>(null)
  const [salvo, setSalvo] = useState('')
  useBloqueioEdicao(!!form && JSON.stringify(form) !== salvo)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setForm(data)
      setSalvo(JSON.stringify(data))
    }
  }, [data])

  if (!form)
    return (
      <p className={erroCarga ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {erroCarga ? `Não foi possível carregar os parâmetros. ${erroCarga}` : 'Carregando…'}
      </p>
    )

  const set = (patch: Partial<ParametrosFinanceiros>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const erros = validarParametrosFinanceiros(form)
    if (erros.length) {
      setErro(mensagemValidacao(erros))
      setOk(false)
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await api.parametros.save(form)
      setSalvo(JSON.stringify(form))
      setOk(true)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form id="config-parametros" onSubmit={salvar} className="pilha-y-5">
      <Card className="p-6">
        <SectionTitle
          title="Encargos CLT (%)"
          description="Estimativa configurável aplicada sobre o salário proporcional; confirme percentuais com o contador ou a folha"
        />
        <Mensagem tom="aviso" className="mb-4">
          A provisão rescisória não substitui o cálculo oficial: a multa do FGTS depende do
          histórico integral dos depósitos e a contribuição patronal varia conforme o enquadramento
          tributário.
        </Mensagem>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Férias (%)">
            <NumberField
              value={form.percentualFerias}
              onChange={(v) => set({ percentualFerias: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="13º salário (%)">
            <NumberField
              value={form.percentualDecimoTerceiro}
              onChange={(v) => set({ percentualDecimoTerceiro: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="FGTS (%)">
            <NumberField
              value={form.percentualFgts}
              onChange={(v) => set({ percentualFgts: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="INSS patronal (%)">
            <NumberField
              value={form.percentualInss}
              onChange={(v) => set({ percentualInss: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="Provisão rescisória estimada (%)">
            <NumberField
              value={form.percentualMultaRescisao}
              onChange={(v) => set({ percentualMultaRescisao: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="Dias base do mês" hint="Divisor do salário mensal (ex.: 30)">
            <NumberField
              value={form.diasBaseMes}
              onChange={(v) => set({ diasBaseMes: v })}
              min={1}
              max={31}
              step={1}
            />
          </Field>
          <Field label="Custo de contratação (R$)" hint="Por funcionário (exames, admissão)">
            <NumberField
              value={form.custoContratacao}
              format="money"
              onChange={(v) => set({ custoContratacao: v })}
              min={0}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle
          title="Padrões de preço"
          description="Valores iniciais sugeridos ao criar um cálculo"
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Percentual padrão de lucro sobre o custo (%)">
            <NumberField
              value={form.margemLucroPadrao}
              onChange={(v) => set({ margemLucroPadrao: v })}
              min={0}
            />
          </Field>
          <Field label="Alíquota do imposto padrão (%)">
            <NumberField
              value={form.aliquotaNotaPadrao}
              onChange={(v) => set({ aliquotaNotaPadrao: v })}
              min={0}
              max={form.modoImpostoPadrao === 'gross_up' ? 99.99 : 100}
            />
          </Field>
          <Field label="Consumo do veículo padrão (km/l)">
            <NumberField
              value={form.consumoVeiculoPadrao}
              onChange={(v) => set({ consumoVeiculoPadrao: v })}
              min={0}
            />
          </Field>
          <Field label="Preço do combustível padrão (R$/l)">
            <NumberField
              value={form.precoCombustivelPadrao}
              format="money"
              onChange={(v) => set({ precoCombustivelPadrao: v })}
              min={0}
            />
          </Field>
          <Field label="Valor da refeição padrão (R$)">
            <NumberField
              value={form.valorRefeicaoPadrao}
              format="money"
              onChange={(v) => set({ valorRefeicaoPadrao: v })}
              min={0}
            />
          </Field>
          <Field
            label="Cálculo do imposto padrão"
            hint="O modo de preservar valor líquido incorpora o imposto ao preço final."
          >
            <Select
              value={form.modoImpostoPadrao}
              onChange={(e) =>
                set({
                  modoImpostoPadrao: e.target.value as ParametrosFinanceiros['modoImpostoPadrao']
                })
              }
            >
              <option value="gross_up">Preservar valor líquido (gross-up)</option>
              <option value="simples">Somar imposto ao preço</option>
            </Select>
          </Field>
        </div>
        {erro && <MensagemFlutuante className="mt-4">{erro}</MensagemFlutuante>}
        <BotaoSalvar salvando={salvando} ok={ok} />
      </Card>
    </form>
  )
}
