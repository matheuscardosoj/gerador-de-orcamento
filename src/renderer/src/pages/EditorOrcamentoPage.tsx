import { MensagemFlutuante } from '../components/MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { ColaboracaoDocumento } from '../components/ColaboracaoDocumento'
import { useDocumentoRemoto, AvisoAtualizacao } from '../lib/atualizacao-remota'
import { DadosClienteDocumento, LinhaTempo } from '../components/DocumentoExtras'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Eye, ClipboardPlus, FileDown, Save } from 'lucide-react'
import { api } from '../lib/api'
import { useCadastrosAtualizados } from '../lib/hooks'
import { useBloqueioEdicao, useNav } from '../lib/nav'
import {
  type Dados,
  mensagemDoCampo,
  errosDoGrupo,
  DadosGeraisCard,
  MateriaisCard,
  ServicosCard,
  TextosCard
} from './orcamento/cartoes'
export type { Dados }
import { PageShell } from '../ui/layout'
import { Button, Mensagem } from '../ui/primitives'
import { dataCivilHoje, formatMoeda, totalDosItens } from '@shared/format'
import type { Orcamento } from '@shared/types'
import { PreviaModal } from '../components/PreviaModal'
import { AnexosCard } from '../components/AnexosCard'
import { novoId } from '../components/tipos'
import { removerServicoOrcamento } from '@shared/edicao'
import {
  mensagemValidacao,
  normalizarOrcamento,
  validarOrcamentoFinal,
  type ErroValidacao
} from '@shared/validacao'
import { notificar } from '../lib/notificacoes'
export function EditorOrcamentoPage({ orcamentoId }: { orcamentoId?: string }): JSX.Element {
  const { navegar } = useNav()
  const [dados, setDados] = useState<Dados | null>(null)
  useCadastrosAtualizados(setDados)
  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [ocupado, setOcupado] = useState<'salvar' | 'pdf' | 'docx' | 'relatorio' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [errosValidacao, setErrosValidacao] = useState<ErroValidacao[]>([])
  const [snapshotSalvo, setSnapshotSalvo] = useState<string | null>(null)
  const [previaAberta, setPreviaAberta] = useState(false)
  const [rascunhoId, setRascunhoId] = useState<string>()
  // Número com que o orçamento foi carregado: só mexemos na numeração se mudou.
  const [numeroOriginal, setNumeroOriginal] = useState<number | null>(null)

  useEffect(() => {
    setRascunhoId(undefined)
    let vivo = true
    ;(async () => {
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

        if (orcamentoId) {
          const existente = await api.orcamentos.get(orcamentoId)
          if (!existente) throw new Error('Orçamento não encontrado.')
          if (vivo) {
            setOrc(existente)
            setSnapshotSalvo(JSON.stringify(existente))
            setNumeroOriginal(existente.numero)
          }
        } else {
          const numero = await api.orcamentos.proximoNumero()
          if (!vivo) return
          const novo: Orcamento = {
            id: '',
            numero,
            data: dataCivilHoje(),
            clienteId: null,
            camposCliente: empresa.camposClientePadrao ?? ['documento'],
            destinatario: '',
            formato: 'carta',
            titulo: 'Proposta de Serviço',
            introducao: '',
            itensServico: [],
            materiais: [],
            observacoes: observacoesPadrao
              .filter((o) => o.padrao && (o.aplicacao === 'ambos' || o.aplicacao === 'orcamento'))
              .map((o) => ({ id: novoId(), texto: o.texto, origemPadraoId: o.id })),
            pagamentos: pagamentosPadrao
              .filter((p) => p.padrao && (p.aplicacao === 'ambos' || p.aplicacao === 'orcamento'))
              .map((p) => ({ id: novoId(), texto: p.texto, origemPadraoId: p.id })),
            anexos: [],
            prazoDias: null,
            observacaoInterna: '',
            valorTotal: 0,
            status: 'rascunho',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
          }
          setNumeroOriginal(numero)
          setOrc(novo)
          setSnapshotSalvo(JSON.stringify(novo))
        }
      } catch (e) {
        if (vivo) setErro(`Não foi possível carregar o editor. ${mensagemErro(e)}`)
      }
    })()
    return () => {
      vivo = false
    }
  }, [orcamentoId])

  const total = useMemo(() => (orc ? totalDosItens(orc.itensServico) : 0), [orc])
  // Serializar o documento (com miniaturas) é caro: só quando ele ou o snapshot mudam.
  const sujo = useMemo(
    () => orc !== null && snapshotSalvo !== null && JSON.stringify(orc) !== snapshotSalvo,
    [orc, snapshotSalvo]
  )
  useBloqueioEdicao(sujo)
  const atualizacao = useDocumentoRemoto(
    'orcamento',
    rascunhoId ? undefined : orc?.id,
    sujo,
    orc,
    () => (orc?.id ? api.orcamentos.get(orc.id) : Promise.resolve(null)),
    (d) => {
      setOrc(d)
      setSnapshotSalvo(JSON.stringify(d))
      setNumeroOriginal(d.numero)
    }
  )

  if (!orc || !dados) {
    return (
      <PageShell titulo={erro ? 'Falha ao abrir o orçamento' : 'Carregando…'}>
        {erro ? (
          <MensagemFlutuante>{erro}</MensagemFlutuante>
        ) : (
          <p className="text-sm text-slate-500">Carregando dados…</p>
        )}
      </PageShell>
    )
  }

  const limparErrosValidacao = (campos: string[]): void => {
    setErrosValidacao((atuais) =>
      atuais.filter(
        (erro) =>
          !campos.some((campo) => erro.campo === campo || erro.campo.startsWith(`${campo}.`))
      )
    )
  }

  const set = (patch: Partial<Orcamento>): void => {
    setOrc({ ...orc, ...patch })
    limparErrosValidacao(Object.keys(patch))
  }

  const erroDoCampo = (campo: string): string | undefined => mensagemDoCampo(errosValidacao, campo)

  const persistir = async (exigirFinal: boolean): Promise<Orcamento | null> => {
    setErro(null)
    try {
      if (atualizacao.excluido)
        throw new Error(
          'Este orçamento foi excluído em outro computador. Guarde o conteúdo como rascunho antes de sair.'
        )
      const payload = normalizarOrcamento({ ...orc, valorTotal: total })
      if (rascunhoId) {
        if (exigirFinal)
          throw new Error('Aplique o rascunho ou crie um novo documento antes de emitir.')
        const r = await api.rascunhos.save(rascunhoId, payload)
        const d = r.documento as Orcamento
        setOrc(d)
        setSnapshotSalvo(JSON.stringify(d))
        notificar('Rascunho do orçamento guardado neste computador.', 'sucesso')
        return d
      }
      if (exigirFinal || payload.status !== 'rascunho') {
        const erros = validarOrcamentoFinal(payload)
        if (erros.length) {
          setErrosValidacao(erros)
          return null
        }
        setErrosValidacao([])
      }
      const numeroMudou = numeroOriginal !== null && orc.numero !== numeroOriginal
      let salvo: Orcamento | null

      if (orc.id) {
        // A troca de número vem primeiro: se o número estiver em uso, nada é
        // salvo e o usuário vê a mensagem com a sugestão de número livre.
        if (numeroMudou) {
          const r = await api.orcamentos.alterarNumero(orc.id, orc.numero)
          if (!r.ok) {
            setErro(r.erro ?? 'Não foi possível alterar o número do orçamento.')
            return null
          }
        }
        salvo = await api.orcamentos.update(orc.id, payload)
      } else {
        const { id: _id, numero, criadoEm: _c, atualizadoEm: _a, ...novo } = payload
        // Só pede um número específico se o usuário mexeu no campo; senão o
        // main escolhe o próximo livre no momento da criação.
        salvo = await api.orcamentos.create(numeroMudou ? { ...novo, numero } : novo)
      }

      if (salvo) {
        setOrc(salvo)
        setSnapshotSalvo(JSON.stringify(salvo))
        setNumeroOriginal(salvo.numero)
        notificar(
          `Orçamento ${salvo.numero > 0 ? `nº ${String(salvo.numero).padStart(6, '0')}` : ''} salvo.`,
          'sucesso'
        )
        // Orçamento novo com número já ocupado: o main usa o próximo livre em
        // vez de perder o que foi digitado — mas o usuário precisa saber disso.
        if (!orc.id && numeroMudou && salvo.numero !== orc.numero) {
          setErro(
            `O número ${orc.numero} já estava em uso. O orçamento foi salvo com o número ${salvo.numero}.`
          )
        }
      }
      return salvo
    } catch (e) {
      setErro(mensagemErro(e))
      return null
    }
  }

  const executar = async (
    operacao: NonNullable<typeof ocupado>,
    tarefa: () => Promise<void>
  ): Promise<void> => {
    if (ocupado) return
    setOcupado(operacao)
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

  const exportar = async (tipo: 'pdf' | 'docx'): Promise<void> => {
    await executar(tipo, async () => {
      const salvo = await persistir(true)
      if (!salvo) return
      try {
        const r =
          tipo === 'pdf'
            ? await api.documentos.gerarPdf(salvo.id)
            : await api.documentos.gerarDocx(salvo.id)
        if (r.caminho) notificar('Arquivo do orçamento gerado.', 'sucesso')
      } catch (e) {
        setErro(`Não foi possível gerar o documento. ${mensagemErro(e)}`)
      }
    })
  }

  const gerarRelatorio = async (): Promise<void> => {
    await executar('relatorio', async () => {
      const salvo = await persistir(true)
      if (!salvo) return
      const rel = await api.relatorios.criarDeOrcamento(salvo.id)
      if (rel) navegar({ nome: 'editorRelatorio', relatorioId: rel.id })
    })
  }

  const abrirPrevia = (): void => {
    const erros = validarOrcamentoFinal(normalizarOrcamento({ ...orc, valorTotal: total }))
    if (erros.length) {
      setErrosValidacao(erros)
      return
    }
    setErro(null)
    setErrosValidacao([])
    setPreviaAberta(true)
  }

  return (
    <PageShell
      titulo={
        rascunhoId
          ? `Rascunho do orçamento ${orc.numero > 0 ? orc.numero : '— aguardando numeração'}`
          : orc.id
            ? orc.numero > 0
              ? `Orçamento ${orc.numero}`
              : 'Orçamento — aguardando numeração'
            : 'Novo orçamento'
      }
      descricao={`Total: ${formatMoeda(total)}`}
      acoes={
        <>
          <Button icon={ArrowLeft} variant="ghost" onClick={() => navegar({ nome: 'historico' })}>
            Voltar
          </Button>
          <Button icon={Eye} variant="outline" onClick={abrirPrevia} disabled={ocupado !== null}>
            Prévia
          </Button>
          <Button
            icon={ClipboardPlus}
            variant="outline"
            onClick={gerarRelatorio}
            disabled={ocupado !== null}
          >
            Gerar relatório
          </Button>
          <Button
            icon={FileDown}
            variant="outline"
            onClick={() => exportar('docx')}
            disabled={ocupado !== null}
          >
            Word
          </Button>
          <Button
            icon={FileDown}
            variant="outline"
            onClick={() => exportar('pdf')}
            disabled={ocupado !== null}
          >
            PDF
          </Button>
          <Button icon={Save} onClick={salvar} disabled={ocupado !== null}>
            {ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      {erro && <MensagemFlutuante className="mb-4">{erro}</MensagemFlutuante>}
      {errosValidacao.length > 0 && (
        <Mensagem tom="aviso" className="mb-4">
          <p className="font-medium">Revise os campos destacados antes de concluir o documento.</p>
          <p className="mt-1">{mensagemValidacao(errosValidacao)}</p>
        </Mensagem>
      )}
      <div className="space-y-5">
        <AvisoAtualizacao {...atualizacao} sujo={sujo} />
        <ColaboracaoDocumento
          tipo="orcamento"
          onSalvar={() => persistir(false)}
          documento={orc}
          sujo={sujo}
          rascunhoId={rascunhoId}
          onAbrir={(d, id) => {
            setOrc(d as Orcamento)
            setSnapshotSalvo(JSON.stringify(d))
            setNumeroOriginal(d.numero)
            setRascunhoId(id)
          }}
        />
        <DadosGeraisCard
          orc={orc}
          set={set}
          clientes={dados.clientes}
          erroDoCampo={erroDoCampo}
          onValidacao={setErrosValidacao}
        />
        <ServicosCard
          orc={orc}
          set={set}
          dados={dados}
          total={total}
          errosValidacao={errosDoGrupo(errosValidacao, 'itensServico')}
          onRemover={(id) => set(removerServicoOrcamento(orc, id))}
        />
        <MateriaisCard orc={orc} set={set} erroDoCampo={erroDoCampo} />
        <TextosCard
          titulo="Observações"
          descricao="Textos que aparecem no rodapé do orçamento"
          itens={orc.observacoes}
          sugestoes={dados.observacoesPadrao.filter(
            (o) => o.aplicacao === 'ambos' || o.aplicacao === 'orcamento'
          )}
          onChange={(observacoes) => set({ observacoes })}
        />
        <TextosCard
          titulo="Formas de pagamento"
          descricao="Podem ser várias"
          itens={orc.pagamentos}
          sugestoes={dados.pagamentosPadrao.filter(
            (p) => p.aplicacao === 'ambos' || p.aplicacao === 'orcamento'
          )}
          onChange={(pagamentos) => set({ pagamentos })}
        />
        <AnexosCard
          anexos={orc.anexos ?? []}
          onChange={(anexos) => set({ anexos })}
          opcoesVinculo={orc.itensServico.map((item, indice) => ({
            id: item.id,
            texto: `Item ${indice + 1} — ${item.descricao.slice(0, 60)}`
          }))}
          valorVinculo={(anexo) => anexo.itemServicoId ?? ''}
          atualizarVinculo={(_anexo, id) => ({ itemServicoId: id || null })}
          buscarImagem={(id) => api.anexos.imagem(id)}
        />
        <DadosClienteDocumento documento={orc} clientes={dados.clientes} onChange={set} />
        {orc.id && !rascunhoId && (
          <LinhaTempo
            tipo="orcamento"
            id={orc.id}
            onRascunho={(d, id) => {
              setOrc(d as Orcamento)
              setSnapshotSalvo(JSON.stringify(d))
              setNumeroOriginal(d.numero)
              setRascunhoId(id)
            }}
            onRestaurado={() =>
              void api.orcamentos.get(orc.id).then((d) => {
                if (d) {
                  setOrc(d)
                  setSnapshotSalvo(JSON.stringify(d))
                }
              })
            }
          />
        )}
      </div>
      {previaAberta && (
        <PreviaModal
          orc={{ ...orc, valorTotal: total }}
          empresa={orc.empresaSnapshot ?? dados.empresa}
          tratamento={
            orc.clienteSnapshot?.tratamento ??
            dados.clientes.find((c) => c.id === orc.clienteId)?.tratamento
          }
          onClose={() => setPreviaAberta(false)}
        />
      )}
    </PageShell>
  )
}
