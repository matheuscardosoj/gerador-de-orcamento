import { ListaOrdenavel } from '../ui/ordenavel'
import { validarCliente } from '@shared/clientes'
import { useState } from 'react'
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
  Modal,
  EmptyState,
  Badge,
  ConfirmDialog,
  Checkbox,
  Mensagem
} from '../ui/primitives'
import { IconButton } from '../ui/primitives'
import { formatMoeda } from '@shared/format'
import type { Cliente, ServicoCatalogo } from '@shared/types'

type Aba = 'clientes' | 'servicos'

export function CadastrosPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('clientes')
  return (
    <PageShell titulo="Cadastros" descricao="Clientes e catálogo de serviços">
      <Tabs
        atual={aba}
        onChange={setAba}
        tabs={[
          { id: 'clientes', label: 'Clientes' },
          { id: 'servicos', label: 'Catálogo de serviços' }
        ]}
      />
      {aba === 'clientes' ? <SecaoClientes /> : <SecaoServicos />}
    </PageShell>
  )
}

// --------------------------------------------------------------- Clientes
const clienteVazio = (): Omit<Cliente, 'id' | 'criadoEm'> => ({
  tipoPessoa: 'pf',
  nome: '',
  tratamento: 'A',
  contato: '',
  observacao: '',
  ativo: true
})

function SecaoClientes(): JSX.Element {
  const { data, error: erroCarga, reload } = useAsync(() => api.clientes.list(), [])
  const [edit, setEdit] = useState<Cliente | 'novo' | null>(null)
  const [excluir, setExcluir] = useState<Cliente | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const confirmar = async (): Promise<void> => {
    if (!excluir) return
    try {
      await api.clientes.remove(excluir.id)
      setExcluir(null)
      reload()
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit('novo')}>+ Novo cliente</Button>
      </div>
      {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
      {erroCarga && (
        <Mensagem className="mb-4">Não foi possível carregar os clientes. {erroCarga}</Mensagem>
      )}
      <div className="divide-y divide-slate-100">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium text-slate-800">
                {c.nome}
                {!c.ativo && <Badge>Inativo</Badge>}
              </p>
              {c.contato && <p className="text-sm text-slate-500">{c.contato}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>
                Editar
              </Button>
              <IconButton
                icon={Trash2}
                label={`Excluir cliente ${c.nome}`}
                size="sm"
                onClick={() => {
                  setErro(null)
                  setExcluir(c)
                }}
              />
            </div>
          </div>
        ))}
        {data && data.length === 0 && (
          <EmptyState
            title="Nenhum cliente cadastrado"
            description="Cadastre clientes para reutilizá-los nos orçamentos."
            action={<Button onClick={() => setEdit('novo')}>+ Novo cliente</Button>}
          />
        )}
      </div>
      {edit && (
        <ClienteModal
          cliente={edit === 'novo' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        title="Excluir cliente"
        description={`Excluir o cliente “${excluir?.nome ?? ''}”? Documentos já gravados continuarão preservados.`}
        onCancel={() => setExcluir(null)}
        onConfirm={confirmar}
      />
    </Card>
  )
}

function ClienteModal({
  cliente,
  onClose,
  onSaved
}: {
  cliente: Cliente | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<Omit<Cliente, 'id' | 'criadoEm'>>(cliente ?? clienteVazio())
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const salvar = async (): Promise<void> => {
    if (salvando) return
    setSalvando(true)
    setErro('')
    try {
      validarCliente({ ...form, id: cliente?.id ?? '', criadoEm: cliente?.criadoEm ?? '' })
      if (cliente) await api.clientes.update(cliente.id, form)
      else await api.clientes.create(form)
      onSaved()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={cliente ? 'Editar cliente' : 'Novo cliente'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Mensagem>{erro}</Mensagem>}
        <Field label="Nome / razão social (obrigatório)">
          <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
        </Field>
        <Field label="Tipo de cliente">
          <Select
            value={form.tipoPessoa ?? 'pf'}
            onChange={(e) => set({ tipoPessoa: e.target.value as 'pf' | 'pj' })}
          >
            <option value="pf">Pessoa física</option>
            <option value="pj">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field
          label={
            form.tipoPessoa === 'pf'
              ? 'CPF (opcional)'
              : form.tipoPessoa === 'pj'
                ? 'CNPJ (opcional)'
                : 'CPF / CNPJ (opcional)'
          }
          hint="Somente o nome é obrigatório. CNPJ também aceita letras."
        >
          <Input
            value={form.documento ?? ''}
            onChange={(e) => set({ documento: e.target.value.toUpperCase() })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone">
            <Input
              type="tel"
              value={form.telefone ?? ''}
              onChange={(e) => set({ telefone: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label="Nome fantasia (opcional)">
            <Input
              value={form.nomeFantasia ?? ''}
              onChange={(e) => set({ nomeFantasia: e.target.value })}
            />
          </Field>
          <Field label="Pessoa de contato">
            <Input
              value={form.pessoaContato ?? ''}
              onChange={(e) => set({ pessoaContato: e.target.value })}
            />
          </Field>
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-4 text-sm font-semibold text-slate-700">Endereço</legend>
          {(['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep'] as const).map(
            (f) => (
              <Field
                key={f}
                label={
                  {
                    logradouro: 'Logradouro',
                    numero: 'Número',
                    complemento: 'Complemento',
                    bairro: 'Bairro',
                    cidade: 'Cidade',
                    uf: 'UF',
                    cep: 'CEP'
                  }[f]
                }
              >
                <Input
                  value={form.endereco?.[f] ?? ''}
                  onChange={(e) =>
                    set({
                      endereco: {
                        logradouro: '',
                        numero: '',
                        complemento: '',
                        bairro: '',
                        cidade: '',
                        uf: '',
                        cep: '',
                        ...form.endereco,
                        [f]: f === 'uf' ? e.target.value.toUpperCase() : e.target.value
                      }
                    })
                  }
                />
              </Field>
            )
          )}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(170px,0.85fr)_minmax(0,1.65fr)] sm:gap-3">
          <Field
            label="Tratamento"
            hint="Usado no PDF/Word; não aparece em listas nem no nome do arquivo"
          >
            <Input
              value={form.tratamento}
              onChange={(e) => set({ tratamento: e.target.value })}
              placeholder="A / Ao Sr. / À Sra."
            />
          </Field>
        </div>
        <Field label="Contato" hint="Telefone, e-mail ou responsável">
          <Input value={form.contato ?? ''} onChange={(e) => set({ contato: e.target.value })} />
        </Field>
        <Checkbox
          checked={form.ativo}
          onChange={(ativo) => set({ ativo })}
          label="Cliente ativo para novos documentos"
        />
        <Field label="Observação">
          <Textarea
            value={form.observacao ?? ''}
            onChange={(e) => set({ observacao: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  )
}

// --------------------------------------------------------------- Serviços
const servicoVazio = (): Omit<ServicoCatalogo, 'id'> => ({
  nome: '',
  descricaoPadrao: '',
  unidade: 'metro linear',
  precoReferencia: null
})

function SecaoServicos(): JSX.Element {
  const { data, error: erroCarga, reload } = useAsync(() => api.servicos.list(), [])
  const [edit, setEdit] = useState<ServicoCatalogo | 'novo' | null>(null)
  const [excluir, setExcluir] = useState<ServicoCatalogo | null>(null)
  const [reordenando, setReordenando] = useState(false)
  const [erroOrdem, setErroOrdem] = useState('')
  const reordenar = async (ids: string[]): Promise<void> => {
    setReordenando(true)
    setErroOrdem('')
    try {
      await api.reordenarCadastro('servicos', ids)
      reload()
    } catch (e) {
      setErroOrdem(String(e))
    } finally {
      setReordenando(false)
    }
  }

  return (
    <Card className="p-6">
      {erroOrdem && <Mensagem className="mb-4">{erroOrdem}</Mensagem>}
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit('novo')}>+ Novo serviço</Button>
      </div>
      {erroCarga && (
        <Mensagem className="mb-4">Não foi possível carregar os serviços. {erroCarga}</Mensagem>
      )}
      <div className="divide-y divide-slate-100">
        <ListaOrdenavel
          itens={data ?? []}
          disabled={reordenando}
          onChange={(itens) => void reordenar(itens.map((i) => i.id))}
        >
          {(data ?? []).map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {s.nome} <Badge>{s.unidade}</Badge>
                </p>
                <p className="truncate text-sm text-slate-500">{s.descricaoPadrao}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {s.precoReferencia != null
                    ? `${formatMoeda(s.precoReferencia)}/${s.unidade}`
                    : '—'}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>
                  Editar
                </Button>
                <IconButton
                  icon={Trash2}
                  label={`Excluir serviço ${s.nome}`}
                  size="sm"
                  onClick={() => setExcluir(s)}
                />
              </div>
            </div>
          ))}
        </ListaOrdenavel>
        {data && data.length === 0 && <EmptyState title="Nenhum serviço no catálogo" />}
      </div>
      {edit && (
        <ServicoModal
          servico={edit === 'novo' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        title="Excluir serviço"
        description={`Excluir o serviço “${excluir?.nome ?? ''}” do catálogo? Itens já gravados não serão alterados.`}
        onCancel={() => setExcluir(null)}
        onConfirm={async () => {
          if (excluir) {
            await api.servicos.remove(excluir.id)
            setExcluir(null)
            reload()
          }
        }}
      />
    </Card>
  )
}

function ServicoModal({
  servico,
  onClose,
  onSaved
}: {
  servico: ServicoCatalogo | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<Omit<ServicoCatalogo, 'id'>>(servico ?? servicoVazio())
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const salvar = async (): Promise<void> => {
    if (!form.nome.trim()) return
    if (servico) await api.servicos.update(servico.id, form)
    else await api.servicos.create(form)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={servico ? 'Editar serviço' : 'Novo serviço'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome do serviço">
          <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade de medida">
            <Input
              value={form.unidade}
              onChange={(e) => set({ unidade: e.target.value })}
              placeholder="metro linear, m², unidade…"
            />
          </Field>
          <Field label="Preço de referência (R$)" hint="Por unidade — opcional">
            <NumberField
              value={form.precoReferencia ?? 0}
              onChange={(v) => set({ precoReferencia: v || null })}
            />
          </Field>
        </div>
        <Field label="Descrição padrão" hint="Texto usado ao inserir no orçamento">
          <Textarea
            value={form.descricaoPadrao}
            onChange={(e) => set({ descricaoPadrao: e.target.value })}
            className="min-h-[100px]"
          />
        </Field>
      </div>
    </Modal>
  )
}
