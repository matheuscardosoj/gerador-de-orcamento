import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { PageShell } from '../ui/layout'
import { Button, Card, Field, Input, NumberField, Select, SectionTitle, Textarea } from '../ui/primitives'
import { formatMoeda } from '@shared/format'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { normalizarDestinatario } from '@shared/documento/comum'
import type { AnexoRelatorio, LancamentoRelatorio, Orcamento, Relatorio } from '@shared/types'
import { novoId } from '../components/tipos'
import { PreviaRelatorioModal } from '../components/PreviaRelatorioModal'
import { ServicosCard, TextosCard, type Dados } from './EditorOrcamentoPage'
import { arquivosParaAnexos } from '../lib/imagens'

type Base = Pick<Dados, 'empresa' | 'parametros' | 'clientes' | 'servicos' | 'observacoesPadrao' | 'pagamentosPadrao'>
const agora = (): string => new Date().toISOString()

export function EditorRelatorioPage({ relatorioId }: { relatorioId?: string }): JSX.Element {
  const [dados,setDados]=useState<Base|null>(null); const [rel,setRel]=useState<Relatorio|null>(null); const [salvando,setSalvando]=useState(false); const [erro,setErro]=useState<string|null>(null); const [previa,setPrevia]=useState(false)
  useEffect(() => {
    let vivo = true
    void (async () => {
      const [empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao] = await Promise.all([api.empresa.get(), api.parametros.get(), api.clientes.list(), api.servicos.list(), api.observacoes.list(), api.pagamentos.list()])
      if (!vivo) return
      setDados({ empresa, parametros, clientes, servicos, observacoesPadrao, pagamentosPadrao })
      if (relatorioId) { setRel(await api.relatorios.get(relatorioId)); return }
      const numero = await api.relatorios.proximoNumero()
      if (!vivo) return
      setRel({ id: '', numero, data: agora(), clienteId: null, destinatario: '', formato: 'tabela', titulo: 'Relatório de Serviço', introducao: '', itensServico: [], adiantamentos: [], reembolsos: [], observacoes: observacoesPadrao.filter(x => x.padrao && (x.aplicacao === 'ambos' || x.aplicacao === 'relatorio')).map(x => ({ id: novoId(), texto: x.texto, origemPadraoId: x.id })), pagamentos: pagamentosPadrao.filter(x => x.padrao && (x.aplicacao === 'ambos' || x.aplicacao === 'relatorio')).map(x => ({ id: novoId(), texto: x.texto, origemPadraoId: x.id })), anexos: [], status: 'rascunho', origemOrcamento: null, totais: calcularTotaisRelatorio([], [], []), criadoEm: agora(), atualizadoEm: agora() })
    })()
    return () => { vivo = false }
  }, [relatorioId])
  const totais=useMemo(()=>rel?calcularTotaisRelatorio(rel.itensServico,rel.adiantamentos,rel.reembolsos):null,[rel])
  const set = (patch: Partial<Relatorio>): void => {
    setRel((atual) => {
      if (!atual) return atual
      const proximo = { ...atual, ...patch }
      return { ...proximo, totais: calcularTotaisRelatorio(proximo.itensServico, proximo.adiantamentos, proximo.reembolsos) }
    })
  }
  const salvar = async (): Promise<Relatorio | null> => {
    if (!rel || !totais) return null
    setSalvando(true)
    setErro(null)
    try {
      const gravado = rel.id
        ? await api.relatorios.update(rel.id, { ...rel, totais })
        : await api.relatorios.create({ ...rel, totais })
      if (!gravado) throw new Error('Relatório não encontrado.')
      setRel(gravado)
      return gravado
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
      return null
    } finally {
      setSalvando(false)
    }
  }
  if(!dados||!rel||!totais)return <p className="p-8 text-sm text-slate-500">Carregando…</p>
  const orcAdaptado:Orcamento={...rel,materiais:[],prazoDias:null,observacaoInterna:'',valorTotal:totais.servicos,status:'rascunho'}
  const acoes = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setPrevia(true)}>Prévia</Button>
      <Button variant="outline" onClick={() => { void salvar().then((r) => r && api.documentos.gerarRelatorioPdf(r.id)) }}>PDF</Button>
      <Button variant="outline" onClick={() => { void salvar().then((r) => r && api.documentos.gerarRelatorioDocx(r.id)) }}>Word</Button>
      <Button disabled={salvando} onClick={() => { void salvar() }}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
    </div>
  )
  return (
    <PageShell titulo={rel.id ? `Relatório Nº ${rel.numero}` : 'Novo relatório'} descricao="Serviços prestados, adiantamentos e reembolsos" acoes={acoes}>
      {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {rel.origemOrcamento && <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">Gerado da proposta Nº {rel.origemOrcamento.numero}. Alterações aqui não mudam a proposta.</p>}
      <Card className="mb-6 p-6">
        <SectionTitle title="Dados do relatório" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Número"><NumberField value={rel.numero} min={1} step={1} onChange={(numero) => set({ numero })} /></Field>
          <Field label="Data"><Input type="date" value={rel.data.slice(0, 10)} onChange={(e) => set({ data: e.target.value })} /></Field>
          <Field label="Status"><Select value={rel.status} onChange={(e) => set({ status: e.target.value as Relatorio['status'] })}><option value="rascunho">Rascunho</option><option value="emitido">Emitido</option><option value="pago">Pago</option></Select></Field>
          <Field label="Cliente cadastrado"><Select value={rel.clienteId ?? ''} onChange={(e) => { const cliente = dados.clientes.find((x) => x.id === e.target.value); set({ clienteId: cliente?.id ?? null, destinatario: cliente ? `${cliente.tratamento} ${cliente.nome}`.trim() : rel.destinatario }) }}><option value="">— destinatário livre —</option>{dados.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</Select></Field>
          <Field label="Destinatário (sem vírgula)" className="md:col-span-3"><Input value={rel.destinatario} onChange={(e) => set({ destinatario: normalizarDestinatario(e.target.value) })} /></Field>
          <Field label="Título" className="md:col-span-3"><Input value={rel.titulo} onChange={(e) => set({ titulo: e.target.value })} /></Field>
          <Field label="Introdução" className="md:col-span-3"><Textarea value={rel.introducao ?? ''} onChange={(e) => set({ introducao: e.target.value })} /></Field>
        </div>
      </Card>
      <div className="space-y-6">
        <ServicosCard orc={orcAdaptado} set={(p) => set({ itensServico: p.itensServico ?? rel.itensServico })} dados={dados} total={totais.servicos} titulo="Serviços prestados" rotuloTotal="Valor total dos serviços" />
        <LancamentosCard titulo="Valores adiantados" descricao="São subtraídos do valor dos serviços." itens={rel.adiantamentos} onChange={(adiantamentos) => set({ adiantamentos })} />
        <LancamentosCard titulo="Valores a reembolsar" descricao="São somados ao valor dos serviços." itens={rel.reembolsos} onChange={(reembolsos) => set({ reembolsos })} />
        <AnexosRelatorioCard anexos={rel.anexos} relatorio={rel} onChange={(anexos) => set({ anexos })} />
        <Card className="p-6"><SectionTitle title="Resumo financeiro" /><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><Resumo label="Serviços" valor={totais.servicos} /><Resumo label="Adiantamentos" valor={-totais.adiantamentos} /><Resumo label="Reembolsos" valor={totais.reembolsos} /><Resumo label={totais.tipoSaldo === 'devolver' ? 'Valor a devolver' : 'Valor a receber'} valor={totais.valorFinal} destaque /></div></Card>
        <TextosCard titulo="Observações" itens={rel.observacoes} sugestoes={dados.observacoesPadrao.filter((x) => x.aplicacao === 'ambos' || x.aplicacao === 'relatorio')} onChange={(observacoes) => set({ observacoes })} />
        <TextosCard titulo="Forma de pagamento" itens={rel.pagamentos} sugestoes={dados.pagamentosPadrao.filter((x) => x.aplicacao === 'ambos' || x.aplicacao === 'relatorio')} onChange={(pagamentos) => set({ pagamentos })} />
      </div>
      {previa && <PreviaRelatorioModal relatorio={{ ...rel, totais }} empresa={dados.empresa} onClose={() => setPrevia(false)} />}
    </PageShell>
  )
}
function Resumo({label,valor,destaque}:{label:string;valor:number;destaque?:boolean}):JSX.Element{return <div className={destaque?'rounded-lg bg-brand-teal/10 p-3':'rounded-lg bg-slate-50 p-3'}><p className="text-xs text-slate-500">{label}</p><p className={destaque?'font-bold text-brand-tealDark':'font-semibold'}>{formatMoeda(valor)}</p></div>}
function LancamentosCard({titulo,descricao,itens,onChange}:{titulo:string;descricao:string;itens:LancamentoRelatorio[];onChange:(v:LancamentoRelatorio[])=>void}):JSX.Element{const add=()=>onChange([...itens,{id:novoId(),descricao:'',valor:0}]);const upd=(id:string,p:Partial<LancamentoRelatorio>)=>onChange(itens.map(x=>x.id===id?{...x,...p}:x));return <Card className="p-6"><SectionTitle title={titulo} description={descricao} action={<Button variant="outline" onClick={add}>+ Adicionar</Button>}/>{itens.length===0?<p className="text-sm text-slate-500">Nenhum lançamento.</p>:<div className="space-y-2">{itens.map(x=><div key={x.id} className="grid grid-cols-[1fr_160px_auto] gap-2"><Input value={x.descricao} placeholder="Descrição" onChange={e=>upd(x.id,{descricao:e.target.value})}/><NumberField value={x.valor} min={0} onChange={valor=>upd(x.id,{valor})}/><Button variant="ghost" className="text-slate-400 hover:text-red-600" onClick={()=>onChange(itens.filter(i=>i.id!==x.id))}>Excluir</Button></div>)}</div>}</Card>}

function AnexosRelatorioCard({ anexos, relatorio, onChange }: { anexos: AnexoRelatorio[]; relatorio: Relatorio; onChange: (v: AnexoRelatorio[]) => void }): JSX.Element {
  const arquivo = useRef<HTMLInputElement>(null)
  const adicionar = async (files: FileList | File[]): Promise<void> => {
    const novos = await arquivosParaAnexos(files)
    onChange([...anexos, ...novos.map((a) => ({ ...a, referenciaTipo: 'solto' as const, referenciaId: null }))])
  }
  const atualizar = (id: string, patch: Partial<AnexoRelatorio>): void => onChange(anexos.map((a) => a.id === id ? { ...a, ...patch } : a))
  const referencias = [
    ...relatorio.itensServico.map((x, n) => ({ tipo: 'servico' as const, id: x.id, texto: `Serviço ${n + 1}: ${x.descricao}` })),
    ...relatorio.adiantamentos.map((x) => ({ tipo: 'adiantamento' as const, id: x.id, texto: `Adiantamento: ${x.descricao || 'sem descrição'}` })),
    ...relatorio.reembolsos.map((x) => ({ tipo: 'reembolso' as const, id: x.id, texto: `Reembolso: ${x.descricao || 'sem descrição'}` }))
  ]
  return <Card className="p-6"><SectionTitle title="Fotos e comprovantes" description="As fotos dos serviços, comprovantes de adiantamento e reembolso começam cada qual em nova página." action={<Button variant="outline" onClick={() => arquivo.current?.click()}>+ Fotos</Button>} /><input ref={arquivo} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void adicionar(e.target.files); e.target.value = '' }} />
    {anexos.length === 0 ? <p className="text-sm text-slate-500">Nenhuma foto anexada.</p> : <div className="space-y-3">{anexos.map((a) => <div key={a.id} className="grid grid-cols-[72px_1fr_auto] gap-3 rounded-lg border border-slate-200 p-3"><img src={a.miniaturaDataUrl} alt={a.titulo} className="h-16 w-16 rounded object-cover" /><div className="grid gap-2 md:grid-cols-2"><Input value={a.titulo} placeholder="Título" onChange={(e) => atualizar(a.id, { titulo: e.target.value })} /><Select value={a.referenciaId ?? ''} onChange={(e) => { const r = referencias.find((x) => x.id === e.target.value); atualizar(a.id, { referenciaId: r?.id ?? null, referenciaTipo: r?.tipo ?? 'solto' }) }}><option value="">Foto solta / serviço</option>{referencias.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}</Select><Textarea value={a.descricao} placeholder="Observação" className="md:col-span-2" onChange={(e) => atualizar(a.id, { descricao: e.target.value })} /></div><Button variant="ghost" className="text-slate-400 hover:text-red-600" onClick={() => onChange(anexos.filter((x) => x.id !== a.id))}>Excluir</Button></div>)}</div>}
  </Card>
}
