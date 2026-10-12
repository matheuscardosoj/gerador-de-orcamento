import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Columns3,
  CopyPlus,
  ReceiptText,
  FilePenLine,
  FileSearch,
  ClipboardPlus,
  Trash2,
  FilterX
} from 'lucide-react'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
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
  Select
} from '../ui/primitives'
import { DataTableFrame, Pagination, SortableHeader, TableActions } from '../ui/dataTable'
import { ListaOrdenavel } from '../ui/ordenavel'
import {
  colunasHistorico,
  correspondeBusca,
  normalizarPreferencias,
  preferenciasPadrao,
  type PreferenciasHistorico
} from '@shared/historico-preferencias'
import { formatDataCurta, formatMoeda, formatNumero } from '@shared/format'
import type { Recibo, ResumoOrcamento, ResumoRelatorio, TipoDocumento } from '@shared/types'

export interface RegistroHistorico {
  id: string
  numero: number
  data: string
  destinatario: string
  valor: number
  status: string
  criadoEm: string
  atualizadoEm: string
  versao?: number
  servicos?: string
  anotacao?: string
  origem?: string
  origemTipo?: string
  servicosValor?: number
  saldo?: number
  descricao?: string
  formaPagamento?: string
  quitacao?: string
}
export const registroOrcamento = (o: ResumoOrcamento): RegistroHistorico => ({
  ...o,
  valor: o.valorTotal,
  servicos: o.servicosBusca.join('; '),
  anotacao: o.observacaoInterna
})
export const registroRelatorio = (r: ResumoRelatorio): RegistroHistorico => ({
  ...r,
  valor: r.totais.valorFinal,
  saldo: r.totais.saldo,
  servicosValor: r.totais.servicos,
  servicos: (r.servicosBusca ?? []).join('; '),
  anotacao: r.observacaoInterna,
  origem: r.origemOrcamento
    ? `Proposta Nº ${r.origemOrcamento.numero} · ${r.origemOrcamento.cliente}`
    : ''
})
export const registroRecibo = (r: Recibo, origem: string): RegistroHistorico => ({
  ...r,
  origem,
  origemTipo: r.origemTipo,
  quitacao: r.quitacao === 'total' ? 'Total' : 'Parcial'
})
const labels: Record<string, string> = {
  numero: 'Nº',
  data: 'Data',
  destinatario: 'Cliente',
  valor: 'Valor',
  status: 'Estado',
  servicosValor: 'Serviços (valor)',
  servicos: 'Resumo dos serviços',
  anotacao: 'Anotação interna',
  origem: 'Origem',
  descricao: 'Serviço',
  formaPagamento: 'Forma de pagamento',
  quitacao: 'Quitação',
  criadoEm: 'Criado em',
  atualizadoEm: 'Última alteração',
  versao: 'Versão'
}
const estados: Record<
  string,
  { label: string; cor: 'slate' | 'blue' | 'green' | 'red' | 'amber' }
> = {
  rascunho: { label: 'Rascunho', cor: 'slate' },
  enviado: { label: 'Enviado', cor: 'blue' },
  aprovado: { label: 'Aprovado', cor: 'green' },
  recusado: { label: 'Recusado', cor: 'red' },
  emitido: { label: 'Emitido', cor: 'blue' },
  pago: { label: 'Pago', cor: 'green' },
  recebido: { label: 'Recebido', cor: 'green' },
  cancelado: { label: 'Cancelado', cor: 'red' },
  pendente: { label: 'Pagamento pendente', cor: 'amber' }
}
function valorCampo(r: RegistroHistorico, k: string): string | number {
  return (r as unknown as Record<string, string | number>)[k] ?? ''
}
function textoCampo(r: RegistroHistorico, k: string): string {
  const v = valorCampo(r, k)
  if (['valor', 'servicosValor'].includes(k))
    return (
      formatMoeda(Number(v)) +
      (k === 'valor' && r.saldo !== undefined
        ? r.saldo < 0
          ? ' a devolver'
          : r.saldo > 0
            ? ' a receber'
            : ' quitado'
        : '')
    )
  if (['data', 'criadoEm', 'atualizadoEm'].includes(k)) return formatDataCurta(String(v))
  if (k === 'status') return estados[r.status]?.label ?? r.status
  return String(v)
}
export function HistoricoDocumentos({
  tipo,
  registros,
  loading = false,
  erroCarga,
  onAbrir,
  onAtualizar
}: {
  tipo: TipoDocumento
  registros: RegistroHistorico[]
  loading?: boolean
  erroCarga?: string | null
  onAbrir?: (id: string) => void
  onAtualizar?: () => void
}): JSX.Element {
  const { navegar } = useNav()
  const [pref, setPref] = useState(() => preferenciasPadrao(tipo))
  const [carregadas, setCarregadas] = useState(false)
  const [erro, setErro] = useState('')
  const [colunas, setColunas] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [excluir, setExcluir] = useState<RegistroHistorico | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const fila = useRef(Promise.resolve())
  useEffect(() => {
    let vivo = true
    void api.preferencias
      .historico(tipo)
      .then((p) => {
        if (vivo) {
          setPref(normalizarPreferencias(tipo, p))
          setCarregadas(true)
        }
      })
      .catch((e) => {
        if (vivo) {
          setErro(String(e))
          setCarregadas(true)
        }
      })
    return () => {
      vivo = false
    }
  }, [tipo])
  const mudar = (patch: Partial<PreferenciasHistorico>): void => {
    const proxima = normalizarPreferencias(tipo, { ...pref, ...patch })
    setPref(proxima)
    setPagina(1)
    // Fila ordenada evita que gravações rápidas revertam a escolha mais recente.
    fila.current = fila.current
      .catch(() => undefined)
      .then(() => api.preferencias.salvarHistorico(tipo, proxima))
      .catch((e) => setErro(`Não foi possível gravar a apresentação. ${e}`))
  }
  const limpar = (): void =>
    mudar({ busca: '', estado: '', de: '', ate: '', minimo: '', maximo: '', saldo: '', origem: '' })
  const filtrados = useMemo(
    () =>
      registros
        .filter(
          (r) =>
            (!pref.estado || r.status === pref.estado) &&
            (!pref.de || r.data >= pref.de) &&
            (!pref.ate || r.data <= pref.ate) &&
            (!pref.minimo || r.valor >= Number(pref.minimo)) &&
            (!pref.maximo || r.valor <= Number(pref.maximo)) &&
            (!pref.saldo ||
              (pref.saldo === 'receber'
                ? Number(r.saldo) > 0
                : pref.saldo === 'devolver'
                  ? Number(r.saldo) < 0
                  : r.saldo === 0)) &&
            (!pref.origem ||
              (pref.origem === 'avulso' ? !r.origemTipo : r.origemTipo === pref.origem)) &&
            correspondeBusca(pref.busca, [
              r.numero,
              String(r.numero).padStart(6, '0'),
              r.destinatario,
              r.servicos ?? '',
              r.anotacao ?? '',
              r.descricao ?? '',
              r.origem ?? '',
              r.formaPagamento ?? '',
              textoCampo(r, 'status'),
              r.data,
              formatDataCurta(r.data),
              r.valor,
              formatMoeda(r.valor),
              formatNumero(r.valor),
              r.valor.toFixed(2).replace('.', ','),
              ...(r.servicosValor === undefined
                ? []
                : [r.servicosValor, formatMoeda(r.servicosValor)])
            ])
        )
        .sort((a, b) => {
          const av = valorCampo(a, pref.campo),
            bv = valorCampo(b, pref.campo)
          const c =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv), 'pt-BR')
          return (pref.direcao === 'asc' ? c : -c) || b.numero - a.numero
        }),
    [registros, pref]
  )
  const total = Math.max(1, Math.ceil(filtrados.length / 12)),
    atual = Math.min(pagina, total),
    inicio = (atual - 1) * 12
  const larguraColuna = (campo: string): number =>
    ['destinatario', 'servicos', 'descricao', 'anotacao', 'origem'].includes(campo)
      ? 240
      : campo === 'versao'
        ? 90
        : 145
  const larguraAcoes = tipo === 'orcamento' ? 220 : tipo === 'relatorio' ? 145 : 70
  const larguraTabela = 96 + larguraAcoes + pref.colunas.reduce((n, k) => n + larguraColuna(k), 0)
  const ordenar = (campo: string): void =>
    mudar({
      campo,
      direcao:
        pref.campo === campo
          ? pref.direcao === 'asc'
            ? 'desc'
            : 'asc'
          : [
                'numero',
                'data',
                'valor',
                'servicosValor',
                'criadoEm',
                'atualizadoEm',
                'versao'
              ].includes(campo)
            ? 'desc'
            : 'asc'
    })
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(String(e))
    } finally {
      setOcupado(false)
    }
  }
  const ativos = [
    pref.busca && `Busca: ${pref.busca}`,
    pref.estado && textoCampo({ status: pref.estado } as RegistroHistorico, 'status'),
    pref.de && `De ${formatDataCurta(pref.de)}`,
    pref.ate && `Até ${formatDataCurta(pref.ate)}`,
    pref.minimo && `A partir de ${formatMoeda(Number(pref.minimo))}`,
    pref.maximo && `Até ${formatMoeda(Number(pref.maximo))}`,
    pref.saldo && `Saldo: ${pref.saldo}`,
    pref.origem && `Origem: ${pref.origem}`
  ].filter(Boolean)
  const opcoesEstado =
    tipo === 'orcamento'
      ? ['rascunho', 'enviado', 'aprovado', 'recusado']
      : tipo === 'relatorio'
        ? ['rascunho', 'emitido', 'pago']
        : ['rascunho', 'pendente', 'recebido', 'cancelado']
  return (
    <div className="space-y-4">
      {(erro || erroCarga) && <Mensagem>{erro || erroCarga}</Mensagem>}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          disabled={!carregadas}
          className="max-w-md"
          aria-label={`Buscar ${tipo === 'orcamento' ? 'orçamentos' : tipo === 'relatorio' ? 'relatórios' : 'recibos'}`}
          placeholder="Buscar por número, cliente, serviço, data ou valor…"
          value={pref.busca}
          onChange={(e) => mudar({ busca: e.target.value })}
        />
        <Select
          disabled={!carregadas}
          className="w-full sm:w-48"
          aria-label="Filtrar estado"
          value={pref.estado}
          onChange={(e) => mudar({ estado: e.target.value })}
        >
          <option value="">Todos os estados</option>
          {opcoesEstado.map((e) => (
            <option key={e} value={e}>
              {estados[e].label}
            </option>
          ))}
        </Select>
        <Button
          icon={Columns3}
          variant="outline"
          disabled={!carregadas}
          onClick={() => setColunas(true)}
        >
          Colunas
        </Button>
        <Button icon={FilterX} variant="ghost" disabled={!carregadas} onClick={limpar}>
          Limpar filtros
        </Button>
      </div>
      <div className="grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Data inicial">
          <Input
            disabled={!carregadas}
            type="date"
            value={pref.de}
            onChange={(e) => mudar({ de: e.target.value })}
          />
        </Field>
        <Field label="Data final">
          <Input
            disabled={!carregadas}
            type="date"
            value={pref.ate}
            onChange={(e) => mudar({ ate: e.target.value })}
          />
        </Field>
        <Field label="Valor mínimo">
          <Input
            disabled={!carregadas}
            type="number"
            min="0"
            step="0.01"
            value={pref.minimo}
            onChange={(e) => mudar({ minimo: e.target.value })}
          />
        </Field>
        <Field label="Valor máximo">
          <Input
            disabled={!carregadas}
            type="number"
            min="0"
            step="0.01"
            value={pref.maximo}
            onChange={(e) => mudar({ maximo: e.target.value })}
          />
        </Field>
        {tipo === 'relatorio' && (
          <Field label="Situação do saldo">
            <Select value={pref.saldo} onChange={(e) => mudar({ saldo: e.target.value })}>
              <option value="">Todos</option>
              <option value="receber">A receber</option>
              <option value="quitado">Quitado</option>
              <option value="devolver">A devolver</option>
            </Select>
          </Field>
        )}
        {tipo === 'recibo' && (
          <Field label="Tipo de origem">
            <Select value={pref.origem} onChange={(e) => mudar({ origem: e.target.value })}>
              <option value="">Todos</option>
              <option value="orcamento">Orçamento</option>
              <option value="relatorio">Relatório</option>
              <option value="avulso">Avulso</option>
            </Select>
          </Field>
        )}
      </div>
      {!!ativos.length && (
        <div className="flex flex-wrap gap-2">
          {ativos.map((a, n) => (
            <Badge key={n}>{a}</Badge>
          ))}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !filtrados.length ? (
        <EmptyState
          title={registros.length ? 'Nenhum documento encontrado' : 'Nenhum documento cadastrado'}
          description={
            registros.length
              ? 'Tente outros termos ou limpe os filtros.'
              : 'Crie um documento para começar.'
          }
        />
      ) : (
        <>
          <DataTableFrame minWidth={`${larguraTabela}px`}>
            <colgroup>
              <col className="w-24" />
              {pref.colunas.map((k) => (
                <col key={k} style={{ width: larguraColuna(k) }} />
              ))}
              <col style={{ width: larguraAcoes }} />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['numero', ...pref.colunas].map((k) => (
                  <SortableHeader
                    key={k}
                    label={
                      k === 'valor'
                        ? tipo === 'orcamento'
                          ? 'Total'
                          : tipo === 'relatorio'
                            ? 'Saldo'
                            : 'Valor'
                        : labels[k]
                    }
                    active={pref.campo === k}
                    direction={pref.direcao}
                    wrap
                    className={k === 'numero' ? 'sticky left-0 z-[2] bg-slate-50' : undefined}
                    onSort={() => ordenar(k)}
                    align={['valor', 'servicosValor'].includes(k) ? 'right' : 'left'}
                  />
                ))}
                <th className="sticky right-0 z-[2] bg-slate-50 px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0]">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.slice(inicio, inicio + 12).map((r) => (
                <tr key={r.id} className="group/linha-historico h-[62px] hover:bg-slate-50">
                  <td className="sticky left-0 z-[1] whitespace-nowrap bg-white px-4 py-3 font-medium text-slate-800 shadow-[1px_0_0_0_#e2e8f0] group-hover/linha-historico:bg-slate-50">
                    {r.numero > 0 ? String(r.numero).padStart(6, '0') : 'Rascunho'}
                  </td>
                  {pref.colunas.map((k) => (
                    <td
                      key={k}
                      className={`px-4 py-3 text-slate-600 ${['valor', 'servicosValor'].includes(k) ? 'text-right font-medium' : ''}`}
                    >
                      {k === 'status' ? (
                        <Badge color={estados[r.status]?.cor ?? 'slate'}>{textoCampo(r, k)}</Badge>
                      ) : (
                        <span className="line-clamp-2 break-words" title={textoCampo(r, k)}>
                          {textoCampo(r, k) || '—'}
                        </span>
                      )}
                      {k === 'destinatario' && r.anotacao && !pref.colunas.includes('anotacao') && (
                        <span
                          className="mt-0.5 block truncate text-xs text-slate-400"
                          title={r.anotacao}
                        >
                          {r.anotacao}
                        </span>
                      )}
                      {k === 'destinatario' &&
                        tipo === 'recibo' &&
                        r.descricao &&
                        !pref.colunas.includes('descricao') && (
                          <span
                            className="mt-0.5 block truncate text-xs text-slate-500"
                            title={r.descricao}
                          >
                            {r.descricao}
                          </span>
                        )}
                    </td>
                  ))}
                  <td className="sticky right-0 z-[1] bg-white px-4 py-3 shadow-[-1px_0_0_0_#e2e8f0] group-hover/linha-historico:bg-slate-50">
                    <TableActions>
                      <IconButton
                        icon={
                          tipo === 'recibo' && ['recebido', 'cancelado'].includes(r.status)
                            ? FileSearch
                            : FilePenLine
                        }
                        label={`Abrir ${tipo === 'orcamento' ? 'orçamento' : tipo === 'relatorio' ? 'relatório' : 'recibo'} Nº ${r.numero}`}
                        disabled={ocupado}
                        onClick={() =>
                          onAbrir
                            ? onAbrir(r.id)
                            : navegar(
                                tipo === 'orcamento'
                                  ? { nome: 'editor', orcamentoId: r.id }
                                  : { nome: 'editorRelatorio', relatorioId: r.id }
                              )
                        }
                      />
                      {tipo !== 'recibo' && (
                        <IconButton
                          icon={ReceiptText}
                          label={`Gerar recibo / cobrança do ${tipo === 'orcamento' ? 'orçamento' : 'relatório'} Nº ${r.numero}`}
                          disabled={ocupado}
                          onClick={() => navegar({ nome: 'recibos', origem: { tipo, id: r.id } })}
                        />
                      )}
                      {tipo === 'orcamento' && (
                        <>
                          <IconButton
                            icon={ClipboardPlus}
                            label={`Gerar relatório do orçamento Nº ${r.numero}`}
                            disabled={ocupado}
                            onClick={() =>
                              void executar(async () => {
                                const d = await api.relatorios.criarDeOrcamento(r.id)
                                if (d) navegar({ nome: 'editorRelatorio', relatorioId: d.id })
                              })
                            }
                          />
                          <IconButton
                            icon={CopyPlus}
                            label={`Duplicar orçamento Nº ${r.numero}`}
                            disabled={ocupado}
                            onClick={() =>
                              void executar(async () => {
                                const d = await api.orcamentos.duplicate(r.id)
                                if (d) navegar({ nome: 'editor', orcamentoId: d.id })
                              })
                            }
                          />
                        </>
                      )}
                      {tipo !== 'recibo' && (
                        <IconButton
                          icon={Trash2}
                          label={`Excluir ${tipo === 'orcamento' ? 'orçamento' : 'relatório'} Nº ${r.numero}`}
                          disabled={ocupado}
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => setExcluir(r)}
                        />
                      )}
                    </TableActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTableFrame>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Mostrando {inicio + 1}–{Math.min(inicio + 12, filtrados.length)} de {filtrados.length}
            </span>
            {total > 1 && <Pagination pagina={atual} total={total} onIr={setPagina} />}
          </div>
        </>
      )}
      <Modal
        open={colunas}
        onClose={() => setColunas(false)}
        title="Colunas do histórico"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => mudar(preferenciasPadrao(tipo))}>
              Restaurar apresentação padrão
            </Button>
            <Button onClick={() => setColunas(false)}>Concluir</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          Escolha as informações e arraste as colunas visíveis para mudar a ordem. Número e ações
          permanecem fixos.
        </p>
        <div className="space-y-2">
          <ListaOrdenavel
            itens={pref.colunas.map((id) => ({ id }))}
            onChange={(itens) => mudar({ colunas: itens.map((i) => i.id) })}
          >
            {pref.colunas.map((id) => (
              <div key={id} className="rounded-lg border border-slate-200 p-3">
                <Checkbox
                  label={labels[id]}
                  checked
                  onChange={() => mudar({ colunas: pref.colunas.filter((c) => c !== id) })}
                />
              </div>
            ))}
          </ListaOrdenavel>
          {colunasHistorico[tipo]
            .filter((c) => !pref.colunas.includes(c))
            .map((id) => (
              <div key={id} className="rounded-lg border border-slate-200 p-3">
                <Checkbox
                  label={labels[id]}
                  checked={false}
                  onChange={() => mudar({ colunas: [...pref.colunas, id] })}
                />
              </div>
            ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!excluir}
        title={`Excluir ${tipo === 'orcamento' ? 'orçamento' : 'relatório'}`}
        description={`O documento Nº ${excluir?.numero ?? ''} será excluído. Seu número e as versões salvas serão preservados.`}
        busy={ocupado}
        onCancel={() => setExcluir(null)}
        onConfirm={() =>
          void executar(async () => {
            if (!excluir) return
            await (tipo === 'orcamento' ? api.orcamentos : api.relatorios).remove(excluir.id)
            setExcluir(null)
            onAtualizar?.()
          })
        }
      />
    </div>
  )
}
