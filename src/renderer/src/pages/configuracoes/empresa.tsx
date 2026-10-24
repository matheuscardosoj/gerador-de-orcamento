import { MensagemFlutuante } from '../../components/MensagemFlutuante'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { useBloqueioEdicao } from '../../lib/nav'
import { Button, Card, Field, Input, Select, SectionTitle, Checkbox } from '../../ui/primitives'
import type { EmpresaConfig, CampoCliente } from '@shared/types'
import { BotaoSalvar, useMutacao } from './comum'
import type { ReactElement } from 'react'

// --------------------------------------------------------------- Empresa
export function SecaoEmpresa(): ReactElement {
  const { data, error: erroCarga } = useAsync(() => api.empresa.get(), [])
  const [form, setForm] = useState<EmpresaConfig | null>(null)
  const [salvo, setSalvo] = useState('')
  useBloqueioEdicao(!!form && JSON.stringify(form) !== salvo)
  const { operacao, ocupado, erro, executar, limparErro } = useMutacao<'salvar' | 'logo'>()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (data) {
      setForm(data)
      setSalvo(JSON.stringify(data))
    }
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
      setSalvo(JSON.stringify(form))
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
          description="Cabeçalho das propostas, relatórios e recibos"
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

        <div className="mt-6 border-t border-slate-200 pt-6">
          <SectionTitle
            title="Logo e assinatura"
            description="Logo do cabeçalho e faixa do rodapé"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="pilha-y-2">
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
                  className="h-9 w-14 cursor-pointer rounded-sm border border-slate-300"
                />
                <Input
                  value={form.corFaixaRodape}
                  onChange={(e) => set({ corFaixaRodape: e.target.value })}
                  className="w-32"
                />
              </div>
            </Field>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6">
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
          <MensagemFlutuante className="mt-4">
            Não foi possível concluir a alteração dos dados da empresa. {erro}
          </MensagemFlutuante>
        )}

        <BotaoSalvar salvando={operacao === 'salvar'} ok={ok} disabled={ocupado} />
      </Card>
    </form>
  )
}
