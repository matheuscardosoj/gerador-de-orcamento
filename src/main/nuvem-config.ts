// Configuração e vocabulário compartilhados pelos módulos da sincronização com a nuvem.
import type { ConfigNuvem, TipoDocumento } from '@shared/types'
import { get, run, texto } from './db/sqlite'
import { tabelasFilhos } from './versoes'

export type ContextoNuvem = {
  protocolo: number
  empresaId: string
  usuarioId: string
  usuarioNome: string
  papel?: 'administrador' | 'membro'
}
export function protocoloNuvem(): number {
  return config<ContextoNuvem>('contextoNuvem')?.protocolo ?? 1
}
export const tipos: TipoDocumento[] = ['orcamento', 'relatorio', 'recibo']
export const tabelas = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'configuracoes',
  'imagens'
]
export const permitido = new Set([
  ...tabelas,
  'orcamentos',
  'relatorios',
  'recibos',
  'recebimentos',
  'documento_meta',
  'versoes',
  ...Object.values(tabelasFilhos).flat()
])
export function config<T>(chave: string): T | null {
  const l = get('SELECT valor FROM configuracoes WHERE chave=?', [chave])
  return l ? JSON.parse(texto(l.valor)) : null
}
export function salvar(chave: string, valor: unknown): void {
  run(
    'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
    [chave, JSON.stringify(valor)]
  )
}
export function configuracaoNuvem(): ConfigNuvem {
  return config<ConfigNuvem>('nuvem') ?? { url: '', chavePublica: '', email: '' }
}
