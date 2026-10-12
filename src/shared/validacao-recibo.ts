import type { EmpresaConfig, Recibo } from './types'
import { normalizarDataCivil } from './format'

export type ErrosRecibo = Partial<
  Record<'destinatario' | 'descricao' | 'valor' | 'local' | 'formaPagamento' | 'data', string>
>

export function localPagamentoSugerido(empresa?: Pick<EmpresaConfig, 'endereco'> | null): string {
  return empresa?.endereco.match(/(?:^|,)\s*([^,]+?\s*-\s*[A-Z]{2})\b/)?.[1]?.trim() ?? ''
}

/** Independente do vínculo: recibos avulsos e de propostas não exigem relatório. */
export function errosConfirmacaoRecibo(r: Recibo): ErrosRecibo {
  const erros: ErrosRecibo = {}
  if (!r.destinatario.trim()) erros.destinatario = 'Informe o nome ou razão social do cliente.'
  if (!r.descricao.trim()) erros.descricao = 'Descreva o serviço prestado.'
  if (!Number.isFinite(r.valor) || r.valor <= 0) erros.valor = 'Informe um valor maior que zero.'
  if (!r.local.trim()) erros.local = 'Informe o local do pagamento (cidade e UF).'
  if (!r.formaPagamento.trim()) erros.formaPagamento = 'Informe a forma de pagamento.'
  const data = normalizarDataCivil(r.data)
  const instante = new Date(`${data}T12:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    !Number.isFinite(instante.getTime()) ||
    instante.toISOString().slice(0, 10) !== data
  )
    erros.data = 'Informe uma data válida.'
  return erros
}
