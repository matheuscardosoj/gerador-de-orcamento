/** O destinatário é persistido sem pontuação de apresentação. */
export function normalizarDestinatario(valor: string): string {
  return String(valor ?? '').trim().replace(/[\s,]+$/g, '').trim()
}

/** PDF e DOCX mostram exatamente uma vírgula ao fim do destinatário. */
export function destinatarioNoDocumento(valor: string): string {
  const limpo = normalizarDestinatario(valor)
  return limpo ? `${limpo},` : ''
}

/**
 * O tratamento pertence somente à apresentação do documento. Assim, listas,
 * pesquisas e nomes de arquivos trabalham sempre com o nome limpo do cliente.
 */
export function destinatarioComTratamento(tratamento: string | null | undefined, nome: string): string {
  return [String(tratamento ?? '').trim(), normalizarDestinatario(nome)].filter(Boolean).join(' ')
}

export function dataNoNomeArquivo(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('.')
}

export function nomeSeguroArquivo(valor: string): string {
  return normalizarDestinatario(valor)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function nomeBaseDocumento(
  tipo: 'orcamento' | 'relatorio',
  nomeCliente: string,
  data: string
): string {
  const prefixo = tipo === 'orcamento' ? 'Proposta de Serviço' : 'Relatório de Serviço'
  const cliente = nomeSeguroArquivo(nomeCliente) || 'Cliente'
  return `${prefixo} - ${cliente} - ${dataNoNomeArquivo(data)}`
}
