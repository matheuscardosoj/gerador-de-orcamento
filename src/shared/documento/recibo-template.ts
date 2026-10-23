import type { EmpresaConfig, Recibo } from '../types'
import { modeloRecibo, PAPEL_RECIBO } from './recibo'
import { META_CSP_DOCUMENTO } from './csp'

const esc = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function gerarHtmlRecibo(r: Recibo, empresa: EmpresaConfig): string {
  const m = modeloRecibo(r, empresa)
  const p = PAPEL_RECIBO
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${META_CSP_DOCUMENTO}<title>${esc(m.titulo)} ${esc(m.numero)}</title><style>
    * { box-sizing: border-box; }
    body { margin: 0; visibility: hidden; color: #000; font: 10.5pt/1.35 Calibri, 'Segoe UI', Arial, sans-serif; }
    .recibo-pagina { width: ${p.largura}mm; height: ${p.altura}mm; padding: ${p.margemVertical}mm ${p.margemHorizontal}mm; background: white; }
    .recibo { display: flex; flex-direction: column; }
    .recibo p { margin: 0; }
    .recibo-cabecalho { display: flex; align-items: flex-start; gap: 12px; padding-bottom: 2.5mm; border-bottom: 2px solid ${m.cor}; }
    .recibo-logo { width: 17mm; height: 17mm; object-fit: contain; flex-shrink: 0; }
    .recibo-empresa { text-align: center; flex: 1; min-width: 0; font-size: 8.5pt; line-height: 1.25; overflow-wrap: anywhere; }
    .recibo-empresa strong { display: block; font-size: 11pt; color: ${m.cor}; margin-bottom: 1mm; }
    .recibo-numero { flex-shrink: 0; text-align: right; font-size: 9pt; }
    .recibo-numero strong { display: block; font-size: 11pt; }
    .recibo-titulo { text-align: center; font-size: 16pt; color: ${m.cor}; margin: 2mm 0; }
    .recibo-valor { display: flex; justify-content: space-between; align-items: center; gap: 4mm; border-bottom: 1px solid #ccc; padding: 1mm 0 2mm; margin-bottom: 2.5mm; }
    .recibo-valor small { display: block; color: #555; font-size: 8.5pt; }
    .recibo-valor strong { font-size: 16pt; color: #000; background: #fff275; }
    .recibo-valor-topo { display: flex; align-items: baseline; gap: 3mm; }
    .recibo-valor-topo small { display: inline; }
    .recibo-estado { font-size: 8pt; font-weight: 700; text-align: right; max-width: 45mm; }
    .recibo-cliente { margin-bottom: 2.5mm; overflow-wrap: anywhere; }
    .recibo-cliente small, .recibo-label { display: block; color: #555; font-size: 8.5pt; }
    .recibo-cliente strong { display: block; font-size: 11pt; }
    .recibo-cliente p { font-size: 9pt; }
    .recibo-servico { margin: 0 0 2.5mm !important; overflow-wrap: anywhere; white-space: pre-wrap; }
    .recibo-servico strong { display: block; font-size: 8.5pt; color: #555; }
    .recibo-observacao { margin: 0 0 3mm !important; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 9pt; }
    .recibo-fechamento { padding-top: 2mm; border-top: 1px solid #ccc; }
    .recibo-declaracao { font-size: 9pt; margin-bottom: 2mm !important; }
    .recibo-pagamento { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 2mm 5mm; font-size: 9pt; overflow-wrap: anywhere; }
    .recibo-assinatura { text-align: center; margin-top: 18mm; font-size: 8.5pt; }
    .recibo-assinatura p { width: 60%; margin: 0 auto; padding-top: 1mm; border-top: 1px solid #555; }
    .recibo-assinatura small { display: block; color: #555; font-size: 8pt; }
    @page { size: ${p.largura}mm ${p.altura}mm; margin: 0; }
    @media screen { body { background: #fff; padding: 24px 0; } .recibo-pagina { margin: 0 auto 24px; outline: 1px solid #e2e8f0; box-shadow: 0 2px 10px rgba(15,23,42,.10); } }
    @media print { .recibo-pagina { break-after: page; } .recibo-pagina:last-child { break-after: auto; } }
  </style></head><body><div class="pagina recibo-pagina"><div class="recibo">
    <header class="recibo-cabecalho">
      ${m.empresa.logoDataUrl ? `<img class="recibo-logo" src="${esc(m.empresa.logoDataUrl)}" alt="Logo da empresa">` : ''}
      <div class="recibo-empresa"><strong>${esc(m.nomeEmpresa)}</strong>${m.dadosEmpresa.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      <div class="recibo-numero"><span>Número</span><strong>${esc(m.numero)}</strong><span>${esc(m.data)}</span></div>
    </header>
    <h1 class="recibo-titulo">${esc(m.titulo)}</h1>
    <div class="recibo-valor"><div><div class="recibo-valor-topo"><small>${esc(m.rotuloValor)}</small><strong>${esc(m.valor)}</strong></div><small>${esc(m.valorExtenso)}</small></div><div class="recibo-estado">${esc(m.estado)}</div></div>
    <div class="recibo-cliente"><small>${esc(m.rotuloCliente)}</small><strong>${esc(m.cliente)}</strong>${m.dadosCliente.length ? `<p>${m.dadosCliente.map(esc).join(' · ')}</p>` : ''}</div>
    <p class="recibo-servico"><strong>Serviço prestado</strong><span class="recibo-descricao">${esc(m.descricao)}</span></p>
    ${m.observacao ? `<p class="recibo-observacao"><strong>Observação:</strong> <span class="recibo-observacao-texto">${esc(m.observacao)}</span></p>` : ''}
    <div class="recibo-fechamento">
      <p class="recibo-declaracao">${esc(m.declaracao)}</p>
      <div class="recibo-pagamento"><div><span class="recibo-label">${esc(m.rotuloData)}</span>${esc(m.data)}</div><div><span class="recibo-label">${r.status === 'recebido' ? 'Forma de pagamento' : 'Forma de pagamento prevista'}</span>${esc(m.formaPagamento)}</div>${m.local ? `<div><span class="recibo-label">Local</span>${esc(m.local)}</div>` : ''}</div>
      <div class="recibo-assinatura"><p>${esc(m.assinatura)}</p><small>${esc(m.rotuloAssinatura)}</small></div>
    </div>
  </div></div></body></html>`
}
