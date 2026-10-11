import { DadosClienteDocumento, LinhaTempo } from '../components/DocumentoExtras'
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { PageShell } from '../ui/layout'
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  NumberField,
  Select,
  SectionTitle,
  Textarea
} from '../ui/primitives'
import { dataCivilHoje, formatMoeda, normalizarDataCivil } from '@shared/format'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { normalizarDestinatario } from '@shared/documento/comum'
import type { LancamentoRelatorio, Orcamento, Relatorio } from '@shared/types'
import { novoId } from '../components/tipos'
import { PreviaRelatorioModal } from '../components/PreviaRelatorioModal'
import { AnotacaoInterna, ServicosCard, TextosCard, type Dados } from './EditorOrcamentoPage'
import { AnexosCard } from '../components/AnexosCard'
import { useBloqueioEdicao, useNav } from '../lib/nav'
import { removerLancamentoRelatorio, removerServicoRelatorio } from '@shared/edicao'
import {
  mensagemValidacao,
  normalizarRelatorio,
  validarRelatorioFinal,
  type ErroValidacao
} from '@shared/validacao'

function mensagemDoCampo(erros: ErroValidacao[], campo: string): string | undefined {
  return erros.find((erro) => erro.campo === campo)?.mensagem
}

type Base = Pick<
  Dados,
  'empresa' | 'parametros' | 'clientes' | 'servicos' | 'observacoesPadrao' | 'pagamentosPadrao'
>
const agora = (): string => new Date().toISOString()

export function EditorRelatorioPage({ relatorioId }: { relatorioId?: string }): JSX.Element {
  const { navegar } = useNav()
  const [dados, setDados] = useState<Base | null>(null)
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [ocupado, setOcupado] = useState<'salvar' | 'pdf' | 'docx' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [errosValidacao, setErrosValidacao] = useState<ErroValidacao[]>([])
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [snapshotSalvo, setSnapshotSalvo] = useState<string | null>(null)
  const [previa, setPrevia] = useState(false)
  const [numeroOriginal, setNumeroOriginal] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const [empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao] =
          await Promise.all([
            api.empresa.get(),
            api.parametros.get(),
            api.clientes.list(),
            api.servicos.list(),
            api.observacoes.list(),
            api.pagamentos.list()
          ])
        if (!vivo) return
        setDados({ empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao })
        if (relatorioId) {
          const existente = await api.relatorios.get(relatorioId)
          if (!existente) throw new Error('Relatório não encontrado.')
          setRel(existente)
          setSnapshotSalvo(JSON.stringify(existente))
          setNumeroOriginal(existente.numero)
          return
        }
        const numero = await api.relatorios.proximoNumero()
        if (!vivo) return
        const novo: Relatorio = {
          id: '',
          numero,
          data: dataCivilHoje(),
          clienteId: null,
          camposCliente: empresa.camposClientePadrao ?? ['documento'],
          destinatario: '',
          formato: 'tabela',
          titulo: 'Relatório de Serviço',
          introducao: '',
          itensServico: [],
          adiantamentos: [],
          reembolsos: [],
          observacoes: observacoesPadrao
            .filter((x) => x.padrao && (x.aplicacao === 'ambos' || x.aplicacao === 'relatorio'))
            .map((x) => ({ id: novoId(), texto: x.texto, origemPadraoId: x.id })),
          pagamentos: pagamentosPadrao
            .filter((x) => x.padrao && (x.aplicacao === 'ambos' || x.aplicacao === 'relatorio'))
            .map((x) => ({ id: novoId(), texto: x.texto, origemPadraoId: x.id })),
          anexos: [],
          observacaoInterna: '',
          status: 'rascunho',
          origemOrcamento: null,
          totais: calcularTotaisRelatorio([], [], []),
          criadoEm: agora(),
          atualizadoEm: agora()
        }
        setNumeroOriginal(numero)
        setRel(novo)
        setSnapshotSalvo(JSON.stringify(novo))
      } catch (e) {
        if (vivo)
          setErro(`Não foi possível carregar o editor. ${String(e).replace(/^Error:\s*/, '')}`)
      }
    })()
    return () => {
      vivo = false
    }
  }, [relatorioId])
  const totais = useMemo(
    () =>
      rel ? calcularTotaisRelatorio(rel.itensServico, rel.adiantamentos, rel.reembolsos) : null,
    [rel]
  )
  const sujo = rel !== null && snapshotSalvo !== null && JSON.stringify(rel) !== snapshotSalvo
  useBloqueioEdicao(sujo)

  const limparErrosValidacao = (campos: string[]): void => {
    setErrosValidacao((atuais) =>
      atuais.filter(
        (erro) =>
          !campos.some((campo) => erro.campo === campo || erro.campo.startsWith(`${campo}.`))
      )
    )
  }

  const set = (patch: Partial<Relatorio>): void => {
    limparErrosValidacao(Object.keys(patch))
    setRel((atual) => {
      if (!atual) return atual
      const proximo = { ...atual, ...patch }
      return {
        ...proximo,
        totais: calcularTotaisRelatorio(
          proximo.itensServico,
          proximo.adiantamentos,
          proximo.reembolsos
        )
      }
    })
  }

  const erroDoCampo = (campo: string): string | undefined => mensagemDoCampo(errosValidacao, campo)

  const persistir = async (exigirFinal: boolean): Promise<Relatorio | null> => {
    if (!rel || !totais) return null
    setErro(null)
    try {
      const payload = normalizarRelatorio({ ...rel, totais })
      if (exigirFinal || payload.status !== 'rascunho') {
        const erros = validarRelatorioFinal(payload)
        if (erros.length) {
          setErrosValidacao(erros)
          return null
        }
        setErrosValidacao([])
      }
      const numeroMudou = numeroOriginal !== null && rel.numero !== numeroOriginal
      let gravado: Relatorio | null
      if (rel.id) {
        if (numeroMudou) {
          const r = await api.relatorios.alterarNumero(rel.id, rel.numero)
          if (!r.ok) {
            setErro(r.erro ?? 'Não foi possível alterar o número do relatório.')
            return null
          }
        }
        gravado = await api.relatorios.update(rel.id, payload)
      } else {
        const {
          id: _id,
          numero,
          criadoEm: _criadoEm,
          atualizadoEm: _atualizadoEm,
          ...novo
        } = payload
        gravado = await api.relatorios.create(numeroMudou ? { ...novo, numero } : novo)
      }
      if (!gravado) throw new Error('Relatório não encontrado.')
      setRel(gravado)
      setSnapshotSalvo(JSON.stringify(gravado))
      setNumeroOriginal(gravado.numero)
      setMensagem(
        `Alterações salvas às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
      )
      if (!rel.id && numeroMudou && gravado.numero !== rel.numero)
        setErro(
          `O número ${rel.numero} já estava em uso. O relatório foi salvo com o número ${gravado.numero}.`
        )
      return gravado
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
      return null
    }
  }
  const executar = async (
    operacao: NonNullable<typeof ocupado>,
    tarefa: () => Promise<void>
  ): Promise<void> => {
    if (ocupado) return
    setOcupado(operacao)
    setMensagem(null)
    try {
      await tarefa()
    } finally {
      setOcupado(null)
    }
  }
  const salvar = (): void => {
    void executar('salvar', async () => {
      await persistir(false)
    })
  }
  const exportar = (tipo: 'pdf' | 'docx'): void => {
    void executar(tipo, async () => {
      const gravado = await persistir(true)
      if (!gravado) return
      try {
        const resultado =
          tipo === 'pdf'
            ? await api.documentos.gerarRelatorioPdf(gravado.id)
            : await api.documentos.gerarRelatorioDocx(gravado.id)
        if (resultado.caminho) setMensagem(`Documento gerado com sucesso: ${resultado.caminho}`)
      } catch (e) {
        setErro(`Não foi possível gerar o documento. ${String(e).replace(/^Error:\s*/, '')}`)
      }
    })
  }
  const abrirPrevia = (): void => {
    if (!rel || !totais) return
    const erros = validarRelatorioFinal(normalizarRelatorio({ ...rel, totais }))
    if (erros.length) {
      setErrosValidacao(erros)
      return
    }
    setErro(null)
    setErrosValidacao([])
    setPrevia(true)
  }
  if (!dados || !rel || !totais)
    return (
      <PageShell titulo={erro ? 'Falha ao abrir o relatório' : 'Carregando…'}>
        <p className={erro ? 'text-sm text-red-700' : 'text-sm text-slate-500'}>
          {erro ?? 'Carregando dados…'}
        </p>
      </PageShell>
    )
  const orcAdaptado: Orcamento = {
    ...rel,
    materiais: [],
    prazoDias: null,
    valorTotal: totais.servicos,
    status: 'rascunho'
  }
  const acoes = (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={() => navegar({ nome: 'historicoRelatorios' })}>
        Voltar
      </Button>
      <Button variant="outline" onClick={abrirPrevia} disabled={ocupado !== null}>
        Prévia
      </Button>
      <Button variant="outline" onClick={() => exportar('pdf')} disabled={ocupado !== null}>
        PDF
      </Button>
      <Button variant="outline" onClick={() => exportar('docx')} disabled={ocupado !== null}>
        Word
      </Button>
      <Button disabled={ocupado !== null} onClick={salvar}>
        {ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  )
  return (
    <PageShell
      titulo={rel.id ? `Relatório Nº ${rel.numero}` : 'Novo relatório'}
      descricao="Serviços prestados, adiantamentos e reembolsos"
      acoes={acoes}
    >
      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      )}
      {errosValidacao.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Revise os campos destacados antes de concluir o relatório.</p>
          <p className="mt-1">{mensagemValidacao(errosValidacao)}</p>
        </div>
      )}
      {mensagem && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {mensagem}
        </p>
      )}
      {rel.origemOrcamento && (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Gerado da proposta Nº {rel.origemOrcamento.numero}. Alterações aqui não mudam a proposta.
        </p>
      )}
      <Card className="mb-6 p-6">
        <SectionTitle title="Dados do relatório" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Número">
            <NumberField
              value={rel.numero}
              min={1}
              step={1}
              onChange={(numero) => set({ numero })}
            />
          </Field>
          <Field label="Data" error={erroDoCampo('data')}>
            <Input
              type="date"
              value={normalizarDataCivil(rel.data)}
              onChange={(e) => set({ data: normalizarDataCivil(e.target.value) })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={rel.status}
              onChange={(e) => {
                const status = e.target.value as Relatorio['status']
                if (status !== 'rascunho') {
                  const erros = validarRelatorioFinal(
                    normalizarRelatorio({ ...rel, status, totais })
                  )
                  if (erros.length) {
                    setErrosValidacao(erros)
                    return
                  }
                }
                setErro(null)
                setErrosValidacao([])
                set({ status })
              }}
            >
              <option value="rascunho">Rascunho</option>
              <option value="emitido">Emitido</option>
              <option value="pago">Pago</option>
            </Select>
          </Field>
          <Field label="Formato do documento">
            <Select
              value={rel.formato}
              onChange={(e) => set({ formato: e.target.value as Relatorio['formato'] })}
            >
              <option value="carta">Carta (parágrafos)</option>
              <option value="tabela">Tabela (colunas)</option>
            </Select>
          </Field>
          <Field label="Cliente cadastrado">
            <Select
              value={rel.clienteId ?? ''}
              onChange={(e) => {
                const cliente = dados.clientes.find((x) => x.id === e.target.value)
                set({
                  clienteId: cliente?.id ?? null,
                  clienteSnapshot: cliente ?? null,
                  destinatario: cliente ? cliente.nome : rel.destinatario
                })
              }}
            >
              <option value="">— destinatário livre —</option>
              {dados.clientes
                .filter((cliente) => cliente.ativo || cliente.id === rel.clienteId)
                .map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label="Destinatário (sem vírgula)"
            className="md:col-span-2"
            error={erroDoCampo('destinatario')}
          >
            <Input
              value={rel.destinatario}
              onChange={(e) =>
                set({
                  destinatario: normalizarDestinatario(e.target.value),
                  clienteId: null,
                  clienteSnapshot: null
                })
              }
            />
          </Field>
          <Field label="Título" className="md:col-span-3" error={erroDoCampo('titulo')}>
            <Input value={rel.titulo} onChange={(e) => set({ titulo: e.target.value })} />
          </Field>
          <Field label="Introdução" className="md:col-span-3">
            <Textarea
              value={rel.introducao ?? ''}
              onChange={(e) => set({ introducao: e.target.value })}
            />
          </Field>
          <AnotacaoInterna
            documento={rel}
            set={(patch) => set({ observacaoInterna: patch.observacaoInterna })}
            tipoDocumento="relatorio"
          />
        </div>
      </Card>
      <div className="space-y-6">
        <ServicosCard
          orc={orcAdaptado}
          set={(p) => set({ itensServico: p.itensServico ?? rel.itensServico })}
          dados={dados}
          total={totais.servicos}
          titulo="Serviços prestados"
          rotuloTotal="Valor total dos serviços"
          errosValidacao={errosValidacao.filter(
            (erro) => erro.campo === 'itensServico' || erro.campo.startsWith('itensServico.')
          )}
          onRemover={(id) => set(removerServicoRelatorio(rel, id))}
        />
        <LancamentosCard
          titulo="Valores adiantados"
          descricao="São subtraídos do valor dos serviços."
          itens={rel.adiantamentos}
          campo="adiantamentos"
          erroDoCampo={erroDoCampo}
          onChange={(adiantamentos) => set({ adiantamentos })}
          onRemover={(id) => set(removerLancamentoRelatorio(rel, 'adiantamento', id))}
        />
        <LancamentosCard
          titulo="Valores a reembolsar"
          descricao="São somados ao valor dos serviços."
          itens={rel.reembolsos}
          campo="reembolsos"
          erroDoCampo={erroDoCampo}
          onChange={(reembolsos) => set({ reembolsos })}
          onRemover={(id) => set(removerLancamentoRelatorio(rel, 'reembolso', id))}
        />
        <AnexosRelatorioCard
          anexos={rel.anexos}
          relatorio={rel}
          onChange={(anexos) => set({ anexos })}
        />
        <Card className="p-6">
          <SectionTitle title="Resumo financeiro" />
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Resumo label="Serviços" valor={totais.servicos} />
            <Resumo label="Adiantamentos" valor={-totais.adiantamentos} />
            <Resumo label="Reembolsos" valor={totais.reembolsos} />
            <Resumo
              label={totais.tipoSaldo === 'devolver' ? 'Valor a devolver' : 'Valor a receber'}
              valor={totais.valorFinal}
              destaque
            />
          </div>
        </Card>
        <TextosCard
          titulo="Observações"
          itens={rel.observacoes}
          sugestoes={dados.observacoesPadrao.filter(
            (x) => x.aplicacao === 'ambos' || x.aplicacao === 'relatorio'
          )}
          onChange={(observacoes) => set({ observacoes })}
        />
        <TextosCard
          titulo="Forma de pagamento"
          itens={rel.pagamentos}
          sugestoes={dados.pagamentosPadrao.filter(
            (x) => x.aplicacao === 'ambos' || x.aplicacao === 'relatorio'
          )}
          onChange={(pagamentos) => set({ pagamentos })}
        />
      </div>
      <div className="my-4 space-y-3">
        <DadosClienteDocumento documento={rel} clientes={dados.clientes} onChange={set} />
        {rel.id && (
          <LinhaTempo
            tipo="relatorio"
            id={rel.id}
            onRestaurado={() =>
              void api.relatorios.get(rel.id).then((d) => {
                if (d) {
                  setRel(d)
                  setSnapshotSalvo(JSON.stringify(d))
                }
              })
            }
          />
        )}
      </div>
      {previa && (
        <PreviaRelatorioModal
          relatorio={{ ...rel, totais }}
          empresa={rel.empresaSnapshot ?? dados.empresa}
          tratamento={
            rel.clienteSnapshot?.tratamento ??
            dados.clientes.find((c) => c.id === rel.clienteId)?.tratamento
          }
          onClose={() => setPrevia(false)}
        />
      )}
    </PageShell>
  )
}
function Resumo({
  label,
  valor,
  destaque
}: {
  label: string
  valor: number
  destaque?: boolean
}): JSX.Element {
  return (
    <div className={destaque ? 'rounded-lg bg-brand-teal/10 p-3' : 'rounded-lg bg-slate-50 p-3'}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={destaque ? 'font-bold text-brand-tealDark' : 'font-semibold'}>
        {formatMoeda(valor)}
      </p>
    </div>
  )
}
function LancamentosCard({
  titulo,
  descricao,
  itens,
  campo,
  erroDoCampo,
  onChange,
  onRemover
}: {
  titulo: string
  descricao: string
  itens: LancamentoRelatorio[]
  campo: 'adiantamentos' | 'reembolsos'
  erroDoCampo: (campo: string) => string | undefined
  onChange: (v: LancamentoRelatorio[]) => void
  onRemover: (id: string) => void
}): JSX.Element {
  const add = () => onChange([...itens, { id: novoId(), descricao: '', valor: 0 }])
  const upd = (id: string, p: Partial<LancamentoRelatorio>) =>
    onChange(itens.map((x) => (x.id === id ? { ...x, ...p } : x)))
  return (
    <Card className="p-6">
      <SectionTitle
        title={titulo}
        description={descricao}
        action={
          <Button variant="outline" onClick={add}>
            + Adicionar
          </Button>
        }
      />
      {itens.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum lançamento.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((x, indice) => (
            <div
              key={x.id}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
            >
              <Field error={erroDoCampo(`${campo}.${indice}.descricao`)}>
                <Input
                  value={x.descricao}
                  placeholder="Descrição"
                  aria-label={`Descrição de ${titulo.toLowerCase()} ${indice + 1}`}
                  onChange={(e) => upd(x.id, { descricao: e.target.value })}
                />
              </Field>
              <Field error={erroDoCampo(`${campo}.${indice}.valor`)}>
                <NumberField
                  value={x.valor}
                  min={0}
                  aria-label={`Valor de ${titulo.toLowerCase()} ${indice + 1}`}
                  onChange={(valor) => upd(x.id, { valor })}
                />
              </Field>
              <IconButton
                icon={X}
                label={`Remover lançamento de ${titulo.toLowerCase()}`}
                className="self-start text-slate-400 hover:text-red-600"
                onClick={() => onRemover(x.id)}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function AnexosRelatorioCard({
  anexos,
  relatorio,
  onChange
}: {
  anexos: Relatorio['anexos']
  relatorio: Relatorio
  onChange: (v: Relatorio['anexos']) => void
}): JSX.Element {
  const referencias = [
    ...relatorio.itensServico.map((x, n) => ({
      tipo: 'servico' as const,
      id: x.id,
      texto: `Serviço ${n + 1}: ${x.descricao}`
    })),
    ...relatorio.adiantamentos.map((x) => ({
      tipo: 'adiantamento' as const,
      id: x.id,
      texto: `Adiantamento: ${x.descricao || 'sem descrição'}`
    })),
    ...relatorio.reembolsos.map((x) => ({
      tipo: 'reembolso' as const,
      id: x.id,
      texto: `Reembolso: ${x.descricao || 'sem descrição'}`
    }))
  ]
  return (
    <AnexosCard
      anexos={anexos}
      onChange={onChange}
      titulo="Fotos e comprovantes"
      descricao="As fotos dos serviços, comprovantes de adiantamento e reembolso começam cada qual em uma nova página."
      opcoesVinculo={referencias}
      valorVinculo={(anexo) => anexo.referenciaId ?? ''}
      atualizarVinculo={(_anexo, id) => {
        const referencia = referencias.find((item) => item.id === id)
        return {
          referenciaId: referencia?.id ?? null,
          referenciaTipo: (referencia?.tipo ??
            'solto') as Relatorio['anexos'][number]['referenciaTipo']
        }
      }}
      prepararNovos={(novos) =>
        novos.map((anexo) => ({ ...anexo, referenciaId: null, referenciaTipo: 'solto' as const }))
      }
      buscarImagem={(id) => api.anexosRelatorio.imagem(id)}
    />
  )
}
