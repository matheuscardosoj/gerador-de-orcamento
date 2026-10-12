import { PadroesConfig } from './PadroesConfig'
import { NuvemSection } from './NuvemSection'
import { UsuariosSection } from './UsuariosSection'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Save, Check, Plus, Download, ArchiveRestore, Import } from 'lucide-react'
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
  SectionTitle,
  Checkbox,
  ConfirmDialog,
  Mensagem
} from '../ui/primitives'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  ConfigIA,
  StatusIA,
  CampoCliente
} from '@shared/types'
import type { InfoNumeracao } from '@shared/api'
import {
  mensagemValidacao,
  validarParametrosFinanceiros,
  validarUrlOllamaLocal
} from '@shared/validacao'

type Aba =
  | 'nuvem'
  | 'usuarios'
  | 'empresa'
  | 'parametros'
  | 'observacoes'
  | 'pagamentos'
  | 'numeracao'
  | 'dados'
  | 'ia'

type EstadoSalvar = { salvando: boolean; ok: boolean; disabled: boolean }
const AcoesFormulario = createContext<{
  formId?: string
  atualizar: (estado: EstadoSalvar) => void
} | null>(null)

export function ConfiguracoesPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('empresa')
  const [novoUsuario, setNovoUsuario] = useState(false)
  const [novoTexto, setNovoTexto] = useState(false)
  const [estadoSalvar, setEstadoSalvar] = useState<EstadoSalvar>({
    salvando: false,
    ok: false,
    disabled: false
  })
  const formId = ['empresa', 'parametros', 'ia'].includes(aba) ? `config-${aba}` : undefined
  return (
    <AcoesFormulario.Provider value={{ formId, atualizar: setEstadoSalvar }}>
      <PageShell
        largura="full"
        titulo="Configurações"
        descricao="Dados fixos, parâmetros de cálculo e textos padrão"
        acoes={
          aba === 'usuarios' ? (
            <Button icon={Plus} onClick={() => setNovoUsuario(true)}>
              Vincular usuário
            </Button>
          ) : aba === 'observacoes' || aba === 'pagamentos' ? (
            <Button icon={Plus} onClick={() => setNovoTexto(true)}>
              {aba === 'observacoes' ? 'Nova observação' : 'Nova forma de pagamento'}
            </Button>
          ) : formId ? (
            <Button
              icon={estadoSalvar.ok && !estadoSalvar.salvando ? Check : Save}
              type="submit"
              form={formId}
              disabled={estadoSalvar.disabled}
            >
              {estadoSalvar.salvando
                ? 'Salvando…'
                : estadoSalvar.ok
                  ? 'Salvo'
                  : 'Salvar alterações'}
            </Button>
          ) : undefined
        }
      >
        <Tabs
          atual={aba}
          onChange={(aba) => {
            setAba(aba)
            setNovoTexto(false)
          }}
          tabs={[
            { id: 'empresa', label: 'Empresa / Cabeçalho' },
            { id: 'parametros', label: 'Parâmetros financeiros' },
            { id: 'observacoes', label: 'Observações padrão' },
            { id: 'pagamentos', label: 'Formas de pagamento' },
            { id: 'numeracao', label: 'Numeração dos documentos' },
            { id: 'dados', label: 'Dados e backup' },
            { id: 'nuvem', label: 'Nuvem / Sincronização' },
            { id: 'usuarios', label: 'Usuários' },
            { id: 'ia', label: 'IA local' }
          ]}
        />
        {aba === 'nuvem' && <NuvemSection />}
        {aba === 'usuarios' && <UsuariosSection novo={novoUsuario} setNovo={setNovoUsuario} />}
        {aba === 'empresa' && <SecaoEmpresa />}
        {aba === 'parametros' && <SecaoParametros />}
        {aba === 'observacoes' && (
          <PadroesConfig tipo="observacoes" novo={novoTexto} setNovo={setNovoTexto} />
        )}
        {aba === 'pagamentos' && (
          <PadroesConfig tipo="pagamentos" novo={novoTexto} setNovo={setNovoTexto} />
        )}
        {aba === 'numeracao' && <SecaoNumeracao />}
        {aba === 'dados' && <SecaoDados />}
        {aba === 'ia' && <SecaoIA />}
      </PageShell>
    </AcoesFormulario.Provider>
  )
}

function BotaoSalvar({
  salvando,
  ok,
  disabled = salvando
}: {
  salvando: boolean
  ok: boolean
  disabled?: boolean
}): JSX.Element | null {
  const contexto = useContext(AcoesFormulario)
  const atualizar = contexto?.atualizar,
    formId = contexto?.formId
  useEffect(() => {
    if (formId && atualizar) atualizar({ salvando, ok, disabled })
  }, [formId, atualizar, salvando, ok, disabled])
  if (formId) return null
  return (
    <Button icon={ok && !salvando ? Check : Save} type="submit" disabled={disabled}>
      {salvando ? 'Salvando…' : ok ? 'Salvo' : 'Salvar alterações'}
    </Button>
  )
}

function detalheErro(erro: unknown): string {
  const detalhe = String(erro)
    .replace(/^Error:\s*/, '')
    .trim()
  return detalhe || 'Ocorreu um erro inesperado.'
}

type ExecutarMutacao<Operacao extends string> = (
  operacao: Operacao,
  tarefa: () => Promise<unknown>
) => Promise<boolean>

/** Serializa operações de uma mesma seção e sempre devolve o controle à interface. */
function useMutacao<Operacao extends string>(): {
  operacao: Operacao | null
  ocupado: boolean
  erro: string | null
  executar: ExecutarMutacao<Operacao>
  limparErro: () => void
} {
  const [operacao, setOperacao] = useState<Operacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const emAndamento = useRef(false)

  const executar: ExecutarMutacao<Operacao> = async (proximaOperacao, tarefa) => {
    if (emAndamento.current) return false
    emAndamento.current = true
    setOperacao(proximaOperacao)
    setErro(null)
    try {
      await tarefa()
      return true
    } catch (causa) {
      setErro(detalheErro(causa))
      return false
    } finally {
      emAndamento.current = false
      setOperacao(null)
    }
  }

  return { operacao, ocupado: operacao !== null, erro, executar, limparErro: () => setErro(null) }
}

// --------------------------------------------------------------- Empresa
function SecaoEmpresa(): JSX.Element {
  const { data, error: erroCarga } = useAsync(() => api.empresa.get(), [])
  const [form, setForm] = useState<EmpresaConfig | null>(null)
  const { operacao, ocupado, erro, executar, limparErro } = useMutacao<'salvar' | 'logo'>()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form)
    return (
      <p className={erroCarga ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {erroCarga ? `Não foi possível carregar os dados da empresa. ${erroCarga}` : 'Carregando…'}
      </p>
    )

  const set = (patch: Partial<EmpresaConfig>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
    limparErro()
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const salvo = await executar('salvar', async () => {
      await api.empresa.save(form)
    })
    if (salvo) setOk(true)
  }

  const trocarLogo = async (): Promise<void> => {
    await executar('logo', async () => {
      const dataUrl = await api.logo.selecionar()
      if (dataUrl) set({ logoDataUrl: dataUrl })
    })
  }

  return (
    <form id="config-empresa" onSubmit={salvar}>
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
            <Select
              value={form.nomeExibicao}
              onChange={(e) =>
                set({ nomeExibicao: e.target.value as EmpresaConfig['nomeExibicao'] })
              }
            >
              <option value="nome">Nome fantasia</option>
              <option value="razaoSocial">Razão social</option>
            </Select>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={trocarLogo}
                  disabled={ocupado}
                >
                  {operacao === 'logo' ? 'Selecionando…' : 'Selecionar imagem…'}
                </Button>
                {form.logoDataUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set({ logoDataUrl: null })}
                    disabled={ocupado}
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

        <div className="mt-6">
          <SectionTitle
            title="Dados do cliente nos novos documentos"
            description="O nome sempre aparece. Você pode mudar estes campos em cada proposta, relatório ou recibo."
          />
          <div className="flex flex-wrap gap-4">
            {(
              [
                ['documento', 'CPF / CNPJ'],
                ['endereco', 'Endereço'],
                ['telefone', 'Telefone'],
                ['email', 'E-mail'],
                ['pessoaContato', 'Pessoa de contato']
              ] as [CampoCliente, string][]
            ).map(([campo, label]) => (
              <Checkbox
                key={campo}
                label={label}
                checked={(form.camposClientePadrao ?? ['documento']).includes(campo)}
                onChange={(e) => {
                  const campos = form.camposClientePadrao ?? ['documento']
                  set({
                    camposClientePadrao: e ? [...campos, campo] : campos.filter((c) => c !== campo)
                  })
                }}
              />
            ))}
          </div>
        </div>
        {erro && (
          <Mensagem className="mt-4">
            Não foi possível concluir a alteração dos dados da empresa. {erro}
          </Mensagem>
        )}

        <BotaoSalvar salvando={operacao === 'salvar'} ok={ok} disabled={ocupado} />
      </Card>
    </form>
  )
}

// ------------------------------------------------------------ Parâmetros
function SecaoParametros(): JSX.Element {
  const { data, error: erroCarga } = useAsync(() => api.parametros.get(), [])
  const [form, setForm] = useState<ParametrosFinanceiros | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (data) setForm(data)
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
      setOk(true)
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form id="config-parametros" onSubmit={salvar} className="space-y-5">
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
          <Field label="Acréscimo padrão sobre o custo (%)">
            <NumberField
              value={form.margemLucroPadrao}
              onChange={(v) => set({ margemLucroPadrao: v })}
              min={0}
              max={100}
            />
          </Field>
          <Field label="Alíquota NFS padrão (%)">
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
          <Field label="Modo do imposto padrão" hint="Gross-up preserva o valor líquido calculado">
            <Select
              value={form.modoImpostoPadrao}
              onChange={(e) =>
                set({
                  modoImpostoPadrao: e.target.value as ParametrosFinanceiros['modoImpostoPadrao']
                })
              }
            >
              <option value="gross_up">Gross-up (dividir por 1 − alíquota)</option>
              <option value="simples">Simples (somar alíquota)</option>
            </Select>
          </Field>
        </div>
        {erro && <Mensagem className="mt-4">{erro}</Mensagem>}
        <BotaoSalvar salvando={salvando} ok={ok} />
      </Card>
    </form>
  )
}

function SecaoIA(): JSX.Element {
  const { data, error: erroCarga } = useAsync(() => api.ia.get(), [])
  const [form, setForm] = useState<ConfigIA | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [status, setStatus] = useState<StatusIA | null>(null)
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (!form)
    return (
      <p className={erroCarga ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {erroCarga ? `Não foi possível carregar a configuração de IA. ${erroCarga}` : 'Carregando…'}
      </p>
    )

  const set = (patch: Partial<ConfigIA>): void => {
    setForm({ ...form, ...patch })
    setOk(false)
    setStatus(null)
  }

  const ocupado = salvando || testando

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (ocupado) return
    const erros = form.modo === 'ollama' ? validarUrlOllamaLocal(form.urlOllama) : []
    if (erros.length) {
      setStatus({ modo: form.modo, disponivel: false, detalhe: mensagemValidacao(erros) })
      return
    }
    setSalvando(true)
    try {
      await api.ia.save(form)
      setOk(true)
    } catch (e) {
      setStatus({
        modo: form.modo,
        disponivel: false,
        detalhe: detalheErro(e)
      })
    } finally {
      setSalvando(false)
    }
  }

  const testar = async (): Promise<void> => {
    if (ocupado) return
    const erros = form.modo === 'ollama' ? validarUrlOllamaLocal(form.urlOllama) : []
    if (erros.length) {
      setStatus({ modo: form.modo, disponivel: false, detalhe: mensagemValidacao(erros) })
      return
    }
    setTestando(true)
    try {
      await api.ia.save(form)
      setStatus(await api.ia.status())
    } catch (e) {
      setStatus({ modo: form.modo, disponivel: false, detalhe: detalheErro(e) })
    } finally {
      setTestando(false)
    }
  }

  return (
    <form id="config-ia" onSubmit={salvar} className="space-y-5">
      <Card className="p-6">
        <SectionTitle
          title="Revisão de textos com IA local"
          description="Revise os textos dos documentos ou gere uma anotação interna. Você confere a sugestão antes de aplicar. Nada é enviado para a internet."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Origem do modelo">
            <Select
              value={form.modo}
              onChange={(e) => set({ modo: e.target.value as ConfigIA['modo'] })}
              disabled={ocupado}
            >
              <option value="embutida">Modelo embutido no aplicativo</option>
              <option value="ollama">Ollama instalado na máquina</option>
              <option value="desligada">Desativada</option>
            </Select>
          </Field>
          {form.modo === 'ollama' && (
            <>
              <Field
                label="Endereço do Ollama"
                hint="Somente HTTP local: localhost, 127.0.0.1 ou ::1"
              >
                <Input
                  value={form.urlOllama}
                  onChange={(e) => set({ urlOllama: e.target.value })}
                  disabled={ocupado}
                />
              </Field>
              <Field label="Modelo" hint="Ex.: llama3.2:3b, qwen2.5:3b">
                <Input
                  value={form.modeloOllama}
                  onChange={(e) => set({ modeloOllama: e.target.value })}
                  disabled={ocupado}
                />
              </Field>
            </>
          )}
        </div>

        {status && (
          <Mensagem tom={status.disponivel ? 'sucesso' : 'aviso'} className="mt-4">
            {status.detalhe}
          </Mensagem>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={testar} disabled={ocupado}>
            {testando ? 'Testando…' : 'Testar conexão'}
          </Button>
          <BotaoSalvar salvando={salvando} ok={ok} disabled={ocupado} />
        </div>
      </Card>
    </form>
  )
}

// ------------------------------------------------------------------ Numeração
function SecaoNumeracao(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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
      <PainelNumeracao
        titulo="Numeração dos recibos"
        documento="recibo"
        carregar={() => api.recibos.numeracao()}
        definirNumero={(numero) => api.recibos.definirProximoNumero(numero)}
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
  const { data, error: erroCarga, reload } = useAsync(carregar, [])
  const [proximo, setProximo] = useState<number | null>(null)
  const { operacao, ocupado, erro, executar, limparErro } = useMutacao<'salvar'>()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) setProximo(data.proximoBloco ?? data.proximoNumero)
  }, [data])

  if (!data || proximo === null)
    return (
      <p className={erroCarga ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
        {erroCarga ? `Não foi possível carregar a numeração. ${erroCarga}` : 'Carregando…'}
      </p>
    )

  const definir = (v: number): void => {
    setProximo(v)
    setOk(false)
    limparErro()
  }

  const salvar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const salvo = await executar('salvar', async () => {
      const resultado = await definirNumero(proximo)
      if (!resultado.ok)
        throw new Error(resultado.erro ?? 'Não foi possível definir o próximo número.')
      reload()
    })
    if (salvo) {
      setOk(true)
    }
  }

  return (
    <form onSubmit={salvar}>
      <Card className="p-6">
        <SectionTitle
          title={titulo}
          description={
            data.usaReservas
              ? data.proximoBloco !== undefined
                ? 'Ajusta o início das próximas faixas da empresa. Números já distribuídos continuam válidos; Ordem e ID interno são automáticos.'
                : 'Números vêm de faixas exclusivas. Conecte com o protocolo atualizado para ajustar faixas futuras.'
              : `Define o número que o próximo ${documento} vai receber. Números já utilizados não são reutilizados.`
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label={
              data.proximoBloco !== undefined
                ? 'Início da próxima faixa da empresa'
                : 'Próximo número'
            }
            hint={
              data.usaReservas
                ? data.proximoNumero > 0
                  ? `Próximo número deste computador: ${data.proximoNumero}. ${data.minimoProximo ? `Novo início deve ser pelo menos ${data.minimoProximo}.` : ''}`
                  : 'Sincronize para reservar novos números. Você ainda pode salvar rascunhos.'
                : `Números já usados são recusados para não haver dois ${documento}s com o mesmo número.`
            }
          >
            <NumberField
              value={proximo}
              onChange={definir}
              min={data.minimoProximo ?? 1}
              max={999999}
              step={1}
              disabled={ocupado || (data.usaReservas && data.proximoBloco === undefined)}
            />
          </Field>
          <div className="space-y-2 self-start md:pt-7">
            <p className="text-sm text-slate-500">
              Maior número em uso:{' '}
              <strong className="text-slate-700">{data.maiorEmUso || '—'}</strong> · Menor número{' '}
              {data.usaReservas ? 'reservado' : 'livre'}:{' '}
              <strong className="text-slate-700">{data.menorLivre || '—'}</strong> ·{' '}
              {data.totalDocumentos} {documento}
              {data.totalDocumentos === 1 ? '' : 's'}
            </p>
            {!data.usaReservas && proximo !== data.menorLivre && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => definir(data.menorLivre)}
                disabled={ocupado}
              >
                Usar o menor número livre ({data.menorLivre})
              </Button>
            )}
          </div>
        </div>

        {erro && (
          <Mensagem className="mt-4">Não foi possível definir o próximo número. {erro}</Mensagem>
        )}

        {(!data.usaReservas || data.proximoBloco !== undefined) && (
          <div className="mt-5 flex justify-end">
            <BotaoSalvar salvando={operacao === 'salvar'} ok={ok} disabled={ocupado} />
          </div>
        )}
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
          description="Gera uma cópia de segurança completa com clientes, documentos, imagens, logo e configurações."
        />
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Guarde esse arquivo em um local seguro. Ele permite recuperar o aplicativo em outro
            computador sem perder os anexos.
          </p>
          <Button icon={Download} type="button" onClick={exportar} disabled={ocupado !== null}>
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
              icon={ArchiveRestore}
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
              icon={Import}
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
      {erro && <Mensagem>{erro}</Mensagem>}
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
