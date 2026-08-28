// Gera o HTML do orçamento no layout das propostas reais da VS Prestadora.
// Usado tanto na prévia (renderer) quanto na geração de PDF/DOCX (main).
import type { AnexoOrcamento, AnexoRelatorio, EmpresaConfig, Orcamento, Relatorio } from '../types'
import { formatMoeda, formatDataExtenso } from '../format'
import { valorPorExtenso } from '../extenso'
import { destinatarioNoDocumento, LIMITE_ANEXO_MM } from './comum'

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br>')
}

function extrairCidade(endereco: string): string {
  const m = endereco.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}/)
  return m ? m[1].trim() : 'Rio Verde'
}

function bloco(titulo: string, itensHtml: string): string {
  if (!itensHtml) return ''
  return `<div class="secao"><p class="secao-titulo">${esc(titulo)}</p>${itensHtml}</div>`
}

function servicosCarta(orc: Orcamento): string {
  return orc.itensServico
    .map((i, idx) => {
      const partes = [`<strong>Item ${idx + 1} -</strong> ${nl2br(i.descricao)}`]
      if (i.quantidade > 1 && i.valorUnitario > 0) {
        partes.push(`Valor por ${esc(i.unidade)}: ${formatMoeda(i.valorUnitario)}`)
      }
      partes.push(`Valor do item: ${formatMoeda(i.valorTotal)}`)
      return `<p class="item">${partes.join(' / ')}</p>`
    })
    .join('')
}

function servicosTabela(orc: Orcamento): string {
  const linhas = orc.itensServico
    .map(
      (i, idx) => `<tr>
        <td class="c-item">${idx + 1}</td>
        <td>${nl2br(i.descricao)}</td>
        <td class="c-unid">${esc(i.unidade)}</td>
        <td class="c-num">${i.quantidade}</td>
        <td class="c-num">${formatMoeda(i.valorUnitario)}</td>
        <td class="c-num">${formatMoeda(i.valorTotal)}</td>
      </tr>`
    )
    .join('')
  return `<table class="tabela-servicos">
    <thead><tr>
      <th class="c-item">Item</th><th>Especificação</th><th class="c-unid">Unid.</th>
      <th class="c-num">Qtd</th><th class="c-num">Valor unit.</th><th class="c-num">Total</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>`
}

function lista(itens: string[]): string {
  const lis = itens
    .filter((t) => t && t.trim())
    .map((t) => `<li>${nl2br(t)}</li>`)
    .join('')
  return lis ? `<ul class="lista">${lis}</ul>` : ''
}

/**
 * Rótulo da referência ao serviço vinculado ("Referente ao Item 2 — …").
 * Compartilhado com o gerador de DOCX para os dois documentos ficarem iguais.
 */
export function referenciaDoAnexo(orc: Orcamento, itemServicoId?: string | null): string | null {
  if (!itemServicoId) return null
  const idx = orc.itensServico.findIndex((i) => i.id === itemServicoId)
  if (idx < 0) return null
  const descricao = orc.itensServico[idx].descricao.replace(/\s+/g, ' ').trim()
  const resumo = descricao.length > 80 ? descricao.slice(0, 80) + '…' : descricao
  return `Referente ao Item ${idx + 1} — ${resumo}`
}

/** Imagem a exibir: a cheia quando disponível (PDF), senão a miniatura (prévia). */
function fonteDaImagem(a: AnexoOrcamento): string {
  return a.imagemDataUrl || a.miniaturaDataUrl || ''
}

interface FiguraAnexo {
  titulo?: string
  referencia?: string | null
  imagem?: string | null
  descricao?: string
}

/** Estrutura única de figura, compartilhada por orçamento e relatório. */
function figuraAnexo({ titulo, referencia, imagem, descricao }: FiguraAnexo): string {
  return `<figure class="anexo">
    ${titulo ? `<p class="anexo-titulo">${esc(titulo)}</p>` : ''}
    ${referencia ? `<p class="anexo-ref">${esc(referencia)}</p>` : ''}
    ${imagem ? `<img class="anexo-img" src="${imagem}" alt="${esc(titulo ?? '')}">` : ''}
    ${descricao ? `<figcaption class="anexo-desc">${nl2br(descricao)}</figcaption>` : ''}
  </figure>`
}

function secaoDeAnexos(titulo: string, figuras: string[]): string {
  return figuras.length
    ? `<section class="anexos"><h2 class="anexos-titulo">${esc(titulo)}</h2>${figuras.join('')}</section>`
    : ''
}

/** Seção de anexos: começa sempre numa página nova e só existe se houver fotos. */
function secaoAnexos(orc: Orcamento): string {
  const anexos = orc.anexos ?? []
  if (anexos.length === 0) return ''
  return secaoDeAnexos(
    'Anexos',
    anexos.map((a) => figuraAnexo({
      titulo: a.titulo,
      referencia: referenciaDoAnexo(orc, a.itemServicoId),
      imagem: fonteDaImagem(a),
      descricao: a.descricao
    }))
  )
}

/**
 * Altura útil da página A4 com as margens de 15 mm de cima e de baixo. Mesma
 * conta feita (independentemente, em px) por `paginarDocumento` — o motor de
 * paginação que reorganiza este HTML em folhas antes de exibir/imprimir.
 */
const ALTURA_UTIL_MM = 297 - 15 * 2

export function gerarHtmlOrcamento(orc: Orcamento, empresa: EmpresaConfig): string {
  const total = orc.itensServico.reduce((s, i) => s + (i.valorTotal || 0), 0)
  const cidade = extrairCidade(empresa.endereco)
  const logo = empresa.logoDataUrl
    ? `<img class="logo" src="${empresa.logoDataUrl}" alt="logo">`
    : `<div class="logo logo-vazia">${esc(empresa.nome.slice(0, 2).toUpperCase())}</div>`

  const servicosHtml = orc.formato === 'tabela' ? servicosTabela(orc) : servicosCarta(orc)
  const materiaisHtml = lista(
    orc.materiais.map((m) => `${m.quantidade} ${m.unidade} — ${m.especificacao}`)
  )
  const observacoesHtml = lista(orc.observacoes.map((o) => o.texto))
  const pagamentosHtml = lista(orc.pagamentos.map((p) => p.texto))

  const propostaHtml = `
    <header class="cabecalho">
      ${logo}
      <div class="empresa">
        <p class="empresa-nome">${esc(empresa.nome)}</p>
        <p>${esc(empresa.endereco)}</p>
        <p>Fone: ${esc(empresa.telefones)}</p>
        ${empresa.site ? `<p>Site: ${esc(empresa.site)}</p>` : ''}
        <p>e-mail: ${esc(empresa.email)}</p>
        <p>CNPJ: ${esc(empresa.cnpj)}</p>
      </div>
    </header>

    <div class="remetente">
      <p>${esc(cidade)}, ${formatDataExtenso(orc.data)}</p>
      ${orc.destinatario ? `<p>${nl2br(destinatarioNoDocumento(orc.destinatario))}</p>` : ''}
    </div>

    <h1 class="titulo">${esc(orc.titulo || 'Proposta de Serviço')}</h1>

    ${orc.introducao ? `<p class="intro">${nl2br(orc.introducao)}</p>` : ''}

    <div class="servicos">${servicosHtml}</div>

    <!--RESUMO_INICIO--><p class="total"><strong>Valor total da proposta:</strong>
      <mark>${formatMoeda(total)} (${valorPorExtenso(total)}).</mark></p><!--RESUMO_FIM-->

    ${
      orc.prazoDias
        ? `<p class="prazo">Estimativa de dias para conclusão do serviço: <strong>${orc.prazoDias} dias</strong>.</p>`
        : ''
    }

    ${materiaisHtml ? bloco('Materiais:', materiaisHtml) : ''}
    ${observacoesHtml ? bloco('Observações:', observacoesHtml) : ''}
    ${pagamentosHtml ? bloco('Forma de Pagamento:', pagamentosHtml) : ''}
  `

  // A proposta fecha na assinatura; os anexos vêm depois, em página nova.
  const corpo = `
    <div class="proposta">
      ${propostaHtml}
      <div class="rodape">
        <div class="rodape-linha"></div>
        <p class="rodape-nome">${esc(empresa.textoAssinatura || empresa.razaoSocial)}</p>
      </div>
    </div>
    ${secaoAnexos(orc)}
    <!--APENDICES-->
  `

  const estilo = `
    * { box-sizing: border-box; }
    /* Escondido até paginarDocumento reorganizar o conteúdo em folhas —
       evita piscar o bloco único original antes da reorganização. */
    body { margin: 0; visibility: hidden; font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #000; font-size: 11.5pt; line-height: 1.4; }
    /* Cada folha é uma caixa A4 autocontida (altura fixa, não min-height): o
       conteúdo já vem garantido caber por construção do motor de paginação,
       então nenhuma folha precisa se fragmentar entre páginas de impressão —
       eliminando a ambiguidade de padding em caixas fragmentadas do Chromium. */
    .pagina { width: 210mm; height: 297mm; padding: 15mm 14mm; box-sizing: border-box; position: relative; }
    .proposta { min-height: ${ALTURA_UTIL_MM}mm; display: flex; flex-direction: column; }
    @media screen {
      /* Fundo e folha brancos; a separação entre as folhas fica por conta da
         sombra e da linha sutil — sem elas, folhas brancas sobre fundo branco
         não teriam limite visível. */
      body { background: #fff; padding: 24px 0; }
      /* outline (e não border): como .pagina é border-box, uma borda comeria
         2px da área útil na tela e a prévia mediria diferente do PDF. */
      .pagina { background: #fff; margin: 0 auto 24px; outline: 1px solid #e2e8f0; box-shadow: 0 2px 10px rgba(15,23,42,.10); }
    }
    @media print {
      .pagina { box-shadow: none; margin: 0; page-break-after: always; }
      .pagina:last-child { page-break-after: auto; }
    }
    @page { size: A4; margin: 0; }
    .cabecalho { display: flex; align-items: flex-start; gap: 16px; }
    .logo { width: 108px; height: 108px; object-fit: contain; flex-shrink: 0; }
    .logo-vazia { display: flex; align-items: center; justify-content: center; border: 1px dashed #bbb; color: #999; font-weight: 700; font-size: 24px; border-radius: 8px; }
    .empresa { flex: 1; text-align: center; line-height: 1.3; border-bottom: 2.5px solid #000; padding-bottom: 6px; }
    .empresa p { margin: 0; font-size: 10.5pt; }
    .empresa-nome { font-weight: 700; font-size: 12pt !important; margin-bottom: 1px !important; }
    .remetente { margin: 12mm 0 6mm; }
    .remetente p { margin: 0; }
    .titulo { text-align: center; font-size: 16pt; font-weight: 700; margin: 4mm 0 8mm; }
    .intro { text-align: justify; margin: 0 0 4mm; }
    .servicos { margin: 0 0 4mm; }
    .item { text-align: justify; margin: 0 0 3mm; }
    .tabela-servicos { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 10.5pt; }
    .tabela-servicos th, .tabela-servicos td { border: 1px solid #666; padding: 5px 7px; vertical-align: top; }
    .tabela-servicos th { background: #eee; text-align: left; }
    .c-item { width: 40px; text-align: center; }
    .c-unid { width: 66px; }
    .c-num { text-align: right; white-space: nowrap; }
    .total { margin: 5mm 0; }
    .total mark { background: #fff275; padding: 1px 3px; }
    .prazo { margin: 0 0 4mm; }
    .secao { margin: 0 0 4mm; }
    .secao-titulo { font-weight: 700; margin: 0 0 1mm; }
    .lista { margin: 0; padding-left: 22px; }
    .lista li { margin: 0 0 1mm; text-align: justify; }
    /* A quebra de página antes dos anexos vem de cada .pagina ser sua própria
       folha (ver @media print acima) — paginarDocumento já os separa em folhas. */
    .anexos { margin: 0 0 4mm; }
    .anexos-titulo { font-size: 14pt; font-weight: 700; text-align: center; margin: 0 0 6mm; }
    .anexo { margin: 0 0 8mm; padding: 0; text-align: center; page-break-inside: avoid; }
    .anexo-titulo { font-weight: 700; margin: 0 0 1mm; }
    .anexo-ref { font-style: italic; color: #555; font-size: 9.5pt; margin: 0 0 2mm; }
    /* Mesmos limites usados no DOCX (dimensoesAnexo), para os dois formatos
       quebrarem as páginas nos mesmos pontos. */
    .anexo-img { display: block; width: auto; height: auto; max-width: ${LIMITE_ANEXO_MM.largura}mm; max-height: ${LIMITE_ANEXO_MM.altura}mm; margin: 0 auto; object-fit: contain; border: 1px solid #ccc; }
    .anexo-desc { margin: 2mm 0 0; font-size: 10.5pt; text-align: center; }
    .rodape { margin-top: auto; padding-top: 12mm; text-align: center; page-break-inside: avoid; }
    .rodape-linha { border-top: 1px solid #000; width: 55%; margin: 0 auto 3px; }
    .rodape-nome { margin: 0; }
  `

  // A paginação em folhas A4 (motor único em `paginar.ts`) é sempre feita por
  // quem consome este HTML — a prévia chama `paginarDocumento` sobre o
  // `contentDocument` do iframe; o PDF injeta a mesma função na janela oculta.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta ${esc(
    String(orc.numero)
  )}</title><style>${estilo}</style></head><body><div class="pagina">${corpo}</div></body></html>`
}

function referenciaAnexoRelatorio(rel: Relatorio, anexo: AnexoRelatorio): string | null {
  if (!anexo.referenciaId || anexo.referenciaTipo === 'solto') return null
  if (anexo.referenciaTipo === 'servico') {
    const idx = rel.itensServico.findIndex((i) => i.id === anexo.referenciaId)
    return idx >= 0 ? `Referente ao Item ${idx + 1} - ${rel.itensServico[idx].descricao}` : null
  }
  const itens = anexo.referenciaTipo === 'adiantamento' ? rel.adiantamentos : rel.reembolsos
  const idx = itens.findIndex((i) => i.id === anexo.referenciaId)
  const rotulo = anexo.referenciaTipo === 'adiantamento' ? 'Adiantamento' : 'Reembolso'
  return idx >= 0 ? `${rotulo} ${idx + 1} - ${itens[idx].descricao}` : null
}

function apendiceRelatorio(rel: Relatorio, titulo: string, anexos: AnexoRelatorio[]): string {
  return secaoDeAnexos(
    titulo,
    anexos.map((a) => figuraAnexo({
      titulo: a.titulo,
      referencia: referenciaAnexoRelatorio(rel, a),
      imagem: a.imagemDataUrl || a.miniaturaDataUrl,
      descricao: a.descricao
    }))
  )
}

/** Relatório usa o mesmo layout/paginador da proposta, trocando apenas os blocos de domínio. */
export function gerarHtmlRelatorio(rel: Relatorio, empresa: EmpresaConfig): string {
  const orcBase: Orcamento = {
    id: rel.id,
    numero: rel.numero,
    data: rel.data,
    clienteId: rel.clienteId,
    destinatario: rel.destinatario,
    formato: rel.formato,
    titulo: rel.titulo || 'Relatório de Serviço',
    introducao: rel.introducao,
    itensServico: rel.itensServico,
    materiais: [],
    observacoes: rel.observacoes,
    pagamentos: rel.pagamentos,
    anexos: [],
    prazoDias: null,
    observacaoInterna: '',
    valorTotal: rel.totais.servicos,
    status: 'rascunho',
    criadoEm: rel.criadoEm,
    atualizadoEm: rel.atualizadoEm
  }
  const listaLancamentos = (itens: Relatorio['adiantamentos'], sinal: '-' | '+'): string =>
    lista(itens.map((i) => `${sinal} ${formatMoeda(i.valor)}${i.descricao ? ` - ${i.descricao}` : ''}`))
  const resumo = `<!--RESUMO_INICIO-->
    <p class="total"><strong>Valor total dos serviços:</strong> ${formatMoeda(rel.totais.servicos)}</p>
    ${rel.adiantamentos.length ? bloco('Adiantamentos:', listaLancamentos(rel.adiantamentos, '-')) : ''}
    ${rel.reembolsos.length ? bloco('Reembolsos:', listaLancamentos(rel.reembolsos, '+')) : ''}
    <p class="total"><strong>Valor a ${rel.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}:</strong>
      <mark>${formatMoeda(rel.totais.valorFinal)} (${valorPorExtenso(rel.totais.valorFinal)}).</mark></p>
    <!--RESUMO_FIM-->`
  const servicos = rel.anexos.filter((a) => a.referenciaTipo === 'servico' || a.referenciaTipo === 'solto')
  const adiantamentos = rel.anexos.filter((a) => a.referenciaTipo === 'adiantamento')
  const reembolsos = rel.anexos.filter((a) => a.referenciaTipo === 'reembolso')
  const apendices = [
    apendiceRelatorio(rel, 'Fotos dos serviços', servicos),
    apendiceRelatorio(rel, 'Comprovantes de adiantamentos', adiantamentos),
    apendiceRelatorio(rel, 'Comprovantes de reembolsos', reembolsos)
  ].join('')
  return gerarHtmlOrcamento(orcBase, empresa)
    .replace(/<!--RESUMO_INICIO-->[\s\S]*?<!--RESUMO_FIM-->/, resumo)
    .replace('<!--APENDICES-->', `${apendices}<!--APENDICES-->`)
    .replace(`<title>Proposta ${rel.numero}</title>`, `<title>Relatório ${rel.numero}</title>`)
}
