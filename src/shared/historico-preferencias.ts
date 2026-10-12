import type { TipoDocumento } from './types'
export interface PreferenciasHistorico {
  busca: string
  campo: string
  direcao: 'asc' | 'desc'
  colunas: string[]
  estado: string
  de: string
  ate: string
  minimo: string
  maximo: string
  saldo: string
  origem: string
}
export const colunasHistorico: Record<TipoDocumento, string[]> = {
  orcamento: [
    'data',
    'destinatario',
    'valor',
    'status',
    'servicos',
    'anotacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ],
  relatorio: [
    'data',
    'destinatario',
    'origem',
    'servicosValor',
    'valor',
    'status',
    'servicos',
    'anotacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ],
  recibo: [
    'data',
    'destinatario',
    'valor',
    'status',
    'descricao',
    'origem',
    'formaPagamento',
    'quitacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ]
}
export function preferenciasPadrao(tipo: TipoDocumento): PreferenciasHistorico {
  return {
    busca: '',
    campo: 'numero',
    direcao: 'desc',
    estado: '',
    de: '',
    ate: '',
    minimo: '',
    maximo: '',
    saldo: '',
    origem: '',
    colunas:
      tipo === 'relatorio'
        ? ['data', 'destinatario', 'origem', 'servicosValor', 'valor', 'status']
        : tipo === 'recibo'
          ? ['data', 'destinatario', 'valor', 'status']
          : ['data', 'destinatario', 'valor', 'status']
  }
}
export function normalizarPreferencias(
  tipo: TipoDocumento,
  entrada: unknown
): PreferenciasHistorico {
  const padrao = preferenciasPadrao(tipo)
  if (!entrada || typeof entrada !== 'object') return padrao
  const p = entrada as Record<string, unknown>
  for (const k of ['busca', 'estado', 'de', 'ate', 'minimo', 'maximo', 'saldo', 'origem'] as const)
    if (typeof p[k] === 'string') padrao[k] = p[k].slice(0, 500)
  if (p.direcao === 'asc' || p.direcao === 'desc') padrao.direcao = p.direcao
  if (
    typeof p.campo === 'string' &&
    p.campo !== 'ordem' &&
    ['numero', ...colunasHistorico[tipo]].includes(p.campo)
  )
    padrao.campo = p.campo
  if (Array.isArray(p.colunas))
    padrao.colunas = [
      ...new Set(
        p.colunas.filter(
          (c): c is string => typeof c === 'string' && colunasHistorico[tipo].includes(c)
        )
      )
    ]
  return padrao
}
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}
export function correspondeBusca(busca: string, campos: Array<string | number>): boolean {
  const texto = normalizarBusca(campos.join(' '))
  return normalizarBusca(busca)
    .split(' ')
    .filter(Boolean)
    .every((t) => texto.includes(t))
}
