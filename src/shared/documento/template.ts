// Gera o HTML do orçamento no layout da VS Prestadora.
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

/** Converte quebras de linha em <br>. */
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
  const itens = orc.itensServico
    .map((i) => {
      const linhaValor =
        i.quantidade && i.quantidade !== 1
          ? `<span class="item-valor">${i.quantidade} ${esc(i.unidade)} × ${formatMoeda(
              i.valorUnitario
            )} — Valor total do item: <strong>${formatMoeda(i.valorTotal)}</strong></span>`
          : `<span class="item-valor">Valor do item: <strong>${formatMoeda(i.valorTotal)}</strong></span>`
      return `<p class="item-carta">${nl2br(i.descricao)}<br>${linhaValor}</p>`
    })
    .join('')
  return itens
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
  /** Para prévia embutida, evita repetir <html>/<head>. */
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
        <p>e-mail: ${esc(empresa.email)}${empresa.site ? ' &nbsp;·&nbsp; site: ' + esc(empresa.site) : ''}</p>
        <p>CNPJ: ${esc(empresa.cnpj)}</p>
      </div>
    </header>
    <div class="regua"></div>

    <p class="data">${esc(cidade)}, ${formatDataExtenso(orc.data)}.</p>
    ${orc.destinatario ? `<p class="destinatario">${nl2br(orc.destinatario)}</p>` : ''}
    <h1 class="titulo">${esc(orc.titulo || 'Proposta de Serviço')}</h1>
    ${orc.introducao ? `<p class="intro">${nl2br(orc.introducao)}</p>` : ''}

    ${servicosHtml}

    ${materiaisHtml ? bloco('Lista de materiais:', materiaisHtml) : ''}

    <p class="total">Valor total da proposta: <mark>${formatMoeda(total)}</mark>
      <span class="total-extenso">(${valorPorExtenso(total)}).</span></p>

    ${
      orc.prazoDias
        ? `<p class="prazo">Estimativa de dias para conclusão do serviço: <strong>${orc.prazoDias} dias</strong>.</p>`
        : ''
    }

    ${observacoesHtml ? bloco('Obs.:', observacoesHtml) : ''}
    ${pagamentosHtml ? bloco('Forma de pagamento:', pagamentosHtml) : ''}

    <div class="assinatura">
      <span class="faixa" style="background:${esc(empresa.corFaixaRodape || '#0f6d6b')}">${esc(
        empresa.textoAssinatura || empresa.razaoSocial
      )}</span>
    </div>
  `

  const estilo = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #1a1a1a; font-size: 12pt; }
    .pagina { padding: 12mm; }
    .moldura { border: 1.5px solid #111; padding: 10mm 9mm; min-height: 262mm; position: relative; }
    .cabecalho { display: flex; align-items: center; gap: 14px; }
    .logo { width: 96px; height: 96px; object-fit: contain; flex-shrink: 0; }
    .logo-vazia { display: flex; align-items: center; justify-content: center; border: 1px dashed #bbb; color: #999; font-weight: 700; font-size: 22px; border-radius: 8px; }
    .empresa { flex: 1; text-align: center; line-height: 1.35; }
    .empresa p { margin: 0; font-size: 10.5pt; }
    .empresa-nome { font-weight: 700; font-size: 13pt !important; margin-bottom: 2px !important; }
    .regua { height: 3px; background: #111; margin: 8px 0 16px; }
    .data { text-align: right; margin: 0 0 14px; }
    .destinatario { margin: 0 0 12px; font-weight: 600; }
    .titulo { text-align: center; font-size: 15pt; font-weight: 700; margin: 6px 0 16px; }
    .intro { text-align: justify; margin: 0 0 12px; }
    .item-carta { text-align: justify; margin: 0 0 12px; line-height: 1.5; }
    .item-valor { display: inline-block; margin-top: 4px; }
    .tabela-servicos { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 10.5pt; }
    .tabela-servicos th, .tabela-servicos td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
    .tabela-servicos th { background: #f0f0f0; text-align: left; }
    .c-item { width: 42px; text-align: center; }
    .c-unid { width: 70px; }
    .c-num { text-align: right; white-space: nowrap; }
    .secao { margin: 0 0 12px; }
    .secao-titulo { font-weight: 700; margin: 0 0 4px; }
    .lista { margin: 0; padding-left: 20px; }
    .lista li { margin: 0 0 4px; text-align: justify; }
    .total { font-weight: 600; margin: 14px 0; }
    .total mark { background: #fff275; padding: 1px 4px; font-weight: 700; }
    .total-extenso { font-weight: 400; font-style: italic; }
    .prazo { margin: 0 0 12px; }
    .assinatura { margin-top: 26px; text-align: right; }
    .faixa { display: inline-block; color: #fff; font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; padding: 8px 20px; border-radius: 2px; }
    @media print { .pagina { padding: 0; } }
  `

  if (opts.fragmento) {
    return `<style>${estilo}</style><div class="pagina">${corpo}</div>`
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(
    orc.numero
  )}</title><style>${estilo}</style></head><body><div class="pagina">${corpo}</div></body></html>`
}
