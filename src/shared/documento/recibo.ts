import type { EmpresaConfig, Recibo, ItemServico } from '../types'
import { linhasCliente } from '../clientes'
import { formatMoeda, formatDataCurta } from '../format'
import { valorPorExtenso } from '../extenso'
/** A5 horizontal, compartilhado pela prévia, PDF e Word. */
export const PAPEL_RECIBO = {
  largura: 210,
  altura: 148,
  margemHorizontal: 12,
  margemVertical: 9
} as const

export type BlocoRecibo =
  | { tipo: 'valor' | 'cliente' | 'fechamento' }
  | { tipo: 'servico' | 'observacao'; texto: string; linhas?: string[] }

/** As três saídas utilizam as mesmas divisões de conteúdo e a mesma área útil. */
export interface PaginacaoRecibo {
  topoCorpoMm: number
  paginas: BlocoRecibo[][]
}

export function modeloRecibo(r: Recibo, empresaAtual: EmpresaConfig) {
  const empresa = r.empresaSnapshot ?? empresaAtual
  const recebido = r.status === 'recebido'
  const cancelado = r.status === 'cancelado'
  const nomeEmpresa =
    (empresa.nomeExibicao === 'razaoSocial' ? empresa.razaoSocial : empresa.nome) ||
    empresa.razaoSocial ||
    empresa.nome
  // A identidade do prestador aparece na logo; a diagramação segue os demais documentos.
  const cor = '#000000'
  const dadosEmpresa = [
    [
      empresa.razaoSocial && empresa.razaoSocial !== nomeEmpresa ? empresa.razaoSocial : '',
      empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    empresa.endereco,
    [empresa.telefones, empresa.email].filter(Boolean).join(' · ')
  ].filter(Boolean)
  return {
    empresa,
    nomeEmpresa,
    dadosEmpresa,
    cor,
    titulo: cancelado
      ? 'Documento cancelado'
      : recebido
        ? 'Recibo de pagamento'
        : 'Cobrança de serviço',
    estado: cancelado
      ? 'CANCELADO'
      : r.status === 'rascunho'
        ? 'RASCUNHO'
        : recebido
          ? `QUITAÇÃO ${r.quitacao === 'total' ? 'TOTAL' : 'PARCIAL'}`
          : 'PAGAMENTO PENDENTE',
    numero: r.numero > 0 ? String(r.numero).padStart(6, '0') : 'Rascunho',
    valor: formatMoeda(r.valor),
    valorExtenso: valorPorExtenso(r.valor),
    rotuloValor: recebido
      ? 'Valor recebido'
      : cancelado
        ? 'Valor do documento original'
        : 'Valor a pagar',
    rotuloCliente: recebido ? 'Recebido de' : 'Cliente',
    cliente: r.clienteSnapshot?.nome ?? r.destinatario,
    dadosCliente: linhasCliente(r),
    data: formatDataCurta(r.data),
    rotuloData: recebido ? 'Data do pagamento' : 'Data do documento',
    descricao: r.descricao,
    observacao: r.observacao,
    formaPagamento: r.formaPagamento,
    local: r.local,
    declaracao: cancelado
      ? 'Este documento foi cancelado e está preservado apenas para consulta. Não comprova quitação.'
      : recebido
        ? r.quitacao === 'total'
          ? `Declaramos o recebimento de ${formatMoeda(r.valor)}, dando quitação total do serviço descrito.`
          : `Declaramos o recebimento de ${formatMoeda(r.valor)} como pagamento parcial do serviço descrito. A quitação limita-se a este valor.`
        : 'Pagamento pendente. Esta cobrança não declara recebimento e não comprova quitação.',
    assinatura: empresa.textoAssinatura || empresa.razaoSocial || nomeEmpresa,
    rotuloAssinatura: recebido ? 'Assinatura do prestador / recebedor' : 'Assinatura do prestador'
  }
}

/** Resumo editável: não repete o relatório inteiro no recibo. */
export function resumoServicoRecibo(
  itens: ItemServico[],
  numero: number,
  tipo: 'orcamento' | 'relatorio'
): string {
  const primeiro = itens[0]?.descricao.trim() ?? 'Serviços prestados'
  const outros =
    itens.length === 2
      ? ' e outro serviço'
      : itens.length > 2
        ? ` e outros ${itens.length - 1} serviços`
        : ''
  if (numero <= 0)
    return `${primeiro}${outros}, conforme ${tipo === 'relatorio' ? 'relatório vinculado' : 'proposta vinculada'}.`
  return `${primeiro}${outros}, conforme ${tipo === 'relatorio' ? 'relatório' : 'proposta'} Nº ${String(numero).padStart(6, '0')}.`
}
