import { useState } from 'react'
import { Pencil, Trash2, Save, FilterX } from 'lucide-react'
import { correspondeBusca } from '@shared/historico-preferencias'
import type { ObservacaoPadrao, FormaPagamentoPadrao } from '@shared/types'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { DataTableFrame, TableActions } from '../ui/dataTable'
import { ListaOrdenavel } from '../ui/ordenavel'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Mensagem,
  Modal,
  Select,
  Textarea
} from '../ui/primitives'
import { RevisaoIA } from '../components/RevisaoIA'
type TextoPadrao = ObservacaoPadrao | FormaPagamentoPadrao
export function PadroesConfig({
  tipo,
  novo,
  setNovo
}: {
  tipo: 'observacoes' | 'pagamentos'
  novo: boolean
  setNovo: (novo: boolean) => void
}): JSX.Element {
  const { data, loading, error, reload } = useAsync(
    () => api[tipo].list(),
    [tipo],
    [tipo === 'observacoes' ? 'observacoes_padrao' : 'pagamentos_padrao']
  )
  const [busca, setBusca] = useState(''),
    [aplicacao, setAplicacao] = useState('')
  const [edit, setEdit] = useState<TextoPadrao | null>(null),
    [excluir, setExcluir] = useState<TextoPadrao | null>(null)
  const [texto, setTexto] = useState(''),
    [auto, setAuto] = useState(true),
    [onde, setOnde] = useState<TextoPadrao['aplicacao']>('ambos')
  const [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const nome = tipo === 'observacoes' ? 'observação' : 'forma de pagamento'
  const executar = async (tarefa: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await tarefa()
      reload()
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setOcupado(false)
    }
  }
  const abrir = (item: TextoPadrao): void => {
    setEdit(item)
    setTexto(item.texto)
    setAuto(item.padrao)
    setOnde(item.aplicacao)
  }
  const lista = (data ?? []).filter(
    (d) => (!aplicacao || d.aplicacao === aplicacao) && correspondeBusca(busca, [d.texto])
  )
  const fechar = (): void => {
    setNovo(false)
    setEdit(null)
    setTexto('')
    setAuto(true)
    setOnde('ambos')
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Defina os textos sugeridos nos documentos. Arraste pela alça para escolher a ordem; os
        documentos já salvos preservam seus textos.
      </p>
      {(erro || error) && !novo && !edit && <Mensagem>{erro || error}</Mensagem>}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md"
          aria-label={`Buscar ${tipo === 'observacoes' ? 'observações' : 'formas de pagamento'}`}
          placeholder="Buscar por texto…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select
          className="w-full sm:w-52"
          aria-label="Filtrar aplicação"
          value={aplicacao}
          onChange={(e) => setAplicacao(e.target.value)}
        >
          <option value="">Todas as aplicações</option>
          <option value="ambos">Orçamento e relatório</option>
          <option value="orcamento">Somente orçamento</option>
          <option value="relatorio">Somente relatório</option>
        </Select>
        <Button
          variant="ghost"
          icon={FilterX}
          onClick={() => {
            setBusca('')
            setAplicacao('')
          }}
        >
          Limpar filtros
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !lista.length ? (
        <EmptyState title="Nenhum texto encontrado" />
      ) : (
        <DataTableFrame minWidth="820px">
          <colgroup>
            <col />
            <col className="w-52" />
            <col className="w-44" />
            <col className="w-28" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Texto</th>
              <th className="px-4 py-3">Aplicação</th>
              <th className="px-4 py-3">Inclusão automática</th>
              <th className="sticky right-0 z-[2] bg-slate-50 px-4 py-3 text-right shadow-[-1px_0_0_0_#e2e8f0]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <ListaOrdenavel
              itens={lista}
              disabled={ocupado || !!busca || !!aplicacao}
              onChange={(itens) =>
                void executar(async () => {
                  await api.reordenarCadastro(
                    tipo,
                    itens.map((i) => i.id)
                  )
                })
              }
            >
              {lista.map((item) => (
                <tr key={item.id} className="group/linha-historico h-[62px] hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p
                      className="line-clamp-2 whitespace-pre-wrap break-words text-slate-700"
                      title={item.texto}
                    >
                      {item.texto}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>
                      {item.aplicacao === 'ambos'
                        ? 'Orçamento e relatório'
                        : item.aplicacao === 'orcamento'
                          ? 'Orçamento'
                          : 'Relatório'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={item.padrao}
                      disabled={ocupado}
                      label="Incluir"
                      onChange={(padrao) =>
                        void executar(async () => {
                          await api[tipo].update(item.id, { padrao })
                        })
                      }
                    />
                  </td>
                  <td className="sticky right-0 z-[1] bg-white px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover/linha-historico:bg-slate-50">
                    <TableActions>
                      <IconButton
                        icon={Pencil}
                        label={`Editar ${nome}`}
                        disabled={ocupado}
                        onClick={() => abrir(item)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Excluir ${nome}`}
                        disabled={ocupado}
                        onClick={() => setExcluir(item)}
                      />
                    </TableActions>
                  </td>
                </tr>
              ))}
            </ListaOrdenavel>
          </tbody>
        </DataTableFrame>
      )}
      {(busca || aplicacao) && (
        <p className="text-xs text-slate-500">
          Limpe os filtros para reorganizar a lista completa.
        </p>
      )}
      <Modal
        open={novo || !!edit}
        onClose={() => !ocupado && fechar()}
        title={`${edit ? 'Editar' : 'Nova'} ${nome}`}
        footer={
          <>
            <Button variant="outline" disabled={ocupado} onClick={fechar}>
              Cancelar
            </Button>
            <Button
              icon={Save}
              disabled={ocupado || !texto.trim()}
              onClick={() =>
                void executar(async () => {
                  const dto = { texto: texto.trim(), padrao: auto, aplicacao: onde }
                  if (edit) await api[tipo].update(edit.id, dto)
                  else await api[tipo].create(dto)
                  fechar()
                })
              }
            >
              {ocupado ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {erro && <Mensagem>{erro}</Mensagem>}
          <Field label="Texto">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-40"
              disabled={ocupado}
            />
            <RevisaoIA
              texto={texto}
              campo={tipo === 'observacoes' ? 'observacao' : 'pagamento'}
              onAplicar={setTexto}
              disabled={ocupado}
            />
          </Field>
          <Field label="Aplicação">
            <Select
              value={onde}
              onChange={(e) => setOnde(e.target.value as TextoPadrao['aplicacao'])}
              disabled={ocupado}
            >
              <option value="ambos">Orçamento e relatório</option>
              <option value="orcamento">Somente orçamento</option>
              <option value="relatorio">Somente relatório</option>
            </Select>
          </Field>
          <Checkbox
            checked={auto}
            onChange={setAuto}
            disabled={ocupado}
            label="Incluir automaticamente em novos documentos"
          />
        </div>
      </Modal>
      <ConfirmDialog
        open={!!excluir}
        title={`Excluir ${nome}`}
        description="O texto sairá das sugestões. Documentos já salvos mantêm seu conteúdo."
        onCancel={() => setExcluir(null)}
        onConfirm={() =>
          void executar(async () => {
            await api[tipo].remove(excluir!.id)
            setExcluir(null)
          })
        }
      />
    </div>
  )
}
