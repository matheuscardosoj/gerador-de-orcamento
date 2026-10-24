// Falha ao excluir uma empresa: registra o diagnóstico técnico neste computador e devolve a mensagem.
import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { diagnosticoErro } from '../../shared/erros'

export function erroExclusao(etapa: 'capacidades' | 'exclusao', erro: unknown): Error {
  const e = erro as { message?: unknown; status?: unknown; codigo?: unknown; code?: unknown }
  const status = typeof e.status === 'number' ? e.status : null
  const codigo = typeof e.codigo === 'string' ? e.codigo : typeof e.code === 'string' ? e.code : ''
  const diagnostico = diagnosticoErro(erro)
  const pasta = join(app.getPath('userData'), 'logs')
  try {
    mkdirSync(pasta, { recursive: true })
    appendFileSync(
      join(pasta, 'exclusao-empresa.jsonl'),
      `${JSON.stringify({ em: new Date().toISOString(), etapa, status, ...diagnostico, codigo: codigo || diagnostico.codigo })}\n`,
      'utf8'
    )
  } catch {
    // A falha de gravação do diagnóstico não substitui a falha original.
  }
  console.error('Falha ao excluir empresa:', { etapa, status, ...diagnostico })
  return new Error(
    `Não foi possível excluir a empresa${status ? ` (HTTP ${status})` : ''}${codigo ? `, código ${codigo}` : ''}. O diagnóstico técnico foi registrado neste computador.`,
    { cause: erro }
  )
}
