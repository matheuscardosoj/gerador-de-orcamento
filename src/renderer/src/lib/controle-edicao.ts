import type { AppApi } from '@shared/api'
import type { EstadoControleEdicao } from '@shared/evolucao'
import { api } from './api'
import { EstadosEdicao } from './estado-edicao'
const estados = new EstadosEdicao()
export function aceitarEstadoEdicao(estado: EstadoControleEdicao): EstadoControleEdicao | null {
  return estados.aceitar(estado)
}
export async function consultarEdicao(...args: Parameters<AppApi['colaboracao']['edicao']>) {
  const estado = aceitarEstadoEdicao(await api.colaboracao.estadoEdicao(...args))
  if (!estado) throw new Error('Esta consulta pertence a uma sessão encerrada.')
  return estado.controle
}

export function estadoEdicaoAtual(empresaId: string, tipo: string, documentoId: string) {
  return estados.obter(empresaId, tipo, documentoId)
}
