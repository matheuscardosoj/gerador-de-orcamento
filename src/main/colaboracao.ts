import { FilaControleEdicao } from './fila-controle-edicao'
import { identidadeSessaoNuvem } from './nuvem'
import { mensagemErro } from '@shared/erros'
import { randomUUID } from 'crypto'
import { all, get, run, texto, tx } from './db/sqlite'
import { pedidoNuvem, protocoloNuvem, sincronizarNuvem, statusNuvem } from './nuvem'
import { computadorId } from './versoes'
import type { ControleEdicao, MembroEmpresa, TipoDocumento } from '@shared/evolucao'
import { avisarDados } from './eventos'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'
import { filaAtiva, temOperacaoAtiva } from './fila-nuvem'
import { pararTempoReal } from './tempo-real'

export async function numeracaoCompartilhada(
  tipo: TipoDocumento,
  local: InfoNumeracao
): Promise<InfoNumeracao> {
  if (protocoloNuvem() < 2) return local
  const chave = `numeracaoNuvem:${tipo}`
  let dados: { proximoNumero: number; minimo: number; ultimoNumero?: number } | null = null
  try {
    dados = (await pedidoNuvem(
      `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_numeracao_v3' : 'gdo_numeracao_v2'}`,
      { p_tipo: tipo }
    )) as typeof dados
    run(
      'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
      [chave, JSON.stringify(dados)]
    )
  } catch {
    const cache = get('SELECT valor FROM configuracoes WHERE chave=?', [chave])
    if (cache) dados = JSON.parse(texto(cache.valor))
  }
  return dados
    ? protocoloNuvem() >= 3
      ? {
          ...local,
          proximoNumero: dados.proximoNumero,
          menorLivre: dados.proximoNumero,
          minimoProximo: dados.minimo,
          ultimoNumero: dados.ultimoNumero,
          atribuicaoServidor: true
        }
      : { ...local, proximoBloco: dados.proximoNumero, minimoProximo: dados.minimo }
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
    await pedidoNuvem(
      `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_numeracao_v3' : 'gdo_numeracao_v2'}`,
      { p_tipo: tipo, p_proximo: numero }
    )
    if (protocoloNuvem() >= 3)
      run(
        'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
        [
          { orcamento: 'seqOrcamento', relatorio: 'seqRelatorio', recibo: 'seqRecibo' }[tipo],
          JSON.stringify(numero - 1)
        ]
      )
    avisarDados({ origem: 'nuvem', entidades: [`numeracao:${tipo}`], status: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) }
  }
}
export async function acompanharEdicao(
  tipo: TipoDocumento,
  id: string,
  ativo: boolean
): Promise<void> {
  const chave = `${tipo}:${id}`
  // A autorização pertence à sessão do app, não à montagem da tela.
  // O usuário pode continuar responsável e receber pedidos enquanto navega.
  void chave
  void ativo
}

/** Libera leases online ao encerrar ou trocar a conta; a navegação entre telas não chama isto. */
export async function encerrarEdicoesConta(): Promise<void> {
  epocaControle++
  pararTempoReal()
  if (protocoloNuvem() < 2) return
  const status = statusNuvem()
  // Alterações ainda não enviadas continuam vinculadas ao controle local.
  // Ao sair, o lease online expira; a fila permanece para a próxima entrada.
  if (status.pendentes || status.conflitos.length) return
  const linhas = all(
    'SELECT tipo,documento_id,geracao FROM edicoes_documento WHERE usuario=? AND computador=? AND offline=0 AND expira_em>?',
    [status.usuarioId, computadorId(), new Date().toISOString()]
  )
  await Promise.allSettled(
    linhas.map(async (linha) => {
      // Evita sincronizar a base inteira uma vez para cada documento ao sair.
      await pedidoNuvem(
        `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_edicao_v3' : 'gdo_edicao_v2'}`,
        {
          p_tipo: texto(linha.tipo),
          p_id: texto(linha.documento_id),
          p_dispositivo: computadorId(),
          p_acao: 'liberar',
          p_geracao: linha.geracao,
          p_destino: null
        },
        false,
        undefined,
        2000
      )
      run('DELETE FROM edicoes_documento WHERE tipo=? AND documento_id=? AND geracao=?', [
        linha.tipo,
        linha.documento_id,
        linha.geracao
      ])
    })
  )
}

/** Documentos locais desta instalação que já estiveram sob acompanhamento colaborativo. */
export function documentosAcompanhados(
  somenteResponsavel = false
): Array<{ tipo: TipoDocumento; id: string }> {
  const ids = new Map<string, { tipo: TipoDocumento; id: string }>()
  for (const linha of all(
    'SELECT tipo,documento_id FROM edicoes_documento WHERE (offline=1 OR expira_em>?) AND (?=0 OR (usuario=? AND computador=?))',
    [
      new Date().toISOString(),
      somenteResponsavel ? 1 : 0,
      statusNuvem().usuarioId ?? null,
      computadorId()
    ]
  )) {
    const tipo = texto(linha.tipo)
    const id = texto(linha.documento_id)
    if (['orcamento', 'relatorio', 'recibo'].includes(tipo))
      ids.set(`${tipo}:${id}`, { tipo: tipo as TipoDocumento, id })
  }
  return [...ids.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id))
}

function exigirProtocolo(): void {
  if (protocoloNuvem() < 2)
    throw new Error(
      'Atualize a configuração SQL da nuvem para usar usuários e edição compartilhada.'
    )
}
export async function membrosEmpresa(): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  return (await pedidoNuvem(
    `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_membros_v3' : 'gdo_membros_v2'}`,
    {}
  )) as MembroEmpresa[]
}
export async function vincularMembro(email: string, nome: string): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Informe um e-mail válido.')
  return (await pedidoNuvem(
    `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_membros_v3' : 'gdo_membros_v2'}`,
    {
      p_email: email.trim(),
      p_nome: nome.trim()
    }
  )) as MembroEmpresa[]
}
export async function ativarMembro(usuario: string, ativo: boolean): Promise<MembroEmpresa[]> {
  exigirProtocolo()
  return (await pedidoNuvem(
    `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_membros_v3' : 'gdo_membros_v2'}`,
    {
      p_usuario: usuario,
      p_ativo: ativo
    }
  )) as MembroEmpresa[]
}
let sequenciaControle = 0
let epocaControle = 0
const filaControle = new FilaControleEdicao()
export async function controlarEdicao(
  tipo: TipoDocumento,
  id: string,
  acao = 'obter',
  destino?: string
): Promise<ControleEdicao | null> {
  return (await estadoControleEdicao(tipo, id, acao, destino)).controle
}
export function estadoControleEdicao(
  tipo: TipoDocumento,
  id: string,
  acao = 'obter',
  destino?: string
): Promise<import('@shared/evolucao').EstadoControleEdicao> {
  const sessao = identidadeSessaoNuvem()
  const epoca = epocaControle
  const empresaId = statusNuvem().empresaId ?? ''
  const validar = (): void => {
    if (sessao !== identidadeSessaoNuvem() || epoca !== epocaControle)
      throw new Error('A sessão mudou. Abra o documento novamente.')
  }
  return filaControle.executar(
    JSON.stringify([sessao, epoca, empresaId, tipo, id]),
    acao === 'obter',
    async () => {
      validar()
      const controle = await executarControleEdicao(tipo, id, acao, destino, validar)
      validar()
      const estado = {
        empresaId,
        sessao,
        sequencia: ++sequenciaControle,
        tipo,
        documentoId: id,
        controle
      }
      avisarDados({ origem: 'nuvem', entidades: [], controleEdicao: estado })
      return estado
    }
  )
}
async function executarControleEdicao(
  tipo: TipoDocumento,
  id: string,
  acao = 'obter',
  destino: string | undefined,
  validar: () => void
): Promise<ControleEdicao | null> {
  exigirProtocolo()
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
      preservarConflitos([...new Set(filaAtiva().map((l) => texto(l.entidade)))])
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
  validar()
  const atual = get('SELECT * FROM edicoes_documento WHERE tipo=? AND documento_id=?', [tipo, id])
  const controle = (await pedidoNuvem(
    `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_edicao_v3' : 'gdo_edicao_v2'}`,
    {
      p_tipo: tipo,
      p_id: id,
      p_dispositivo: computadorId(),
      p_acao: acao,
      p_geracao: atual?.geracao ?? null,
      p_destino: destino ?? null
    }
  )) as ControleEdicao | null
  validar()
  const salvo = get('SELECT geracao FROM edicoes_documento WHERE tipo=? AND documento_id=?', [
    tipo,
    id
  ])
  if (salvo && Number(salvo.geracao) > (controle?.geracao ?? Number(atual?.geracao ?? 0)))
    throw new Error('O controle mudou durante a consulta. Atualize o documento.')
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
    temOperacaoAtiva(`${tipo}:${id}`)
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
  if (s.erro || temOperacaoAtiva(`${tipo}:${id}`))
    throw new Error(
      'Sincronize o documento antes de emitir online. Para emissão sem internet, prepare o documento offline enquanto conectado.'
    )
}
/**
 * Descarta os controles próprios de documentos que já não existem neste computador
 * (por exemplo, excluídos enquanto estavam sob acompanhamento). Sem isso, a renovação
 * os manteria vivos e cada um custaria requisições a cada ciclo; no servidor o prazo
 * expira sozinho.
 */
function descartarControlesDeDocumentosAusentes(uid: string | null | undefined): void {
  run(
    `DELETE FROM edicoes_documento
      WHERE usuario=? AND computador=?
        AND NOT (
          (tipo='orcamento' AND EXISTS (SELECT 1 FROM orcamentos WHERE id=edicoes_documento.documento_id))
          OR (tipo='relatorio' AND EXISTS (SELECT 1 FROM relatorios WHERE id=edicoes_documento.documento_id))
          OR (tipo='recibo' AND EXISTS (SELECT 1 FROM recibos WHERE id=edicoes_documento.documento_id))
        )`,
    [uid ?? null, computadorId()]
  )
}

export async function renovarEdicoes(): Promise<void> {
  if (protocoloNuvem() < 2) return
  const uid = statusNuvem().usuarioId
  descartarControlesDeDocumentosAusentes(uid)
  for (const controle of all(
    'SELECT tipo,documento_id,expira_em FROM edicoes_documento WHERE usuario=? AND computador=? AND offline=0',
    [uid, computadorId()]
  )) {
    if (!controle.expira_em || Date.parse(texto(controle.expira_em)) <= Date.now()) continue
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
