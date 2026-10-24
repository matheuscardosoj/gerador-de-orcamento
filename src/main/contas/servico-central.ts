// Configuração do serviço central embutida no instalador (ou fornecida por variáveis de ambiente).
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ConfigNuvem } from '../../shared/types'

function lerConfiguracaoServico(caminho: string): ConfigNuvem {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    throw new Error('A configuração do serviço não é válida. Solicite o instalador atualizado.')
  }
}
export function servico(): ConfigNuvem | null {
  const caminho = join(process.resourcesPath, 'servico.json')
  const url = process.env.GERADOR_SERVICO_URL
  const chavePublica = process.env.GERADOR_SERVICO_CHAVE
  const dados =
    url && chavePublica
      ? { url, chavePublica, email: '' }
      : existsSync(caminho)
        ? lerConfiguracaoServico(caminho)
        : null
  if (
    dados &&
    (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(dados.url) ||
      !String(dados.chavePublica).startsWith('sb_publishable_'))
  )
    throw new Error('A configuração do serviço não é válida. Solicite o instalador atualizado.')
  return dados
}
