import { randomUUID } from 'crypto'
import { all, get, run, texto, tx } from './db/sqlite'
import { pedidoNuvem, protocoloNuvem, sincronizarNuvem, statusNuvem } from './nuvem'
import { computadorId } from './versoes'
import type { ControleEdicao, MembroEmpresa, TipoDocumento } from '@shared/evolucao'
import { avisarDados } from './eventos'

function exigirProtocolo(): void {
  if (protocoloNuvem() < 2)
    throw new Error(
      'Atualize a configuração SQL da nuvem para usar usuários e edição compartilhada.'
    )
}
export async function membrosEmpresa(): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  return (await pedidoNuvem('/rest/v1/rpc/gdo_membros_v2', {})) as MembroEmpresa[]
}
export async function vincularMembro(email: string, nome: string): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Informe um e-mail válido.')
  return (await pedidoNuvem('/rest/v1/rpc/gdo_membros_v2', {
    p_email: email.trim(),
    p_nome: nome.trim()
  })) as MembroEmpresa[]
}
export async function ativarMembro(usuario: string, ativo: boolean): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  return (await pedidoNuvem('/rest/v1/rpc/gdo_membros_v2', {
    p_usuario: usuario,
    p_ativo: ativo
  })) as MembroEmpresa[]
}
export async function controlarEdicao(
  tipo: TipoDocumento,
  id: string,
  acao = 'obter',
  destino?: string
): Promise<ControleEdicao | null> {
  exigirProtocolo()
  const atual = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
  if (['offline', 'liberar', 'transferir', 'recuperar'].includes(acao)) {
    const status = await sincronizarNuvem()
    if (status.pendentes || status.erro || status.conflitos.length)
      throw new Error(
        'Conclua a sincronização ou preserve os rascunhos antes de alterar a autorização.'
      )
  }
  const controle = (await pedidoNuvem('/rest/v1/rpc/gdo_edicao_v2', {
    p_tipo: tipo,
    p_id: id,
    p_dispositivo: computadorId(),
    p_acao: acao,
    p_geracao: atual?.geracao ?? null,
    p_destino: destino ?? null
  })) as ControleEdicao | null
  tx(() => {
    if (controle)
      run(
        'INSERT INTO edicoes_documento VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET usuario=excluded.usuario,computador=excluded.computador,geracao=excluded.geracao,expira_em=excluded.expira_em,offline=excluded.offline,base_revisao=excluded.base_revisao',
        [
          tipo,
          id,
          controle.usuarioId,
          controle.computador,
          controle.geracao,
          controle.expiraEm,
          controle.offline ? 1 : 0,
          controle.revisao
        ]
      )
    else run('DELETE FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
    if (acao !== 'obter' && acao !== 'renovar')
      run('INSERT INTO auditoria_colaboracao VALUES (?,?,?,?,?,?,?)', [
        randomUUID(),
        new Date().toISOString(),
        statusNuvem().usuarioId ?? null,
        computadorId(),
        acao,
        `${tipo}:${id}`,
        JSON.stringify({ destino, geracao: controle?.geracao })
      ])
  })
  if (acao !== 'renovar')
    avisarDados({ origem: 'nuvem', entidades: [`controle:${tipo}:${id}`], status: true })
  return controle
}
export async function autorizarGravacao(tipo: TipoDocumento, id: string): Promise<void> {
  if (protocoloNuvem() < 2) return
  if (
    !get('SELECT 1 FROM sincronizacao WHERE entidade=?', [`${tipo}:${id}`]) &&
    get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [`${tipo}:${id}`])
  )
    return
  const controle = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [
    tipo,
    id
  ])
  const proprio =
    controle?.usuario === statusNuvem().usuarioId && controle?.computador === computadorId()
  if (proprio && Number(controle.offline)) return
  let c = await controlarEdicao(tipo, id, 'adquirir')
  if (!c) {
    const status = await sincronizarNuvem()
    if (status.erro || status.pendentes)
      throw new Error('Aguarde a primeira sincronização do documento antes de continuar.')
    c = await controlarEdicao(tipo, id, 'adquirir')
  }
  if (!c?.podeEditar)
    throw new Error('Não foi possível obter autorização de edição. Preserve seu rascunho.')
}
export async function renovarEdicoes(): Promise<void> {
  if (protocoloNuvem() < 2) return
  const uid = statusNuvem().usuarioId
  for (const controle of all(
    'SELECT tipo,documento_id FROM edicoes_documento WHERE usuario=? AND computador=? AND offline=0',
    [uid, computadorId()]
  )) {
    try {
      await controlarEdicao(
        texto(controle.tipo) as TipoDocumento,
        texto(controle.documento_id),
        'renovar'
      )
    } catch {
      avisarDados({
        origem: 'nuvem',
        entidades: [`controle:${controle.tipo}:${controle.documento_id}`],
        status: true
      })
    }
  }
}
