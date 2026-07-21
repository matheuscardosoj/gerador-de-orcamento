import { useState } from 'react'
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
  Modal,
  EmptyState,
  Badge
} from '../ui/primitives'
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
  nome: '',
  tratamento: 'A',
  contato: '',
  observacao: ''
})

function SecaoClientes(): JSX.Element {
  const { data, reload } = useAsync(() => api.clientes.list(), [])
  const [edit, setEdit] = useState<Cliente | 'novo' | null>(null)

  return (
    <Card className="p-6">
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit('novo')}>+ Novo cliente</Button>
      </div>
      <div className="divide-y divide-slate-100">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-slate-800">
                <span className="text-slate-400">{c.tratamento} </span>
                {c.nome}
              </p>
              {c.contato && <p className="text-sm text-slate-500">{c.contato}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (confirm(`Excluir o cliente "${c.nome}"?`)) {
                    await api.clientes.remove(c.id)
                    reload()
                  }
                }}
              >
                🗑
              </Button>
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
  const [form, setForm] = useState<Omit<Cliente, 'id' | 'criadoEm'>>(
    cliente ?? clienteVazio()
  )
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const salvar = async (): Promise<void> => {
    if (!form.nome.trim()) return
    if (cliente) await api.clientes.update(cliente.id, form)
    else await api.clientes.create(form)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={cliente ? 'Editar cliente' : 'Novo cliente'}
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tratamento" className="col-span-1">
            <Input
              value={form.tratamento}
              onChange={(e) => set({ tratamento: e.target.value })}
              placeholder="A / Ao Sr. / À Sra."
            />
          </Field>
          <Field label="Nome / destinatário" className="col-span-2">
            <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
          </Field>
        </div>
        <Field label="Contato" hint="Telefone, e-mail ou responsável">
          <Input value={form.contato ?? ''} onChange={(e) => set({ contato: e.target.value })} />
        </Field>
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
  const { data, reload } = useAsync(() => api.servicos.list(), [])
  const [edit, setEdit] = useState<ServicoCatalogo | 'novo' | null>(null)

  return (
    <Card className="p-6">
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit('novo')}>+ Novo serviço</Button>
      </div>
      <div className="divide-y divide-slate-100">
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
                {s.precoReferencia != null ? `${formatMoeda(s.precoReferencia)}/${s.unidade}` : '—'}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (confirm(`Excluir o serviço "${s.nome}"?`)) {
                    await api.servicos.remove(s.id)
                    reload()
                  }
                }}
              >
                🗑
              </Button>
            </div>
          </div>
        ))}
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
