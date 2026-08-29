import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { PageShell, Tabs } from '../ui/layout'
import {
  Button,
  Card,
  Field,
  Input,
  NumberField,
  Select,
  Textarea,
  SectionTitle,
  Checkbox,
  EmptyState,
  ConfirmDialog
} from '../ui/primitives'
import { AppIcon } from '../ui/primitives'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  ConfigIA,
  StatusIA
} from '@shared/types'
import type { InfoNumeracao } from '@shared/api'

const aplicacoes = [
  { valor: 'ambos', rotulo: 'Orçamento e relatório' },
  { valor: 'orcamento', rotulo: 'Somente orçamento' },
  { valor: 'relatorio', rotulo: 'Somente relatório' }
] as const

type Aba = 'empresa' | 'parametros' | 'observacoes' | 'pagamentos' | 'numeracao' | 'dados' | 'ia'

export function ConfiguracoesPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('empresa')
  return (
    <PageShell
      titulo="Configurações"
      descricao="Dados fixos, parâmetros de cálculo e textos padrão"
    >
      <Tabs
        atual={aba}
        onChange={setAba}
        tabs={[
          { id: 'empresa', label: 'Empresa / Cabeçalho' },
          { id: 'parametros', label: 'Parâmetros financeiros' },
          { id: 'observacoes', label: 'Observações padrão' },
          { id: 'pagamentos', label: 'Formas de pagamento' },
          { id: 'numeracao', label: 'Numeração' },
          { id: 'dados', label: 'Dados e backup' },
          { id: 'ia', label: 'IA local' }
        ]}
      />
      {aba === 'empresa' && <SecaoEmpresa />}
      {aba === 'parametros' && <SecaoParametros />}
      {aba === 'observacoes' && <SecaoObservacoes />}
      {aba === 'pagamentos' && <SecaoPagamentos />}
      {aba === 'numeracao' && <SecaoNumeracao />}
      {aba === 'dados' && <SecaoDados />}
      {aba === 'ia' && <SecaoIA />}
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
        <SectionTitle
          title="Dados do cabeçalho"
          description="Aparecem no topo de todos os orçamentos"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome fantasia (destaque)">
            <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} />
          </Field>
          <Field label="Razão social">
            <Input
              value={form.razaoSocial}
              onChange={(e) => set({ razaoSocial: e.target.value })}
            />
          </Field>
          <Field
            label="Nome exibido no menu do app"
            hint="Escolha qual nome aparece na barra lateral"
          >
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
              value={form.nomeExibicao}
              onChange={(e) =>
                set({ nomeExibicao: e.target.value as EmpresaConfig['nomeExibicao'] })
              }
            >
              <option value="nome">Nome fantasia</option>
              <option value="razaoSocial">Razão social</option>
            </select>
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
                  <img
                    src={form.logoDataUrl}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                  />
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
            <NumberField
              value={form.percentualFerias}
              onChange={(v) => set({ percentualFerias: v })}
            />
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
            <NumberField
              value={form.custoContratacao}
              onChange={(v) => set({ custoContratacao: v })}
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
          <Field label="Margem de lucro padrão (%)">
            <NumberField
              value={form.margemLucroPadrao}
              onChange={(v) => set({ margemLucroPadrao: v })}
            />
          </Field>
          <Field label="Alíquota NFS padrão (%)">
            <NumberField
              value={form.aliquotaNotaPadrao}
              onChange={(v) => set({ aliquotaNotaPadrao: v })}
            />
          </Field>
          <Field label="Consumo do veículo padrão (km/l)">
            <NumberField
              value={form.consumoVeiculoPadrao}
              onChange={(v) => set({ consumoVeiculoPadrao: v })}
            />
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
                set({
                  modoImpostoPadrao: e.target.value as ParametrosFinanceiros['modoImpostoPadrao']
                })
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
    await api.observacoes.create({ texto: novo.trim(), padrao: true, aplicacao: 'ambos' })
    setNovo('')
    reload()
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title="Observações padrão"
        description="Defina onde o texto pode ser usado e se ele entra automaticamente em documentos novos"
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Escreva uma nova observação padrão…"
          className="min-h-[80px] flex-1"
        />
        <Button type="button" onClick={adicionar} className="shrink-0 self-start">
          Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((o) => (
          <ItemObservacao key={o.id} obs={o} onChange={reload} />
        ))}
        {data && data.length === 0 && <EmptyState title="Nenhuma observação cadastrada" />}
      </div>
    </Card>
  )
}

function ItemObservacao({
  obs,
  onChange
}: {
  obs: ObservacaoPadrao
  onChange: () => void
}): JSX.Element {
  const [texto, setTexto] = useState(obs.texto)
  const [editando, setEditando] = useState(false)

  const salvar = async (): Promise<void> => {
    await api.observacoes.update(obs.id, { texto })
    setEditando(false)
    onChange()
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
      <div className="min-w-0">
        {editando ? (
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-h-[96px]"
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {obs.texto}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
        <Checkbox
          label="Incluir automaticamente"
          checked={obs.padrao}
          onChange={async (v) => {
            await api.observacoes.update(obs.id, { padrao: v })
            onChange()
          }}
        />
        <Select
          value={obs.aplicacao}
          aria-label="Aplicação da observação"
          onChange={async (e) => {
            await api.observacoes.update(obs.id, {
              aplicacao: e.target.value as ObservacaoPadrao['aplicacao']
            })
            onChange()
          }}
        >
          {aplicacoes.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          {editando ? (
            <>
              <Button type="button" size="sm" onClick={salvar} disabled={!texto.trim()}>
                Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTexto(obs.texto)
                  setEditando(false)
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Excluir observação"
            onClick={async () => {
              await api.observacoes.remove(obs.id)
              onChange()
            }}
          >
            <AppIcon icon={Trash2} />
          </Button>
        </div>
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
    await api.pagamentos.create({ texto: novo.trim(), padrao: false, aplicacao: 'ambos' })
    setNovo('')
    reload()
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title="Formas de pagamento padrão"
        description="Defina onde o texto pode ser usado e se ele entra automaticamente em documentos novos"
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Ex.: Via Pix para a chave…"
          className="min-h-[80px] flex-1"
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
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
      <div className="min-w-0">
        {editando ? (
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-h-[96px]"
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {pag.texto}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
        <Checkbox
          label="Incluir automaticamente"
          checked={pag.padrao}
          onChange={async (v) => {
            await api.pagamentos.update(pag.id, { padrao: v })
            onChange()
          }}
        />
        <Select
          value={pag.aplicacao}
          aria-label="Aplicação da forma de pagamento"
          onChange={async (e) => {
            await api.pagamentos.update(pag.id, {
              aplicacao: e.target.value as FormaPagamentoPadrao['aplicacao']
            })
            onChange()
          }}
        >
          {aplicacoes.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          {editando ? (
            <>
              <Button type="button" size="sm" onClick={salvar} disabled={!texto.trim()}>
                Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTexto(pag.texto)
                  setEditando(false)
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Excluir forma de pagamento"
            onClick={async () => {
              await api.pagamentos.remove(pag.id)
              onChange()
            }}
          >
            <AppIcon icon={Trash2} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- IA local
/**
 * Origem do modelo usado no botão "Sugerir com IA" do editor. Tudo roda na
 * própria máquina: ou o modelo que veio no instalador, ou um Ollama já instalado.
 */
function SecaoIA(): JSX.Element {
  const { data } = useAsync(() => api.ia.get(), [])
  const [form, setForm] = useState<ConfigIA | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [status, setStatus] = useState<StatusIA | null>(null)
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form) return <p className="text-sm text-slate-500">Carregando…</p>

  const set = (patch: Partial<ConfigIA>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
    setStatus(null)
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSalvando(true)
    await api.ia.save(form)
    setSalvando(false)
    setOk(true)
  }

  const testar = async (): Promise<void> => {
    setTestando(true)
    try {
      await api.ia.save(form)
      setStatus(await api.ia.status())
    } catch (e) {
      setStatus({ modo: form.modo, disponivel: false, detalhe: String(e) })
    } finally {
      setTestando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <Card className="p-6">
        <SectionTitle
          title="Sugestão de anotação por IA"
          description="Usada só quando você clica em “Sugerir com IA” no editor. Nada é enviado para a internet."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Origem do modelo">
            <Select
              value={form.modo}
              onChange={(e) => set({ modo: e.target.value as ConfigIA['modo'] })}
            >
              <option value="embutida">Modelo embutido no aplicativo</option>
              <option value="ollama">Ollama instalado na máquina</option>
              <option value="desligada">Desativada</option>
            </Select>
          </Field>
          {form.modo === 'ollama' && (
            <>
              <Field label="Endereço do Ollama">
                <Input
                  value={form.urlOllama}
                  onChange={(e) => set({ urlOllama: e.target.value })}
                />
              </Field>
              <Field label="Modelo" hint="Ex.: llama3.2:3b, qwen2.5:3b">
                <Input
                  value={form.modeloOllama}
                  onChange={(e) => set({ modeloOllama: e.target.value })}
                />
              </Field>
            </>
          )}
        </div>

        {status && (
          <p
            className={
              status.disponivel
                ? 'mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800'
            }
          >
            {status.detalhe}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={testar} disabled={testando}>
            {testando ? 'Testando…' : 'Testar conexão'}
          </Button>
          <BotaoSalvar salvando={salvando} ok={ok} />
        </div>
      </Card>
    </form>
  )
}

// ------------------------------------------------------------------ Numeração
function SecaoNumeracao(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <PainelNumeracao
        titulo="Numeração dos orçamentos"
        documento="orçamento"
        carregar={() => api.orcamentos.numeracao()}
        definirNumero={(numero) => api.orcamentos.definirProximoNumero(numero)}
      />
      <PainelNumeracao
        titulo="Numeração dos relatórios"
        documento="relatório"
        carregar={() => api.relatorios.numeracao()}
        definirNumero={(numero) => api.relatorios.definirProximoNumero(numero)}
      />
    </div>
  )
}

function PainelNumeracao({
  titulo,
  documento,
  carregar,
  definirNumero
}: {
  titulo: string
  documento: string
  carregar: () => Promise<InfoNumeracao>
  definirNumero: (numero: number) => Promise<{ ok: boolean; erro?: string }>
}): JSX.Element {
  const { data, reload } = useAsync(carregar, [])
  const [proximo, setProximo] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (data) setProximo(data.proximoNumero)
  }, [data])

  if (!data || proximo === null) return <p className="text-sm text-slate-500">Carregando…</p>

  const definir = (v: number): void => {
    setProximo(v)
    setOk(false)
    setErro(null)
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const r = await definirNumero(proximo)
    setSalvando(false)
    if (r.ok) {
      setOk(true)
      reload()
    } else {
      setErro(r.erro ?? 'Não foi possível definir o próximo número.')
    }
  }

  return (
    <form onSubmit={salvar}>
      <Card className="p-6">
        <SectionTitle
          title={titulo}
          description={`Define o número que o próximo ${documento} vai receber. Ao excluir o último documento, esse número volta a ficar disponível.`}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Próximo número"
            hint={`Números já usados são recusados para não haver dois ${documento}s com o mesmo número.`}
          >
            <NumberField value={proximo} onChange={definir} min={1} step={1} />
          </Field>
          <div className="space-y-2 self-start md:pt-7">
            <p className="text-sm text-slate-500">
              Maior número em uso:{' '}
              <strong className="text-slate-700">{data.maiorEmUso || '—'}</strong> · Menor número
              livre: <strong className="text-slate-700">{data.menorLivre}</strong> ·{' '}
              {data.totalDocumentos} {documento}
              {data.totalDocumentos === 1 ? '' : 's'}
            </p>
            {proximo !== data.menorLivre && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => definir(data.menorLivre)}
              >
                Usar o menor número livre ({data.menorLivre})
              </Button>
            )}
          </div>
        </div>

        {erro && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{erro}</p>
        )}

        <div className="mt-5 flex justify-end">
          <BotaoSalvar salvando={salvando} ok={ok} />
        </div>
      </Card>
    </form>
  )
}

// ----------------------------------------------------------- Dados e backup
function SecaoDados(): JSX.Element {
  const [ocupado, setOcupado] = useState<'exportar' | 'restaurar' | 'mesclar' | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<'restaurar' | 'mesclar' | null>(null)

  const exportar = async (): Promise<void> => {
    setOcupado('exportar')
    setResultado(null)
    setErro(null)
    try {
      const r = await api.dados.exportar()
      if (r.caminho) setResultado(`Cópia de segurança criada em: ${r.caminho}`)
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setOcupado(null)
    }
  }
  const importar = async (modo: 'restaurar' | 'mesclar'): Promise<void> => {
    setOcupado(modo)
    setResultado(null)
    setErro(null)
    try {
      const r = await api.dados.importar(modo)
      if (!r) return
      const itens = Object.entries(r.importados)
        .filter(([, n]) => n > 0)
        .map(([nome, n]) => `${n} ${nome.replace('_padrao', '')}`)
        .join(', ')
      const ignorados = Object.values(r.ignorados).reduce((a, n) => a + n, 0)
      const renumerados = r.renumerados.orcamentos + r.renumerados.relatorios
      setResultado(
        modo === 'restaurar'
          ? `Backup restaurado com segurança. A cópia anterior foi salva em: ${r.backupAntes}. Feche e abra o aplicativo para carregar os dados restaurados.`
          : `Importação concluída${itens ? `: ${itens}` : ''}.${ignorados ? ` ${ignorados} itens iguais foram mantidos sem duplicar.` : ''}${renumerados ? ` ${renumerados} documento(s) receberam um novo número por conflito.` : ''} A cópia anterior foi salva em: ${r.backupAntes}.`
      )
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle
          title="Cópia de segurança"
          description="Gera um único arquivo protegido com clientes, documentos, imagens, logo e configurações."
        />
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Guarde esse arquivo em um local seguro. Ele permite recuperar o aplicativo em outro
            computador sem perder os anexos.
          </p>
          <Button type="button" onClick={exportar} disabled={ocupado !== null}>
            {ocupado === 'exportar' ? 'Exportando…' : 'Exportar backup…'}
          </Button>
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle
          title="Importar dados"
          description="Todo processo valida o arquivo e salva uma cópia datada do banco atual antes de alterar qualquer dado."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800">Restaurar tudo</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Substitui documentos e configurações deste computador exatamente pelo backup
              selecionado.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => setConfirmacao('restaurar')}
              disabled={ocupado !== null}
            >
              {ocupado === 'restaurar' ? 'Restaurando…' : 'Escolher backup e restaurar…'}
            </Button>
          </div>
          <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4">
            <h3 className="font-semibold text-slate-800">Manter dados atuais</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Importa clientes e documentos sem apagar os existentes. Empresa, logo, parâmetros
              financeiros e IA deste computador são preservados.
            </p>
            <Button
              type="button"
              className="mt-4"
              onClick={() => setConfirmacao('mesclar')}
              disabled={ocupado !== null}
            >
              {ocupado === 'mesclar' ? 'Importando…' : 'Escolher backup e importar…'}
            </Button>
          </div>
        </div>
      </Card>
      {resultado && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
        >
          {resultado}
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
          {erro}
        </p>
      )}
      <ConfirmDialog
        open={Boolean(confirmacao)}
        title={confirmacao === 'restaurar' ? 'Restaurar backup' : 'Importar mantendo dados'}
        description={
          confirmacao === 'restaurar'
            ? 'A restauração substituirá os dados e configurações deste computador pelo arquivo escolhido. Uma cópia automática será criada antes.'
            : 'A importação preservará empresa, logo, parâmetros financeiros e IA locais, conciliando os demais dados. Uma cópia automática será criada antes.'
        }
        confirmLabel="Continuar"
        onCancel={() => setConfirmacao(null)}
        onConfirm={async () => {
          const modo = confirmacao
          setConfirmacao(null)
          if (modo) await importar(modo)
        }}
      />
    </div>
  )
}
