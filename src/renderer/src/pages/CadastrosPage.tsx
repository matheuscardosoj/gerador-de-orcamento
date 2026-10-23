import { MensagemFlutuante } from '../components/MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { validarCliente } from '@shared/clientes'
import { useEffect, useRef, useState } from 'react'
import { Trash2, Plus, Pencil, Save, FilterX } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { PageShell, Tabs } from '../ui/layout'
import {
  Button,
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
import { correspondeBusca } from '@shared/historico-preferencias'
import {
  DataTableFrame,
  ITENS_POR_PAGINA,
  Pagination,
  TableActions,
  SortableHeader
} from '../ui/dataTable'
import type { Cliente, ServicoCatalogo } from '@shared/types'
import type { RascunhoCadastro } from '@shared/evolucao'
import { useNav } from '../lib/nav'

type Aba = 'clientes' | 'servicos'

export function CadastrosPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('clientes')
  const [editCliente, setEditCliente] = useState<Cliente | 'novo' | null>(null)
  const [editServico, setEditServico] = useState<ServicoCatalogo | 'novo' | null>(null)
  return (
    <PageShell
      largura="full"
      titulo="Cadastros"
      descricao="Clientes e catálogo de serviços"
      acoes={
        <Button
          icon={Plus}
          onClick={() => (aba === 'clientes' ? setEditCliente('novo') : setEditServico('novo'))}
        >
          {aba === 'clientes' ? 'Novo cliente' : 'Novo serviço'}
        </Button>
      }
    >
      <Tabs
        atual={aba}
        onChange={setAba}
        tabs={[
          { id: 'clientes', label: 'Clientes' },
          { id: 'servicos', label: 'Catálogo de serviços' }
        ]}
      />
      {aba === 'clientes' ? (
        <SecaoClientes edit={editCliente} setEdit={setEditCliente} />
      ) : (
        <SecaoServicos edit={editServico} setEdit={setEditServico} />
      )}
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
function novoClienteDe(form: Omit<Cliente, 'id' | 'criadoEm'>): Omit<Cliente, 'id' | 'criadoEm'> {
  const dados = { ...form } as Partial<Cliente>
  delete dados.id
  delete dados.criadoEm
  delete dados.codigo
  return dados as Omit<Cliente, 'id' | 'criadoEm'>
}

function SecaoClientes({
  edit,
  setEdit
}: {
  edit: Cliente | 'novo' | null
  setEdit: (edit: Cliente | 'novo' | null) => void
}): JSX.Element {
  const {
    data,
    loading,
    error: erroCarga,
    reload
  } = useAsync(() => api.clientes.list(), [], ['clientes'])
  const { data: rascunhos, reload: recarregarRascunhos } = useAsync(() =>
    api.rascunhosCadastros.listar('cliente')
  )
  const { avisar } = useNav()
  const [restaurar, setRestaurar] = useState<RascunhoCadastro | null>(null)
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [ordenarPorCodigo, setOrdenarPorCodigo] = useState(false)
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)
  const [excluir, setExcluir] = useState<Cliente | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  useEffect(() => setPagina(1), [busca, estado, tipo, ordenarPorCodigo, direcao])
  const confirmar = async (): Promise<void> => {
    if (!excluir || excluindo) return
    setExcluindo(true)
    setErro(null)
    try {
      await api.clientes.remove(excluir.id)
      avisar(`Cliente “${excluir.nome}” excluído.`, 'sucesso')
      setExcluir(null)
      reload()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setExcluindo(false)
    }
  }

  const filtrados = (data ?? [])
    .filter(
      (c) =>
        (!estado || (estado === 'ativo') === c.ativo) &&
        (!tipo || (c.tipoPessoa ?? 'pf') === tipo) &&
        correspondeBusca(busca, [
          c.nome,
          String(c.codigo ?? ''),
          c.nomeFantasia ?? '',
          c.documento ?? '',
          c.telefone ?? '',
          c.email ?? '',
          c.contato ?? '',
          c.pessoaContato ?? '',
          c.observacao ?? ''
        ])
    )
    .sort(
      (a, b) =>
        (ordenarPorCodigo
          ? (a.codigo ?? 0) - (b.codigo ?? 0)
          : a.nome.localeCompare(b.nome, 'pt-BR')) * (direcao === 'asc' ? 1 : -1)
    )
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
  const paginaFiltrada = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA)
  return (
    <div className="space-y-4">
      {rascunhos?.map((r) => (
        <Mensagem key={r.idOrigem} tom="aviso">
          Alterações de um cliente excluído em outro computador foram guardadas neste computador.{' '}
          <button
            className="font-semibold underline"
            onClick={() => {
              setRestaurar(r)
              setEdit('novo')
            }}
          >
            Abrir como novo cliente
          </button>
        </Mensagem>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md"
          aria-label="Buscar clientes"
          placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select
          className="w-full sm:w-48"
          aria-label="Filtrar tipo de cliente"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          <option value="pf">Pessoa física</option>
          <option value="pj">Pessoa jurídica</option>
        </Select>
        <Select
          className="w-full sm:w-48"
          aria-label="Filtrar estado do cliente"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Todos os estados</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </Select>
        <Button
          icon={FilterX}
          variant="ghost"
          onClick={() => {
            setBusca('')
            setEstado('')
            setTipo('')
          }}
        >
          Limpar filtros
        </Button>
      </div>
      {erroCarga && (
        <MensagemFlutuante className="mb-4">
          Não foi possível carregar os clientes. {erroCarga}
        </MensagemFlutuante>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !filtrados.length ? (
        <EmptyState
          title={data?.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={
            data?.length
              ? 'Tente outros termos ou limpe os filtros.'
              : 'Cadastre clientes para reutilizá-los nos documentos.'
          }
        />
      ) : (
        <DataTableFrame minWidth="1100px">
          <colgroup>
            <col className="w-24" />
            <col style={{ width: '30%' }} />
            <col className="w-40" />
            <col className="w-48" />
            <col style={{ width: '30%' }} />
            <col className="w-28" />
            <col className="w-28" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortableHeader
                label="Código"
                active={ordenarPorCodigo}
                direction={direcao}
                onSort={() => {
                  if (ordenarPorCodigo) setDirecao(direcao === 'asc' ? 'desc' : 'asc')
                  else {
                    setOrdenarPorCodigo(true)
                    setDirecao('asc')
                  }
                }}
              />
              <SortableHeader
                label="Nome / razão social"
                active={!ordenarPorCodigo}
                direction={direcao}
                onSort={() => {
                  if (!ordenarPorCodigo) setDirecao(direcao === 'asc' ? 'desc' : 'asc')
                  else {
                    setOrdenarPorCodigo(false)
                    setDirecao('asc')
                  }
                }}
              />
              <th scope="col" className="px-4 py-3 text-left">
                Tipo
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                CPF / CNPJ
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Contato
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Estado
              </th>
              <th
                scope="col"
                className="sticky right-0 z-[2] bg-slate-50 px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0]"
              >
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginaFiltrada.map((c) => (
              <tr key={c.id} className="group/linha-historico h-[62px] hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                  {c.codigo ? String(c.codigo).padStart(6, '0') : '—'}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span className="line-clamp-2 break-words" title={c.nome}>
                    {c.nome}
                  </span>
                  {c.nomeFantasia && (
                    <span className="mt-0.5 block truncate text-xs text-slate-400">
                      {c.nomeFantasia}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.tipoPessoa === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="break-words">{c.documento || '—'}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span
                    className="line-clamp-2 break-words"
                    title={[c.telefone, c.email, c.contato].filter(Boolean).join(' · ')}
                  >
                    {[c.telefone, c.email, c.contato].filter(Boolean).join(' · ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge color={c.ativo ? 'green' : 'slate'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="sticky right-0 z-[1] bg-surface px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover/linha-historico:bg-slate-50">
                  <TableActions>
                    <IconButton
                      icon={Pencil}
                      label={`Editar cliente ${c.nome}`}
                      onClick={() => setEdit(c)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Excluir cliente ${c.nome}`}
                      onClick={() => {
                        setErro(null)
                        setExcluir(c)
                      }}
                    />
                  </TableActions>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableFrame>
      )}
      {!loading && !!filtrados.length && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Mostrando {inicio + 1}–{Math.min(inicio + ITENS_POR_PAGINA, filtrados.length)} de{' '}
            {filtrados.length} clientes
          </span>
          {totalPaginas > 1 && (
            <Pagination pagina={paginaAtual} total={totalPaginas} onIr={setPagina} />
          )}
        </div>
      )}
      {edit && (
        <ClienteModal
          key={edit === 'novo' ? (restaurar?.idOrigem ?? 'novo') : edit.id}
          cliente={edit === 'novo' ? null : edit}
          restaurar={edit === 'novo' ? restaurar : null}
          onClose={() => {
            setEdit(null)
            setRestaurar(null)
          }}
          onDeleted={() => {
            setEdit(null)
            setRestaurar(null)
            recarregarRascunhos()
            reload()
          }}
          onSaved={() => {
            setEdit(null)
            setRestaurar(null)
            recarregarRascunhos()
            reload()
          }}
        />
      )}
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      <ConfirmDialog
        open={Boolean(excluir)}
        title="Excluir cliente"
        description={`Excluir o cliente “${excluir?.nome ?? ''}”? Documentos já gravados continuarão preservados.`}
        onCancel={() => {
          setExcluir(null)
          setErro(null)
        }}
        onConfirm={confirmar}
        busy={excluindo}
      />
    </div>
  )
}

function ClienteModal({
  cliente,
  restaurar,
  onClose,
  onDeleted,
  onSaved
}: {
  cliente: Cliente | null
  restaurar: RascunhoCadastro | null
  onClose: () => void
  onDeleted: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<Omit<Cliente, 'id' | 'criadoEm'>>(
    (restaurar?.dados as Omit<Cliente, 'id' | 'criadoEm'> | undefined) ?? cliente ?? clienteVazio()
  )
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { avisar } = useNav()
  const formAtual = useRef(form)
  formAtual.current = form
  const exclusaoTratada = useRef(false)
  useEffect(() => {
    if (!cliente) return
    return api.eventos.observarDados((evento) => {
      if (evento.origem !== 'nuvem' || !evento.entidades.includes(`clientes:${cliente.id}`)) return
      void api.clientes.list().then((atual) => {
        if (atual.some((c) => c.id === cliente.id) || exclusaoTratada.current) return
        exclusaoTratada.current = true
        void (async () => {
          const alterado = JSON.stringify(formAtual.current) !== JSON.stringify(cliente)
          try {
            if (alterado)
              await api.rascunhosCadastros.guardar(
                'cliente',
                cliente.id,
                novoClienteDe(formAtual.current)
              )
            avisar(
              `O cliente “${cliente.nome}” foi excluído em outro computador. A tela foi fechada.${alterado ? ' Suas alterações foram guardadas para criar um novo cliente.' : ''}`
            )
            onDeleted()
          } catch {
            exclusaoTratada.current = false
            setErro('Não foi possível guardar as alterações locais. Elas continuam nesta tela.')
          }
        })()
      })
    })
  }, [cliente, avisar, onDeleted])
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const salvar = async (): Promise<void> => {
    if (salvando) return
    setSalvando(true)
    setErro('')
    try {
      validarCliente({ ...form, id: cliente?.id ?? '', criadoEm: cliente?.criadoEm ?? '' })
      if (cliente) {
        const atualizado = await api.clientes.update(cliente.id, form)
        if (!atualizado)
          throw new Error(
            'Este cliente foi excluído em outro computador. Escolha criar como novo cadastro.'
          )
      } else {
        await api.clientes.create(novoClienteDe(form))
        if (restaurar)
          await api.rascunhosCadastros.descartar('cliente', restaurar.idOrigem).catch(() => {
            avisar(
              'Cliente criado. O rascunho antigo não pôde ser removido; confira a lista de rascunhos.'
            )
          })
      }
      avisar(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'sucesso')
      onSaved()
    } catch (e) {
      setErro(mensagemErro(e))
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
          <Button icon={Save} onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
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
function novoServicoDe(form: Omit<ServicoCatalogo, 'id'>): Omit<ServicoCatalogo, 'id'> {
  const dados = { ...form } as Partial<ServicoCatalogo>
  delete dados.id
  delete dados.codigo
  return dados as Omit<ServicoCatalogo, 'id'>
}

function SecaoServicos({
  edit,
  setEdit
}: {
  edit: ServicoCatalogo | 'novo' | null
  setEdit: (edit: ServicoCatalogo | 'novo' | null) => void
}): JSX.Element {
  const {
    data,
    loading,
    error: erroCarga,
    reload
  } = useAsync(() => api.servicos.list(), [], ['servicos'])
  const { data: rascunhos, reload: recarregarRascunhos } = useAsync(() =>
    api.rascunhosCadastros.listar('servico')
  )
  const { avisar } = useNav()
  const [restaurar, setRestaurar] = useState<RascunhoCadastro | null>(null)
  const [busca, setBusca] = useState('')
  const [ordenarPorCodigo, setOrdenarPorCodigo] = useState(false)
  const [direcaoCodigo, setDirecaoCodigo] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)
  const [excluir, setExcluir] = useState<ServicoCatalogo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  useEffect(() => setPagina(1), [busca, ordenarPorCodigo, direcaoCodigo])
  const confirmar = async (): Promise<void> => {
    if (!excluir || excluindo) return
    setExcluindo(true)
    setErro(null)
    try {
      await api.servicos.remove(excluir.id)
      avisar(`Serviço “${excluir.nome}” excluído.`, 'sucesso')
      setExcluir(null)
      reload()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setExcluindo(false)
    }
  }
  const filtrados = (data ?? [])
    .filter((s) =>
      correspondeBusca(busca, [String(s.codigo ?? ''), s.nome, s.descricaoPadrao, s.unidade])
    )
    .sort((a, b) =>
      ordenarPorCodigo
        ? ((a.codigo ?? 0) - (b.codigo ?? 0)) * (direcaoCodigo === 'asc' ? 1 : -1)
        : a.nome.localeCompare(b.nome, 'pt-BR')
    )
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
  const paginaFiltrada = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA)
  return (
    <div className="space-y-4">
      {rascunhos?.map((r) => (
        <Mensagem key={r.idOrigem} tom="aviso">
          Alterações de um serviço excluído em outro computador foram guardadas neste computador.{' '}
          <button
            className="font-semibold underline"
            onClick={() => {
              setRestaurar(r)
              setEdit('novo')
            }}
          >
            Abrir como novo serviço
          </button>
        </Mensagem>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md"
          aria-label="Buscar serviços"
          placeholder="Buscar por nome, descrição ou unidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Button icon={FilterX} variant="ghost" onClick={() => setBusca('')}>
          Limpar filtros
        </Button>
      </div>
      {erroCarga && (
        <MensagemFlutuante className="mb-4">
          Não foi possível carregar os serviços. {erroCarga}
        </MensagemFlutuante>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !filtrados.length ? (
        <EmptyState
          title={data?.length ? 'Nenhum serviço encontrado' : 'Nenhum serviço no catálogo'}
          description={
            data?.length
              ? 'Tente outros termos ou limpe os filtros.'
              : 'Cadastre serviços para reutilizar descrições e preços.'
          }
        />
      ) : (
        <DataTableFrame minWidth="1080px">
          <colgroup>
            <col className="w-24" />
            <col style={{ width: '30%' }} />
            <col style={{ width: '40%' }} />
            <col className="w-40" />
            <col className="w-44" />
            <col className="w-28" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <SortableHeader
                label="Código"
                active={ordenarPorCodigo}
                direction={direcaoCodigo}
                onSort={() => {
                  if (ordenarPorCodigo) setDirecaoCodigo(direcaoCodigo === 'asc' ? 'desc' : 'asc')
                  else {
                    setOrdenarPorCodigo(true)
                    setDirecaoCodigo('asc')
                  }
                }}
              />
              <th scope="col" className="px-4 py-3 text-left">
                Serviço
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Descrição padrão
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Unidade
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Preço de referência
              </th>
              <th
                scope="col"
                className="sticky right-0 z-[2] bg-slate-50 px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0]"
              >
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginaFiltrada.map((s) => (
              <tr key={s.id} className="group/linha-historico h-[62px] hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                  {s.codigo ? String(s.codigo).padStart(6, '0') : '—'}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span className="line-clamp-2 break-words" title={s.nome}>
                    {s.nome}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="line-clamp-2 break-words" title={s.descricaoPadrao}>
                    {s.descricaoPadrao || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="line-clamp-2 break-words">{s.unidade}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-600">
                  {s.precoReferencia != null ? formatMoeda(s.precoReferencia) : '—'}
                </td>
                <td className="sticky right-0 z-[1] bg-surface px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover/linha-historico:bg-slate-50">
                  <TableActions>
                    <IconButton
                      icon={Pencil}
                      label={`Editar serviço ${s.nome}`}
                      onClick={() => setEdit(s)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Excluir serviço ${s.nome}`}
                      onClick={() => {
                        setErro(null)
                        setExcluir(s)
                      }}
                    />
                  </TableActions>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableFrame>
      )}
      {!loading && !!filtrados.length && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Mostrando {inicio + 1}–{Math.min(inicio + ITENS_POR_PAGINA, filtrados.length)} de{' '}
            {filtrados.length} serviços
          </span>
          {totalPaginas > 1 && (
            <Pagination pagina={paginaAtual} total={totalPaginas} onIr={setPagina} />
          )}
        </div>
      )}
      {edit && (
        <ServicoModal
          key={edit === 'novo' ? (restaurar?.idOrigem ?? 'novo') : edit.id}
          servico={edit === 'novo' ? null : edit}
          restaurar={edit === 'novo' ? restaurar : null}
          onClose={() => {
            setEdit(null)
            setRestaurar(null)
          }}
          onDeleted={() => {
            setEdit(null)
            setRestaurar(null)
            recarregarRascunhos()
            reload()
          }}
          onSaved={() => {
            setEdit(null)
            setRestaurar(null)
            recarregarRascunhos()
            reload()
          }}
        />
      )}
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      <ConfirmDialog
        open={Boolean(excluir)}
        title="Excluir serviço"
        description={`Excluir o serviço “${excluir?.nome ?? ''}” do catálogo? Itens já gravados não serão alterados.`}
        onCancel={() => {
          setExcluir(null)
          setErro(null)
        }}
        onConfirm={confirmar}
        busy={excluindo}
      />
    </div>
  )
}

function ServicoModal({
  servico,
  restaurar,
  onClose,
  onDeleted,
  onSaved
}: {
  servico: ServicoCatalogo | null
  restaurar: RascunhoCadastro | null
  onClose: () => void
  onDeleted: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<Omit<ServicoCatalogo, 'id'>>(
    (restaurar?.dados as Omit<ServicoCatalogo, 'id'> | undefined) ?? servico ?? servicoVazio()
  )
  const { avisar } = useNav()
  const formAtual = useRef(form)
  formAtual.current = form
  const exclusaoTratada = useRef(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (!servico) return
    return api.eventos.observarDados((evento) => {
      if (evento.origem !== 'nuvem' || !evento.entidades.includes(`servicos:${servico.id}`)) return
      void api.servicos.list().then((atual) => {
        if (atual.some((s) => s.id === servico.id) || exclusaoTratada.current) return
        exclusaoTratada.current = true
        void (async () => {
          const alterado = JSON.stringify(formAtual.current) !== JSON.stringify(servico)
          try {
            if (alterado)
              await api.rascunhosCadastros.guardar(
                'servico',
                servico.id,
                novoServicoDe(formAtual.current)
              )
            avisar(
              `O serviço “${servico.nome}” foi excluído em outro computador. A tela foi fechada.${alterado ? ' Suas alterações foram guardadas para criar outro serviço.' : ''}`
            )
            onDeleted()
          } catch {
            exclusaoTratada.current = false
            setErro('Não foi possível guardar as alterações locais. Elas continuam nesta tela.')
          }
        })()
      })
    })
  }, [servico, avisar, onDeleted])
  const set = (patch: Partial<typeof form>): void => setForm({ ...form, ...patch })

  const salvar = async (): Promise<void> => {
    if (!form.nome.trim()) return
    try {
      if (servico) {
        const atualizado = await api.servicos.update(servico.id, form)
        if (!atualizado)
          throw new Error(
            'Este serviço foi excluído em outro computador. Escolha criar como novo cadastro.'
          )
      } else {
        await api.servicos.create(novoServicoDe(form))
        if (restaurar)
          await api.rascunhosCadastros.descartar('servico', restaurar.idOrigem).catch(() => {
            avisar(
              'Serviço criado. O rascunho antigo não pôde ser removido; confira a lista de rascunhos.'
            )
          })
      }
      avisar(servico ? 'Serviço atualizado.' : 'Serviço cadastrado.', 'sucesso')
      onSaved()
    } catch (e) {
      setErro(mensagemErro(e))
    }
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
          <Button icon={Save} onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
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
              format="money"
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
