import type { ResultadoImportacaoDados } from '@shared/api'

export type Resumo = Pick<ResultadoImportacaoDados, 'importados' | 'ignorados' | 'renumerados'>
export const tabelasDeDados = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'orcamentos',
  'relatorios',
  'anexos',
  'relatorio_anexos'
]
export const normal = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
