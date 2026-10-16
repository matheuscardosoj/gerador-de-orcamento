export type MotivoFalhaNuvem =
  'transporte' | 'servico' | 'sessao' | 'permissao' | 'manutencao' | 'conflito' | 'validacao'

/** Classifica o erro original, antes de convertê-lo em texto para a interface. */
export function classificarFalhaNuvem(erro: unknown): {
  motivo: MotivoFalhaNuvem
  temporaria: boolean
  repetirAposMs?: number
} {
  const e = (erro ?? {}) as {
    status?: number
    codigo?: string
    code?: string
    name?: string
    message?: string
    repetirAposMs?: number
    cause?: { code?: string }
  }
  const texto = `${e.name ?? ''} ${e.message ?? String(erro)} ${e.cause?.code ?? ''}`
  const codigo = e.codigo ?? e.code
  const extra = e.repetirAposMs ? { repetirAposMs: e.repetirAposMs } : {}
  if (e.status === 401 || /refresh token|jwt expired|sessão expirou/i.test(texto))
    return { motivo: 'sessao', temporaria: false }
  if (e.status === 403 || /EMPRESA_EXCLUIDA|MEMBRO_INATIVO|acesso.*encerrado/i.test(texto))
    return { motivo: 'permissao', temporaria: false }
  if (['GDM01', 'GDM02', 'MIGRACAO_PENDENTE'].includes(codigo ?? ''))
    return { motivo: 'manutencao', temporaria: false }
  if (e.status === 409 || /conflito|concilia|revisão.*mudou|versão remota mudou/i.test(texto))
    return { motivo: 'conflito', temporaria: false }
  if (e.status === 429 || (e.status ?? 0) >= 500)
    return { motivo: 'servico', temporaria: true, ...extra }
  if (
    e.status === 408 ||
    /fetch failed|Failed to fetch|network|ENETUNREACH|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|TimeoutError|AbortError|Sem internet|Sem conexão|Falha de rede/i.test(
      texto
    )
  )
    return { motivo: 'transporte', temporaria: true, ...extra }
  return { motivo: 'validacao', temporaria: false }
}
