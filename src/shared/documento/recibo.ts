import type { Recibo, Orcamento } from '../types'
import { formatMoeda, formatDataExtenso } from '../format'
import { valorPorExtenso } from '../extenso'
export function reciboComoDocumento(r: Recibo): Orcamento {
  const recebido = r.status === 'recebido'
  const introducao = recebido
    ? `Recebemos de ${r.destinatario} a importância de ${formatMoeda(r.valor)} (${valorPorExtenso(r.valor)}), referente a ${r.descricao}.\nPagamento realizado em ${formatDataExtenso(r.data)}, em ${r.local}, por ${r.formaPagamento}.\nEste recibo corresponde à quitação ${r.quitacao === 'total' ? 'total do serviço descrito' : 'parcial do serviço descrito, limitada ao valor acima'}.`
    : `Serviço prestado a ${r.destinatario}: ${r.descricao}.\nValor a pagar: ${formatMoeda(r.valor)} (${valorPorExtenso(r.valor)}).\nForma de pagamento prevista: ${r.formaPagamento}. Local: ${r.local}.\nPagamento pendente. Este documento não declara recebimento nem quitação.`
  return {
    ...r,
    formato: 'carta',
    titulo:
      r.status === 'cancelado'
        ? 'Documento Cancelado'
        : recebido
          ? 'Recibo de Pagamento'
          : 'Cobrança de Serviço',
    introducao,
    itensServico: [],
    materiais: [],
    observacoes: r.observacao ? [{ id: 'observacao', texto: r.observacao }] : [],
    pagamentos: [],
    anexos: [],
    valorTotal: 0,
    status: 'rascunho',
    documentoRecibo: true
  } as Orcamento
}
