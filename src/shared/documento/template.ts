// Gera o HTML do orçamento no layout das propostas reais da VS Prestadora.
// Usado tanto na prévia (renderer) quanto na geração de PDF/DOCX (main).
import type { EmpresaConfig, Orcamento } from '../types'
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

export interface OpcoesDocumento {
  fragmento?: boolean
}

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

  const corpo = `
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

    <div class="rodape">
      <div class="rodape-linha"></div>
      <p class="rodape-nome">${esc(empresa.textoAssinatura || empresa.razaoSocial)}</p>
    </div>
  `

  const estilo = `
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; font-family: Calibri, 'Segoe UI', Arial, sans-serif; color: #000; font-size: 11.5pt; line-height: 1.4; }
    .pagina { padding: 15mm 14mm; min-height: 100vh; display: flex; flex-direction: column; }
    .moldura { flex: 1 0 auto; display: flex; flex-direction: column; }
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
    .rodape { margin-top: auto; padding-top: 12mm; text-align: center; page-break-inside: avoid; }
    .rodape-linha { border-top: 1px solid #000; width: 55%; margin: 0 auto 3px; }
    .rodape-nome { margin: 0; }
  `

  if (opts.fragmento) {
    return `<style>${estilo}</style><div class="pagina">${corpo}</div>`
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(
    orc.numero
  )}</title><style>${estilo}</style></head><body><div class="pagina">${corpo}</div></body></html>`
}

// ---------------------------------------------------------------------------
// Versão para DOCX: o html-to-docx não interpreta CSS de <style> nem flexbox,
// então usamos ESTILOS INLINE e uma TABELA no cabeçalho para reproduzir o layout.
// ---------------------------------------------------------------------------

function servicosCartaDocx(orc: Orcamento): string {
  return orc.itensServico
    .map((i, idx) => {
      const partes = [`<b>Item ${idx + 1} -</b> ${nl2br(i.descricao)}`]
      if (i.quantidade > 1 && i.valorUnitario > 0) {
        partes.push(`Valor por ${esc(i.unidade)}: ${formatMoeda(i.valorUnitario)}`)
      }
      partes.push(`Valor do item: ${formatMoeda(i.valorTotal)}`)
      return `<p style="text-align:justify; margin:0 0 8px 0;">${partes.join(' / ')}</p>`
    })
    .join('')
}

function servicosTabelaDocx(orc: Orcamento): string {
  const th = 'border:1px solid #666; padding:5px 7px; background-color:#eeeeee; font-weight:bold;'
  const td = 'border:1px solid #666; padding:5px 7px;'
  const linhas = orc.itensServico
    .map(
      (i, idx) => `<tr>
        <td style="${td} text-align:center;">${idx + 1}</td>
        <td style="${td}">${nl2br(i.descricao)}</td>
        <td style="${td}">${esc(i.unidade)}</td>
        <td style="${td} text-align:right;">${i.quantidade}</td>
        <td style="${td} text-align:right;">${formatMoeda(i.valorUnitario)}</td>
        <td style="${td} text-align:right;">${formatMoeda(i.valorTotal)}</td>
      </tr>`
    )
    .join('')
  return `<table style="width:100%; border-collapse:collapse; margin:0 0 10px 0;">
    <tr>
      <td style="${th} text-align:center;">Item</td><td style="${th}">Especificação</td>
      <td style="${th}">Unid.</td><td style="${th} text-align:right;">Qtd</td>
      <td style="${th} text-align:right;">Valor unit.</td><td style="${th} text-align:right;">Total</td>
    </tr>
    ${linhas}
  </table>`
}

function listaDocx(titulo: string, itens: string[]): string {
  const lis = itens.filter((t) => t && t.trim()).map((t) => `<li>${nl2br(t)}</li>`).join('')
  if (!lis) return ''
  return `<p style="font-weight:bold; margin:12px 0 2px 0;">${esc(titulo)}</p><ul style="margin:0;">${lis}</ul>`
}

export function gerarHtmlParaDocx(orc: Orcamento, empresa: EmpresaConfig): string {
  const total = orc.itensServico.reduce((s, i) => s + (i.valorTotal || 0), 0)
  const cidade = extrairCidade(empresa.endereco)
  const logo = empresa.logoDataUrl
    ? `<img src="${empresa.logoDataUrl}" width="96" height="96" alt="logo" />`
    : ''

  const servicos = orc.formato === 'tabela' ? servicosTabelaDocx(orc) : servicosCartaDocx(orc)
  const materiais = listaDocx('Materiais:', orc.materiais.map((m) => `${m.quantidade} ${m.unidade} — ${m.especificacao}`))
  const observacoes = listaDocx('Observações:', orc.observacoes.map((o) => o.texto))
  const pagamentos = listaDocx('Forma de Pagamento:', orc.pagamentos.map((p) => p.texto))

  const cel = 'vertical-align:middle; border-bottom:2px solid #000000; padding-bottom:6px;'

  const corpo = `
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="${cel} width:120px; text-align:center;">${logo}</td>
        <td style="${cel} text-align:center;">
          <p style="font-weight:bold; font-size:13pt; margin:0;">${esc(empresa.nome)}</p>
          <p style="margin:0;">${esc(empresa.endereco)}</p>
          <p style="margin:0;">Fone: ${esc(empresa.telefones)}</p>
          ${empresa.site ? `<p style="margin:0;">Site: ${esc(empresa.site)}</p>` : ''}
          <p style="margin:0;">e-mail: ${esc(empresa.email)}</p>
          <p style="margin:0;">CNPJ: ${esc(empresa.cnpj)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0 0;">${esc(cidade)}, ${formatDataExtenso(orc.data)}</p>
    ${orc.destinatario ? `<p style="margin:0 0 12px 0;">${nl2br(orc.destinatario)}</p>` : ''}
    <h1 style="text-align:center; font-size:16pt; margin:10px 0 16px 0;">${esc(orc.titulo || 'Proposta de Serviço')}</h1>
    ${orc.introducao ? `<p style="text-align:justify; margin:0 0 10px 0;">${nl2br(orc.introducao)}</p>` : ''}
    ${servicos}
    <p style="margin:12px 0;"><b>Valor total da proposta:</b> <span style="background-color:#fff275;">${formatMoeda(total)} (${valorPorExtenso(total)}).</span></p>
    ${orc.prazoDias ? `<p style="margin:0 0 10px 0;">Estimativa de dias para conclusão do serviço: <b>${orc.prazoDias} dias</b>.</p>` : ''}
    ${materiais}
    ${observacoes}
    ${pagamentos}
    <p style="text-align:center; margin-top:56px;">_____________________________________<br/>${esc(empresa.textoAssinatura || empresa.razaoSocial)}</p>
  `

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color:#000000;">${corpo}</body></html>`
}
