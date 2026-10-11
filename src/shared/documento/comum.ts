import { formatDataExtenso } from '../format'

/** Usa a cidade informada; empresa sem endereço não recebe uma cidade inventada. */
export function localEData(endereco: string, data: string): string {
  const cidade = endereco.match(/(?:^|,)\s*([^,]+?)\s*-\s*[A-Z]{2}\b/)?.[1]?.trim()
  return [cidade, formatDataExtenso(data)].filter(Boolean).join(', ')
}

/** O destinatário é persistido sem pontuação de apresentação. */
export function normalizarDestinatario(valor: string): string {
  return String(valor ?? '')
    .trim()
    .replace(/[\s,]+$/g, '')
    .trim()
}

/** PDF e DOCX mostram exatamente uma vírgula ao fim do destinatário. */
export function destinatarioNoDocumento(valor: string): string {
  const limpo = normalizarDestinatario(valor)
  return limpo ? `${limpo},` : ''
}

/** Limite visual único para anexos em prévia, PDF e Word, sem distorção. */
export const LIMITE_ANEXO_MM = { largura: 150, altura: 100 } as const

/**
 * O tratamento pertence somente à apresentação do documento. Assim, listas,
 * pesquisas e nomes de arquivos trabalham sempre com o nome limpo do cliente.
 */
export function destinatarioComTratamento(
  tratamento: string | null | undefined,
  nome: string
): string {
  return [String(tratamento ?? '').trim(), normalizarDestinatario(nome)].filter(Boolean).join(' ')
}

export function dataNoNomeArquivo(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear()
  ].join('.')
}

export function nomeSeguroArquivo(valor: string): string {
  return normalizarDestinatario(valor)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/g, '')
}

export function nomeBaseDocumento(
  tipo: 'orcamento' | 'relatorio' | 'recibo' | 'cobranca',
  titulo: string,
  nomeCliente: string,
  data: string,
  numero = 0,
  versao = 1
): string {
  void titulo
  const prefixo = {
    orcamento: 'Proposta de Serviço',
    relatorio: 'Relatório de Serviço',
    recibo: 'Recibo de Pagamento',
    cobranca: 'Cobrança de Serviço'
  }[tipo]
  const cliente = nomeSeguroArquivo(nomeCliente) || 'Cliente'
  return `${prefixo} - ${String(Math.max(0, numero)).padStart(6, '0')} - ${cliente} - ${data.slice(0, 10)} - v${String(versao).padStart(3, '0')}`
}
