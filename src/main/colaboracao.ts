import { randomUUID } from 'crypto'
import { all, get, run, texto, tx } from './db/sqlite'
import { pedidoNuvem, protocoloNuvem, sincronizarNuvem, statusNuvem } from './nuvem'
import { computadorId } from './versoes'
import type { ControleEdicao, MembroEmpresa, TipoDocumento } from '@shared/evolucao'
import { avisarDados } from './eventos'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'

export async function numeracaoCompartilhada(
  tipo: TipoDocumento,
  local: InfoNumeracao
): Promise<InfoNumeracao> {
  if (protocoloNuvem() < 2) return local
  const chave = `numeracaoNuvem:${tipo}`
  let dados: { proximoNumero: number; minimo: number } | null = null
  try {
    dados = (await pedidoNuvem('/rest/v1/rpc/gdo_numeracao_v2', { p_tipo: tipo })) as typeof dados
    run(
      'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
      [chave, JSON.stringify(dados)]
    )
  } catch {
    const cache = get('SELECT valor FROM configuracoes WHERE chave=?', [chave])
    if (cache) dados = JSON.parse(texto(cache.valor))
  }
  return dados
    ? { ...local, proximoBloco: dados.proximoNumero, minimoProximo: dados.minimo }
    : local
}
export async function definirNumeracaoCompartilhada(
  tipo: TipoDocumento,
  numero: number
): Promise<ResultadoNumeracao> {
  exigirProtocolo()
  try {
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > 999999)
      throw new Error('Informe um número inteiro entre 1 e 999999.')
    await pedidoNuvem('/rest/v1/rpc/gdo_numeracao_v2', { p_tipo: tipo, p_proximo: numero })
    avisarDados({ origem: 'nuvem', entidades: [`numeracao:${tipo}`], status: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: String(e).replace(/^Error:\s*/, '') }
  }
}
const editoresAtivos = new Set<string>()
export async function acompanharEdicao(
  tipo: TipoDocumento,
  id: string,
  ativo: boolean
): Promise<void> {
  const chave = `${tipo}:${id}`
  if (ativo) {
    editoresAtivos.add(chave)
    return
  }
  editoresAtivos.delete(chave)
  if (protocoloNuvem() < 2) return
  const c = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
  if (
    !c ||
    Number(c.offline) ||
    c.usuario !== statusNuvem().usuarioId ||
    c.computador !== computadorId()
  )
    return
  try {
    await controlarEdicao(tipo, id, 'liberar')
  } catch {
    /* Sem rede, o bloqueio online expira sem renovação. */
  }
}

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
    const conflitoPreservado =
      acao === 'recuperar' &&
      status.conflitos.length > 0 &&
      status.erro ===
        'Há alterações em conflito preservadas para conciliação. Os demais dados continuam sincronizando.'
    if (
      (status.erro && !conflitoPreservado) ||
      ((status.pendentes || status.conflitos.length) && acao !== 'recuperar')
    )
      throw new Error(
        'Conclua a sincronização ou preserve os rascunhos antes de alterar a autorização.'
      )
    if (acao === 'recuperar' && (status.pendentes || status.conflitos.length)) {
      const { preservarConflitos } = await import('./rascunhos')
      preservarConflitos(
        all('SELECT DISTINCT entidade FROM fila_nuvem').map((l) => texto(l.entidade))
      )
    }
    if (acao === 'offline') {
      const { orcamentosRepo, relatoriosRepo } = await import('./repositories')
      const { recibosRepo } = await import('./recibos')
      const documentos: Array<import('@shared/evolucao').Documento | null> = [
        tipo === 'orcamento'
          ? orcamentosRepo.get(id)
          : tipo === 'relatorio'
            ? relatoriosRepo.get(id)
            : recibosRepo.get(id)
      ]
      const recibo = tipo === 'recibo' ? recibosRepo.get(id) : null
      const relatorioId =
        tipo === 'relatorio' ? id : recibo?.origemTipo === 'relatorio' ? recibo.origemId : null
      if (relatorioId) {
        documentos.push(relatoriosRepo.get(relatorioId))
        documentos.push(
          ...recibosRepo
            .list()
            .filter((r) => r.origemTipo === 'relatorio' && r.origemId === relatorioId)
        )
      }
      if (documentos.some((d) => !d))
        throw new Error('Sincronize as dependências antes de preparar offline.')
      for (const d of documentos) {
        if (!d) continue
        const hashes = [d.empresaSnapshot?.logoHash]
        if ('anexos' in d) hashes.push(...d.anexos.map((a) => a.imagemHash))
        if (hashes.some((h) => h && !get('SELECT 1 FROM imagens WHERE hash=?', [h])))
          throw new Error(
            'Há imagens indisponíveis neste computador. Sincronize antes de preparar offline.'
          )
      }
    }
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
  if (acao !== 'renovar' && acao !== 'obter')
    avisarDados({ origem: 'nuvem', entidades: [`controle:${tipo}:${id}`], status: true })
  if (acao === 'offline') {
    const s = await sincronizarNuvem()
    if (s.erro)
      throw new Error(
        'A autorização está preparada no servidor, mas falta baixar o conjunto financeiro. Reconecte e sincronize antes de trabalhar offline.'
      )
  }
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
export async function autorizarEmissao(tipo: TipoDocumento, id: string): Promise<void> {
  if (protocoloNuvem() < 2) return
  const c = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
  if (
    c?.usuario === statusNuvem().usuarioId &&
    c?.computador === computadorId() &&
    Number(c.offline)
  )
    return
  await autorizarGravacao(tipo, id)
  const s = await sincronizarNuvem()
  if (s.erro || get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [`${tipo}:${id}`]))
    throw new Error(
      'Sincronize o documento antes de emitir online. Para emissão sem internet, prepare o documento offline enquanto conectado.'
    )
}
export async function renovarEdicoes(): Promise<void> {
  if (protocoloNuvem() < 2) return
  const uid = statusNuvem().usuarioId
  for (const controle of all(
    'SELECT tipo,documento_id FROM edicoes_documento WHERE usuario=? AND computador=? AND offline=0',
    [uid, computadorId()]
  )) {
    if (!editoresAtivos.has(`${controle.tipo}:${controle.documento_id}`)) continue
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
