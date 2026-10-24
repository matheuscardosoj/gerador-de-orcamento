import { mensagemErro } from '@shared/erros'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { useBloqueioEdicao } from '../../lib/nav'
import { Button, Card, Field, Input, Select, SectionTitle, Mensagem } from '../../ui/primitives'
import type { ConfigIA, StatusIA } from '@shared/types'
import { mensagemValidacao, validarUrlOllamaLocal } from '@shared/validacao'
import { BotaoSalvar } from './comum'
import type { ReactElement } from 'react'

export function SecaoIA(): ReactElement {
  const { data, error: erroCarga } = useAsync(() => api.ia.get(), [])
  const [form, setForm] = useState<ConfigIA | null>(null)
  const [salvo, setSalvo] = useState('')
  useBloqueioEdicao(!!form && JSON.stringify(form) !== salvo)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [status, setStatus] = useState<StatusIA | null>(null)
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    if (data) {
      setForm(data)
      setSalvo(JSON.stringify(data))
    }
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
      setSalvo(JSON.stringify(form))
      setOk(true)
    } catch (e) {
      setStatus({
        modo: form.modo,
        disponivel: false,
        detalhe: mensagemErro(e)
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
      setSalvo(JSON.stringify(form))
      setStatus(await api.ia.status())
    } catch (e) {
      setStatus({ modo: form.modo, disponivel: false, detalhe: mensagemErro(e) })
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
