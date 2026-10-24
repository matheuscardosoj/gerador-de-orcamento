import { MensagemFlutuante } from '../../components/MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { useEffect, useRef, useState } from 'react'
import { Trash2, Pencil, Save, FilterX } from 'lucide-react'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import {
  Button,
  Field,
  Input,
  NumberField,
  Textarea,
  Modal,
  EmptyState,
  ConfirmDialog,
  Mensagem
} from '../../ui/primitives'
import { IconButton } from '../../ui/primitives'
import { formatMoeda } from '@shared/format'
import { correspondeBusca } from '@shared/historico-preferencias'
import {
  DataTableFrame,
  ITENS_POR_PAGINA,
  Pagination,
  TableActions,
  SortableHeader
} from '../../ui/dataTable'
import type { ServicoCatalogo } from '@shared/types'
import type { RascunhoCadastro } from '@shared/evolucao'
import { useNav } from '../../lib/nav'
import type { ReactElement } from 'react'

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

export function SecaoServicos({
  edit,
  setEdit
}: {
  edit: ServicoCatalogo | 'novo' | null
  setEdit: (edit: ServicoCatalogo | 'novo' | null) => void
}): ReactElement {
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
    <div className="pilha-y-4">
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
}): ReactElement {
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
      <div className="pilha-y-4">
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
