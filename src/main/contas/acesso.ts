import type { PapelConta } from '../../shared/conta'

let autorizado = false
let papel: PapelConta = 'membro'
let emCurso = 0
const esperas: Array<() => void> = []

export function definirAcesso(ativo: boolean, novoPapel: PapelConta = 'membro'): void {
  autorizado = ativo
  papel = novoPapel
}

export function acessoAtivo(): boolean {
  return autorizado
}

export function exigirAcesso(canal: string, args: unknown[] = []): void {
  if (['aplicativo.versao', 'aplicativo.alteracoesPendentes'].includes(canal)) return
  if (!autorizado) throw new Error('Entre na sua conta para acessar os dados da empresa.')
  const administrativo =
    /^(empresa\.save|parametros\.save|dados\.importar|observacoes\.(create|update|remove)|pagamentos\.(create|update|remove)|colaboracao\.(vincularMembro|ativarMembro)|nuvem\.(conectar|finalizarAtualizacao|copiarInstalacao))$/.test(
      canal
    ) ||
    canal.endsWith('.definirProximoNumero') ||
    (canal === 'cadastros.reordenar' && args[0] !== 'servicos')
  if (administrativo && papel !== 'administrador')
    throw new Error('Somente um administrador pode alterar esta configuração da empresa.')
}

export function iniciarOperacao(): () => void {
  emCurso++
  let finalizada = false
  return () => {
    if (finalizada) return
    finalizada = true
    emCurso--
    if (!emCurso) esperas.splice(0).forEach((resolver) => resolver())
  }
}

export async function aguardarOperacoes(): Promise<void> {
  if (emCurso) await new Promise<void>((resolve) => esperas.push(resolve))
}
