import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { EmpresaConta } from '../../shared/conta'
import type { ConfigNuvem } from '../../shared/types'

export interface PerfilConta {
  id: string
  usuario: string
  email: string
  nome: string
  empresa: EmpresaConta
  lembrar: boolean
  central: boolean
  operador: boolean
  configuracao: ConfigNuvem
}
interface RegistroPerfis {
  atual: string | null
  perfis: PerfilConta[]
  solicitacoes?: Record<string, string>
}
export function idPerfil(url: string, empresa: string, usuario: string): string {
  return createHash('sha256')
    .update(JSON.stringify([url.replace(/\/$/, ''), empresa, usuario]))
    .digest('hex')
}
export function lerPerfis(): RegistroPerfis {
  const caminho = join(app.getPath('userData'), 'contas.json')
  if (!existsSync(caminho)) return { atual: null, perfis: [] }
  const dados = JSON.parse(readFileSync(caminho, 'utf8')) as RegistroPerfis
  if (!Array.isArray(dados.perfis) || dados.perfis.some((p) => !/^[a-f0-9]{64}$/.test(p.id)))
    throw new Error(
      'Não foi possível abrir os perfis deste computador. Preserve os arquivos e procure o suporte.'
    )
  return dados
}
export function gravarPerfil(perfil: PerfilConta): void {
  const registro = lerPerfis()
  registro.perfis = [...registro.perfis.filter((p) => p.id !== perfil.id), perfil]
  registro.atual = perfil.id
  gravarRegistro(registro)
}
function gravarRegistro(registro: RegistroPerfis): void {
  const raiz = app.getPath('userData')
  mkdirSync(raiz, { recursive: true })
  const caminho = join(raiz, 'contas.json')
  writeFileSync(`${caminho}.tmp`, JSON.stringify(registro, null, 2), 'utf8')
  renameSync(`${caminho}.tmp`, caminho)
}
/** Mantém a mesma operação após uma falha de rede ou reinício, sem guardar seu conteúdo. */
export function idSolicitacao(conta: string, dados: unknown): string {
  const chave = createHash('sha256')
    .update(JSON.stringify([conta, dados]))
    .digest('hex')
  const registro = lerPerfis()
  registro.solicitacoes ??= {}
  if (!registro.solicitacoes[chave]) {
    registro.solicitacoes[chave] = randomUUID()
    gravarRegistro(registro)
  }
  return registro.solicitacoes[chave]
}
export function concluirSolicitacao(conta: string, dados: unknown): void {
  const chave = createHash('sha256')
    .update(JSON.stringify([conta, dados]))
    .digest('hex')
  const registro = lerPerfis()
  if (registro.solicitacoes?.[chave]) {
    delete registro.solicitacoes[chave]
    gravarRegistro(registro)
  }
}
export function perfilAtual(): PerfilConta | null {
  const r = lerPerfis()
  return r.perfis.find((p) => p.id === r.atual) ?? null
}
