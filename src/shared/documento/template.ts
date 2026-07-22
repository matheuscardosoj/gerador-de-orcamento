// Gera o HTML do orçamento no layout das propostas reais da VS Prestadora.
// Usado tanto na prévia (renderer) quanto na geração de PDF/DOCX (main).
import type { AnexoOrcamento, EmpresaConfig, Orcamento } from '../types'
import { formatMoeda, formatDataExtenso } from '../format'
import { valorPorExtenso } from '../extenso'

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

/** Seção de anexos: começa sempre numa página nova e só existe se houver fotos. */
function secaoAnexos(orc: Orcamento): string {
  const anexos = orc.anexos ?? []
  if (anexos.length === 0) return ''
  const figuras = anexos
    .map((a) => {
      const ref = referenciaDoAnexo(orc, a.itemServicoId)
      const src = fonteDaImagem(a)
      return `<figure class="anexo">
        ${a.titulo ? `<p class="anexo-titulo">${esc(a.titulo)}</p>` : ''}
        ${ref ? `<p class="anexo-ref">${esc(ref)}</p>` : ''}
        ${src ? `<img class="anexo-img" src="${src}" alt="${esc(a.titulo)}">` : ''}
        ${a.descricao ? `<figcaption class="anexo-desc">${nl2br(a.descricao)}</figcaption>` : ''}
      </figure>`
    })
    .join('')
  return `<section class="anexos"><h2 class="anexos-titulo">Anexos</h2>${figuras}</section>`
}

export interface OpcoesDocumento {
  fragmento?: boolean
  /**
   * Injeta o script que gruda a assinatura no rodapé da última página da
   * proposta (ver `SCRIPT_ASSINATURA`). Usado só na geração do PDF.
   */
  ajustarAssinatura?: boolean
}

/** Altura útil da página A4 com as margens de 15 mm de cima e de baixo. */
const ALTURA_UTIL_MM = 297 - 15 * 2

/**
 * `margin-top: auto` só encosta a assinatura no rodapé enquanto a proposta cabe
 * em uma página; passando disso não há espaço livre para distribuir. Este script
 * mede em que página a assinatura caiu e completa a distância que falta até o pé
 * daquela página — deixando o PDF igual ao DOCX, onde a assinatura é um frame
 * ancorado à margem inferior.
 */
const SCRIPT_ASSINATURA = `
addEventListener('load', function () {
  var rodape = document.querySelector('.rodape')
  var proposta = document.querySelector('.proposta')
  if (!rodape || !proposta) return

  var regua = document.createElement('div')
  regua.style.cssText = 'position:absolute;visibility:hidden;height:${ALTURA_UTIL_MM}mm'
  document.body.appendChild(regua)
  var alturaPagina = regua.offsetHeight
  regua.remove()
  if (!alturaPagina) return

  var topoConteudo = proposta.getBoundingClientRect().top + scrollY
  var topoRodape = rodape.getBoundingClientRect().top + scrollY - topoConteudo
  var pagina = Math.floor(topoRodape / alturaPagina)
  // 1px de folga: arredondamento não pode empurrar o bloco para a página seguinte.
  var alvo = (pagina + 1) * alturaPagina - rodape.offsetHeight - 1
  if (alvo > topoRodape) rodape.style.marginTop = alvo - topoRodape + 'px'
})`

export function gerarHtmlOrcamento(
  orc: Orcamento,
  empresa: EmpresaConfig,
  opts: OpcoesDocumento = {}
): string {
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
      ${orc.destinatario ? `<p>${nl2br(orc.destinatario)}</p>` : ''}
    </div>

    <h1 class="titulo">${esc(orc.titulo || 'Proposta de Serviço')}</h1>

    ${orc.introducao ? `<p class="intro">${nl2br(orc.introducao)}</p>` : ''}

    <div class="servicos">${servicosHtml}</div>

    <p class="total"><strong>Valor total da proposta:</strong>
      <mark>${formatMoeda(total)} (${valorPorExtenso(total)}).</mark></p>

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
  `

  const estilo = `
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #000; font-size: 11.5pt; line-height: 1.4; }
    .pagina { padding: 15mm 14mm; }
    /* Altura útil em mm (e não 100vh): fora da impressão, o vh vale a altura do
       iframe da prévia, o que fazia a prévia mentir sobre onde a assinatura cai. */
    .proposta { min-height: ${ALTURA_UTIL_MM}mm; display: flex; flex-direction: column; }
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
    .anexos { page-break-before: always; margin: 0 0 4mm; }
    .anexos-titulo { font-size: 14pt; font-weight: 700; text-align: center; margin: 0 0 6mm; }
    .anexo { margin: 0 0 8mm; padding: 0; text-align: center; page-break-inside: avoid; }
    .anexo-titulo { font-weight: 700; margin: 0 0 1mm; }
    .anexo-ref { font-style: italic; color: #555; font-size: 9.5pt; margin: 0 0 2mm; }
    /* Mesmos limites usados no DOCX (dimensoesAnexo), para os dois formatos
       quebrarem as páginas nos mesmos pontos. */
    .anexo-img { max-width: 150mm; max-height: 100mm; object-fit: contain; border: 1px solid #ccc; }
    .anexo-desc { margin: 2mm 0 0; font-size: 10.5pt; text-align: center; }
    .rodape { margin-top: auto; padding-top: 12mm; text-align: center; page-break-inside: avoid; }
    .rodape-linha { border-top: 1px solid #000; width: 55%; margin: 0 auto 3px; }
    .rodape-nome { margin: 0; }
  `

  if (opts.fragmento) {
    return `<style>${estilo}</style><div class="pagina">${corpo}</div>`
  }

  // O script não vai na prévia: o <iframe srcDoc> herda a CSP do renderer
  // (`script-src 'self'`) e um script inline seria bloqueado ali.
  const script = opts.ajustarAssinatura ? `<script>${SCRIPT_ASSINATURA}</script>` : ''

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta ${esc(
    String(orc.numero)
  )}</title><style>${estilo}</style></head><body><div class="pagina">${corpo}</div>${script}</body></html>`
}
