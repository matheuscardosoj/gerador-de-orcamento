export type MotivoIndisponibilidade = 'empresaExcluida' | 'acessoRemovido' | 'sessaoExpirada'

/** Falhas de transporte nunca autorizam remoção de dados locais. */
export function motivoIndisponibilidade(erro: unknown): MotivoIndisponibilidade | null {
  const e = erro as { codigo?: string; status?: number; message?: string } | null
  if (e?.codigo === 'GDE01' || e?.codigo === 'EMPRESA_EXCLUIDA') return 'empresaExcluida'
  if (e?.codigo === 'GDA01') return 'acessoRemovido'
  if (e?.status === 401) return 'sessaoExpirada'
  return null
}
