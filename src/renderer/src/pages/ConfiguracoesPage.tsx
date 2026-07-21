import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { PageShell, Tabs } from '../ui/layout'
import {
  Button,
  Card,
  Field,
  Input,
  NumberField,
  Textarea,
  SectionTitle,
  Checkbox,
  EmptyState
} from '../ui/primitives'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  ObservacaoPadrao,
  FormaPagamentoPadrao
} from '@shared/types'

type Aba = 'empresa' | 'parametros' | 'observacoes' | 'pagamentos'

export function ConfiguracoesPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('empresa')
  return (
    <PageShell titulo="Configurações" descricao="Dados fixos, parâmetros de cálculo e textos padrão">
      <Tabs
        atual={aba}
        onChange={setAba}
        tabs={[
          { id: 'empresa', label: 'Empresa / Cabeçalho' },
          { id: 'parametros', label: 'Parâmetros financeiros' },
          { id: 'observacoes', label: 'Observações padrão' },
          { id: 'pagamentos', label: 'Formas de pagamento' }
        ]}
      />
      {aba === 'empresa' && <SecaoEmpresa />}
      {aba === 'parametros' && <SecaoParametros />}
      {aba === 'observacoes' && <SecaoObservacoes />}
      {aba === 'pagamentos' && <SecaoPagamentos />}
    </PageShell>
  )
}

function BotaoSalvar({ salvando, ok }: { salvando: boolean; ok: boolean }): JSX.Element {
  return (
    <Button type="submit" disabled={salvando}>
      {salvando ? 'Salvando…' : ok ? '✓ Salvo' : 'Salvar alterações'}
    </Button>
  )
}

// --------------------------------------------------------------- Empresa
function SecaoEmpresa(): JSX.Element {
  const { data } = useAsync(() => api.empresa.get(), [])
  const [form, setForm] = useState<EmpresaConfig | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form) return <p className="text-sm text-slate-500">Carregando…</p>

  const set = (patch: Partial<EmpresaConfig>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSalvando(true)
    await api.empresa.save(form)
    setSalvando(false)
    setOk(true)
  }

  const trocarLogo = async (): Promise<void> => {
    const dataUrl = await api.logo.selecionar()
    if (dataUrl) set({ logoDataUrl: dataUrl })
  }

  return (
    <form onSubmit={salvar}>
      <Card className="p-6">
        <SectionTitle title="Dados do cabeçalho" description="Aparecem no topo de todos os orçamentos" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome fantasia (destaque)">
            <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} />
          </Field>
          <Field label="Razão social">
            <Input value={form.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} />
          </Field>
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={(e) => set({ cnpj: e.target.value })} />
          </Field>
          <Field label="Telefones">
            <Input value={form.telefones} onChange={(e) => set({ telefones: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Site">
            <Input value={form.site} onChange={(e) => set({ site: e.target.value })} />
          </Field>
          <Field label="Endereço" className="md:col-span-2">
            <Input value={form.endereco} onChange={(e) => set({ endereco: e.target.value })} />
          </Field>
        </div>

        <SectionTitle title="Logo e assinatura" description="Logo do cabeçalho e faixa do rodapé" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">Logo</span>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {form.logoDataUrl ? (
                  <img src={form.logoDataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">sem logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" size="sm" onClick={trocarLogo}>
                  Selecionar imagem…
                </Button>
                {form.logoDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set({ logoDataUrl: null })}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
          <Field label="Texto da assinatura / rodapé">
            <Input
              value={form.textoAssinatura}
              onChange={(e) => set({ textoAssinatura: e.target.value })}
            />
          </Field>
          <Field label="Cor da faixa do rodapé">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.corFaixaRodape}
                onChange={(e) => set({ corFaixaRodape: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-slate-300"
              />
              <Input
                value={form.corFaixaRodape}
                onChange={(e) => set({ corFaixaRodape: e.target.value })}
                className="w-32"
              />
            </div>
          </Field>
        </div>

        <div className="mt-6 flex justify-end">
          <BotaoSalvar salvando={salvando} ok={ok} />
        </div>
      </Card>
    </form>
  )
}

// ------------------------------------------------------------ Parâmetros
function SecaoParametros(): JSX.Element {
  const { data } = useAsync(() => api.parametros.get(), [])
  const [form, setForm] = useState<ParametrosFinanceiros | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form) return <p className="text-sm text-slate-500">Carregando…</p>

  const set = (patch: Partial<ParametrosFinanceiros>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSalvando(true)
    await api.parametros.save(form)
    setSalvando(false)
    setOk(true)
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      <Card className="p-6">
        <SectionTitle
          title="Encargos CLT (%)"
          description="Aplicados sobre o salário proporcional no cálculo de mão de obra com carteira assinada"
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Férias (%)">
            <NumberField value={form.percentualFerias} onChange={(v) => set({ percentualFerias: v })} />
          </Field>
          <Field label="13º salário (%)">
            <NumberField
              value={form.percentualDecimoTerceiro}
              onChange={(v) => set({ percentualDecimoTerceiro: v })}
            />
          </Field>
          <Field label="FGTS (%)">
            <NumberField value={form.percentualFgts} onChange={(v) => set({ percentualFgts: v })} />
          </Field>
          <Field label="INSS patronal (%)">
            <NumberField value={form.percentualInss} onChange={(v) => set({ percentualInss: v })} />
          </Field>
          <Field label="Multa/rescisão (%)">
            <NumberField
              value={form.percentualMultaRescisao}
              onChange={(v) => set({ percentualMultaRescisao: v })}
            />
          </Field>
          <Field label="Dias base do mês" hint="Divisor do salário mensal (ex.: 30)">
            <NumberField value={form.diasBaseMes} onChange={(v) => set({ diasBaseMes: v })} />
          </Field>
          <Field label="Custo de contratação (R$)" hint="Por funcionário (exames, admissão)">
            <NumberField value={form.custoContratacao} onChange={(v) => set({ custoContratacao: v })} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle title="Padrões de preço" description="Valores iniciais sugeridos ao criar um cálculo" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Margem de lucro padrão (%)">
            <NumberField value={form.margemLucroPadrao} onChange={(v) => set({ margemLucroPadrao: v })} />
          </Field>
          <Field label="Alíquota NFS padrão (%)">
            <NumberField value={form.aliquotaNotaPadrao} onChange={(v) => set({ aliquotaNotaPadrao: v })} />
          </Field>
          <Field label="Consumo do veículo padrão (km/l)">
            <NumberField value={form.consumoVeiculoPadrao} onChange={(v) => set({ consumoVeiculoPadrao: v })} />
          </Field>
          <Field label="Preço do combustível padrão (R$/l)">
            <NumberField
              value={form.precoCombustivelPadrao}
              onChange={(v) => set({ precoCombustivelPadrao: v })}
            />
          </Field>
          <Field label="Valor da refeição padrão (R$)">
            <NumberField
              value={form.valorRefeicaoPadrao}
              onChange={(v) => set({ valorRefeicaoPadrao: v })}
            />
          </Field>
          <Field label="Modo do imposto padrão" hint="Gross-up preserva a margem líquida">
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
              value={form.modoImpostoPadrao}
              onChange={(e) =>
                set({ modoImpostoPadrao: e.target.value as ParametrosFinanceiros['modoImpostoPadrao'] })
              }
            >
              <option value="gross_up">Gross-up (dividir por 1 − alíquota)</option>
              <option value="simples">Simples (somar alíquota)</option>
            </select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end">
          <BotaoSalvar salvando={salvando} ok={ok} />
        </div>
      </Card>
    </form>
  )
}

// ----------------------------------------------------------- Observações
function SecaoObservacoes(): JSX.Element {
  const { data, reload } = useAsync(() => api.observacoes.list(), [])
  const [novo, setNovo] = useState('')

  const adicionar = async (): Promise<void> => {
    if (!novo.trim()) return
    await api.observacoes.create({ texto: novo.trim(), padrao: true })
    setNovo('')
    reload()
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title="Observações padrão"
        description="As marcadas como padrão já vêm selecionadas em novos orçamentos"
      />
      <div className="mb-4 flex gap-2">
        <Textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Escreva uma nova observação padrão…"
          className="min-h-[44px]"
        />
        <Button type="button" onClick={adicionar} className="shrink-0 self-start">
          Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((o) => (
          <ItemObservacao key={o.id} obs={o} onChange={reload} />
        ))}
        {data && data.length === 0 && (
          <EmptyState title="Nenhuma observação cadastrada" />
        )}
      </div>
    </Card>
  )
}

function ItemObservacao({ obs, onChange }: { obs: ObservacaoPadrao; onChange: () => void }): JSX.Element {
  const [texto, setTexto] = useState(obs.texto)
  const [editando, setEditando] = useState(false)

  const salvar = async (): Promise<void> => {
    await api.observacoes.update(obs.id, { texto })
    setEditando(false)
    onChange()
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <Checkbox
        checked={obs.padrao}
        onChange={async (v) => {
          await api.observacoes.update(obs.id, { padrao: v })
          onChange()
        }}
      />
      <div className="flex-1">
        {editando ? (
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[60px]" />
        ) : (
          <p className="text-sm text-slate-700">{obs.texto}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {editando ? (
          <Button type="button" size="sm" onClick={salvar}>
            Salvar
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(true)}>
            Editar
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await api.observacoes.remove(obs.id)
            onChange()
          }}
        >
          🗑
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- Pagamentos
function SecaoPagamentos(): JSX.Element {
  const { data, reload } = useAsync(() => api.pagamentos.list(), [])
  const [novo, setNovo] = useState('')

  const adicionar = async (): Promise<void> => {
    if (!novo.trim()) return
    await api.pagamentos.create({ texto: novo.trim(), padrao: false })
    setNovo('')
    reload()
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title="Formas de pagamento padrão"
        description="A marcada como padrão sempre aparece em novos orçamentos"
      />
      <div className="mb-4 flex gap-2">
        <Textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Ex.: Via Pix para a chave…"
          className="min-h-[44px]"
        />
        <Button type="button" onClick={adicionar} className="shrink-0 self-start">
          Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((p) => (
          <ItemPagamento key={p.id} pag={p} onChange={reload} />
        ))}
        {data && data.length === 0 && <EmptyState title="Nenhuma forma de pagamento cadastrada" />}
      </div>
    </Card>
  )
}

function ItemPagamento({
  pag,
  onChange
}: {
  pag: FormaPagamentoPadrao
  onChange: () => void
}): JSX.Element {
  const [texto, setTexto] = useState(pag.texto)
  const [editando, setEditando] = useState(false)

  const salvar = async (): Promise<void> => {
    await api.pagamentos.update(pag.id, { texto })
    setEditando(false)
    onChange()
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <Checkbox
        label="padrão"
        checked={pag.padrao}
        onChange={async (v) => {
          await api.pagamentos.update(pag.id, { padrao: v })
          onChange()
        }}
      />
      <div className="flex-1">
        {editando ? (
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[60px]" />
        ) : (
          <p className="text-sm text-slate-700">{pag.texto}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {editando ? (
          <Button type="button" size="sm" onClick={salvar}>
            Salvar
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(true)}>
            Editar
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await api.pagamentos.remove(pag.id)
            onChange()
          }}
        >
          🗑
        </Button>
      </div>
    </div>
  )
}
