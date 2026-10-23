import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { EmpresaConta } from '../../shared/conta'
import type { ConfigNuvem } from '../../shared/types'
import { registrarDiagnostico } from '../diagnostico'

export interface PerfilConta {
  id: string
  usuario: string
  email: string
  emailPendente?: string
  emailConfirmacaoRecebida?: boolean
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
  try {
    const dados = JSON.parse(readFileSync(caminho, 'utf8')) as RegistroPerfis
    if (!Array.isArray(dados.perfis) || dados.perfis.some((p) => !/^[a-f0-9]{64}$/.test(p.id)))
      throw new Error('Registro de perfis com formato inválido.')
    return dados
  } catch (erro) {
    return isolarRegistroDanificado(caminho, erro)
  }
}
/**
 * Um `contas.json` truncado ou ilegível não pode travar o aplicativo: o arquivo é guardado ao
 * lado, com a data, e o computador segue sem perfis salvos (a nuvem devolve os dados no login).
 */
function isolarRegistroDanificado(caminho: string, erro: unknown): RegistroPerfis {
  const guardado = `${caminho}.corrompido-${new Date().toISOString().replace(/[:.]/g, '-')}`
  try {
    renameSync(caminho, guardado)
  } catch (falha) {
    registrarDiagnostico('contas-json-ilegivel', erro, { guardado: false })
    throw new Error(
      'Não foi possível abrir os perfis deste computador. Feche o aplicativo, confira se a pasta de dados permite gravação e procure o suporte.',
      { cause: falha }
    )
  }
  registrarDiagnostico('contas-json-ilegivel', erro, { guardado })
  return { atual: null, perfis: [] }
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
/** Remove somente o perfil que o servidor confirmou como empresa excluída. */
export function removerPerfil(id: string): void {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Perfil local inválido.')
  const registro = lerPerfis()
  registro.perfis = registro.perfis.filter((perfil) => perfil.id !== id)
  if (registro.atual === id) registro.atual = null
  gravarRegistro(registro)
  rmSync(join(app.getPath('userData'), 'perfis', id), { recursive: true, force: true })
}
