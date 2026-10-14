import { safeStorage } from 'electron'
import { hostname } from 'os'
import { all, get, run, texto, tx, db, type Linha } from './db/sqlite'
import {
  computadorId,
  enfileirar,
  pacoteDocumento,
  exigirResponsavel,
  semRastreamento,
  tabelasFilhos
} from './versoes'
import type { ConfigNuvem, StatusNuvem, TipoDocumento } from '@shared/types'
import { exportarDadosPara } from './dados'
import { join } from 'path'
import { pastaDados } from './db/sqlite'
import { avisarDados } from './eventos'
import {
  iniciarTempoReal,
  pararTempoReal,
  avisarEstadoTempoReal,
  aguardarTempoReal
} from './tempo-real'
import { randomUUID } from 'crypto'
import { tabelaNumerosUsados, confirmarNumero } from './numeros'
import {
  analisarPendenciasAnteriores,
  conteudoEquivalente,
  preservarPendenciasAnteriores,
  retirarPendenciasAnteriores,
  filaAnterior,
  suspenderPendenciasAnteriores
} from './pendencias-anteriores'
import type { AtualizacaoNumeracaoPendente } from '@shared/evolucao'
import { mensagemErro } from '@shared/erros'
import {
  adaptarExclusaoCadastroLegada,
  criarPayloadCadastroSalvo
} from '@shared/cadastros-sincronizacao'
import { registrarCodigoRemoto } from './codigos-cadastros'
import { filaParaEnvio, marcarGrupo, temOperacaoAtiva, tentarNovamenteOperacao } from './fila-nuvem'

let ocupado = false
let sincronizacaoAtual: Promise<StatusNuvem> | null = null
let repetirSincronizacao = false
let repetirCompleta = false
let conectando = false
type ContextoNuvem = {
  protocolo: number
  empresaId: string
  usuarioId: string
  usuarioNome: string
  papel?: 'administrador' | 'membro'
}
let observarContexto: ((contexto: ContextoNuvem | null) => void) | null = null
export function observarAcessoNuvem(observador: (contexto: ContextoNuvem | null) => void): void {
  observarContexto = observador
}
let estadoTempoReal: NonNullable<StatusNuvem['tempoReal']> = 'desconectado'
let erroTempoReal: string | null = null
export function protocoloNuvem(): number {
  return config<ContextoNuvem>('contextoNuvem')?.protocolo ?? 1
}
const tipos: TipoDocumento[] = ['orcamento', 'relatorio', 'recibo']
const tabelas = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'configuracoes',
  'imagens'
]
const permitido = new Set([
  ...tabelas,
  'orcamentos',
  'relatorios',
  'recibos',
  'recebimentos',
  'documento_meta',
  'versoes',
  ...Object.values(tabelasFilhos).flat()
])
function config<T>(chave: string): T | null {
  const l = get('SELECT valor FROM configuracoes WHERE chave=?', [chave])
  return l ? JSON.parse(texto(l.valor)) : null
}
function salvar(chave: string, valor: unknown): void {
  run(
    'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
    [chave, JSON.stringify(valor)]
  )
}
export function configuracaoNuvem(): ConfigNuvem {
  return config<ConfigNuvem>('nuvem') ?? { url: '', chavePublica: '', email: '' }
}
type Sessao = {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string }
}
let sessaoVolatil: Sessao | null = null
let lembrarSessao = true
let empresaSelecionada: string | null = null
let central = false
export function configurarSessaoConta(
  lembrar: boolean,
  empresa: string | null,
  usarCentral: boolean
): void {
  lembrarSessao = lembrar
  empresaSelecionada = empresa
  central = usarCentral
}
function sessao(): Sessao | null {
  if (sessaoVolatil) return sessaoVolatil
  const s = config<string>('sessaoNuvem')
  return s ? JSON.parse(safeStorage.decryptString(Buffer.from(s, 'base64'))) : null
}
function gravarSessao(s: Sessao): void {
  sessaoVolatil = lembrarSessao ? null : s
  if (!lembrarSessao) {
    run("DELETE FROM configuracoes WHERE chave='sessaoNuvem'")
    return
  }
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('A proteção de credenciais do Windows está indisponível.')
  salvar('sessaoNuvem', safeStorage.encryptString(JSON.stringify(s)).toString('base64'))
}
let renovacaoSessao: { chave: string; pedido: Promise<Sessao> } | null = null
export async function pedidoNuvem(
  path: string,
  body?: unknown,
  login = false,
  metodo?: 'PUT'
): Promise<unknown> {
  const c = configuracaoNuvem()
  let token = c.chavePublica
  if (!login) {
    let s = sessao()
    if (!s) throw new Error('Entre na conta da empresa para sincronizar.')
    if (s.expires_at * 1000 < Date.now() + 60000) {
      const chave = `${c.url}:${s.refresh_token}`
      if (!renovacaoSessao || renovacaoSessao.chave !== chave) {
        const tokenAnterior = s.refresh_token
        const pedidoRenovacao = pedidoNuvem(
          '/auth/v1/token?grant_type=refresh_token',
          { refresh_token: tokenAnterior },
          true
        ).then((dados) => {
          const atualizada = dados as Sessao
          if (sessao()?.refresh_token !== tokenAnterior)
            throw new Error('A conta conectada mudou durante a renovação. Tente novamente.')
          gravarSessao(atualizada)
          return atualizada
        })
        const entrada = { chave, pedido: pedidoRenovacao }
        renovacaoSessao = entrada
        void pedidoRenovacao
          .finally(() => {
            if (renovacaoSessao === entrada) renovacaoSessao = null
          })
          .catch(() => undefined)
      }
      s = await renovacaoSessao.pedido
    }
    token = s.access_token
  }
  const resposta = await fetch(c.url + path, {
    method: metodo ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      apikey: c.chavePublica,
      ...(!login ? { Authorization: `Bearer ${token}` } : {}),
      ...(central && empresaSelecionada ? { 'x-gdo-empresa': empresaSelecionada } : {}),
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const erro = new Error(
      dados?.msg ?? dados?.message ?? `Falha na nuvem (${resposta.status}).`
    ) as Error & { codigo?: string; status?: number }
    erro.codigo = dados?.code
    erro.status = resposta.status
    throw erro
  }
  return dados
}
const pedido = pedidoNuvem
async function reconhecerEmpresa(criar = false): Promise<ContextoNuvem> {
  let contexto: ContextoNuvem
  try {
    contexto = central
      ? ((await pedido('/rest/v1/rpc/gdo_contexto_v4', {
          p_empresa: empresaSelecionada
        })) as ContextoNuvem)
      : ((await pedido('/rest/v1/rpc/gdo_contexto_v3', { p_criar: criar }).catch(async (e) => {
          if ((e as { codigo?: string }).codigo !== 'PGRST202') throw e
          return pedido('/rest/v1/rpc/gdo_contexto_v2', { p_criar: criar })
        })) as ContextoNuvem)
  } catch (e) {
    if (central) {
      const falha = e as { status?: number; message?: string }
      if (
        falha.status === 401 ||
        falha.status === 403 ||
        /Você não tem acesso a esta empresa/.test(falha.message ?? '')
      )
        observarContexto?.(null)
      throw e
    }
    // Compatibilidade de transição com a nuvem 1.4: mantém suas regras antigas.
    // Após migrar, o servidor revoga as rotas de escrita antigas.
    if ((e as { codigo?: string }).codigo !== 'PGRST202') throw e
    const s = sessao()
    if (!s) throw e
    contexto = {
      protocolo: 1,
      empresaId: s.user.id,
      usuarioId: s.user.id,
      usuarioNome: configuracaoNuvem().email
    }
  }
  const anterior = config<string>('empresaNuvem') ?? config<string>('usuarioNuvem')
  if (anterior && anterior !== contexto.empresaId)
    throw new Error('Este perfil contém dados de outra empresa. Use um perfil separado.')
  const anteriorContexto = config<ContextoNuvem>('contextoNuvem')
  if (contexto.protocolo >= 3 && (anteriorContexto?.protocolo ?? 1) < 3) {
    if (anterior && (filaAnterior().length || get('SELECT 1 FROM conflitos_nuvem LIMIT 1'))) {
      const remotos = await baixarAlteracoes(0, 3)
      let revisao = analisarPendenciasAnteriores(remotos)
      if (revisao.equivalentes) {
        const backup = preservarPendenciasAnteriores(contexto.empresaId, contexto.usuarioId)
        retirarPendenciasAnteriores(
          revisao.revisao,
          revisao.registros.filter((r) => r.situacao === 'equivalente').map((r) => r.id)
        )
        salvar('backupAtualizacaoNumeracao', backup)
        revisao = analisarPendenciasAnteriores(remotos)
      }
      if (revisao.total) {
        salvar('atualizacaoNumeracaoPendente', revisao)
        const erro = new Error(
          'Existem alterações locais anteriores à atualização. Confira os registros abaixo e use “Preservar pendências e atualizar base” para guardar uma cópia e baixar os dados atuais da empresa.'
        ) as Error & { codigo: string }
        erro.codigo = 'MIGRACAO_PENDENTE'
        throw erro
      }
    }
    exportarDadosPara(join(pastaDados(), `antes-numeracao-v3-${Date.now()}.gdo-backup`))
    tx(() => {
      run('UPDATE reservas SET usado=1')
      run('UPDATE sincronizacao SET revisao=0')
      salvar('cursorNuvem', 0)
      salvar('renumeracaoPendente', true)
      salvar('numeracaoSequencial', true)
      for (const chave of ['seqOrcamento', 'seqRelatorio', 'seqRecibo']) salvar(chave, 0)
    })
  }
  salvar('contextoNuvem', contexto)
  if (central) observarContexto?.(contexto)
  salvar('empresaNuvem', contexto.empresaId)
  salvar('atualizacaoNumeracaoPendente', null)
  return contexto
}
export function ativarTempoReal(): void {
  iniciarTempoReal({
    configuracao: configuracaoNuvem,
    identidade: () => {
      if (protocoloNuvem() < 2) return null
      const contexto = config<ContextoNuvem>('contextoNuvem'),
        s = sessao()
      return contexto && s ? { empresa: contexto.empresaId, token: s.access_token } : null
    },
    sincronizar: () => sincronizarNuvem(false),
    sincronizarCompleta: sincronizarNuvem,
    renovar: async () => {
      if (!sessao()) return
      await reconhecerEmpresa()
      const { renovarEdicoes } = await import('./colaboracao')
      await renovarEdicoes()
    },
    estado: (estado, erro) => {
      if (estadoTempoReal === estado && erroTempoReal === erro) return
      estadoTempoReal = estado
      erroTempoReal = erro
      avisarEstadoTempoReal()
    }
  })
}
export async function inicializarNuvem(): Promise<void> {
  if (!sessao()) return
  try {
    await reconhecerEmpresa()
    if (protocoloNuvem() >= 2) {
      await pedido(
        `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_dispositivo_v3' : 'gdo_dispositivo_v2'}`,
        {
          p_dispositivo: computadorId(),
          p_nome: hostname()
        }
      )
      ativarTempoReal()
    } else await sincronizarNuvem()
  } catch (e) {
    salvar('erroNuvem', mensagemErro(e))
    avisarDados({ origem: 'nuvem', entidades: [], status: true })
  }
}
export function statusNuvem(): StatusNuvem {
  const reservas = Object.fromEntries(
    tipos.map((t) => [
      t,
      Number(get('SELECT COUNT(*) AS n FROM reservas WHERE tipo=? AND usado=0', [t])?.n ?? 0)
    ])
  ) as Record<TipoDocumento, number>
  return {
    configurada: !!config<ConfigNuvem>('nuvem'),
    autenticada: !!sessaoVolatil || !!config<string>('sessaoNuvem'),
    computador: computadorId(),
    pendentes: filaAnterior().length,
    pendenciasPreservadas: Number(
      get("SELECT COUNT(*) AS n FROM fila_nuvem WHERE estado='preservada'")?.n ?? 0
    ),
    falhas: all(
      "SELECT id,entidade,erro FROM fila_nuvem WHERE estado='falha' GROUP BY grupo ORDER BY rowid"
    ).map((l) => ({ id: texto(l.id), entidade: texto(l.entidade), detalhe: texto(l.erro) })),
    conflitos: all('SELECT id,entidade,detalhe FROM conflitos_nuvem').map((l) => ({
      id: texto(l.id),
      entidade: texto(l.entidade),
      detalhe: texto(l.detalhe)
    })),
    ultimaSincronizacao: config<string>('ultimaNuvem'),
    erro: config<string>('erroNuvem'),
    bytesBanco:
      config<number>('bytesNuvem') ??
      Number(get('PRAGMA page_count')?.page_count ?? 0) *
        Number(get('PRAGMA page_size')?.page_size ?? 0),
    reservas,
    empresaId: config<ContextoNuvem>('contextoNuvem')?.empresaId,
    usuarioId: config<ContextoNuvem>('contextoNuvem')?.usuarioId,
    protocolo: protocoloNuvem(),
    atualizandoNumeracao: config<boolean>('renumeracaoPendente') ?? false,
    atualizacaoPendente: config<AtualizacaoNumeracaoPendente>('atualizacaoNumeracaoPendente'),
    backupAtualizacao: config<string>('backupAtualizacaoNumeracao'),
    tempoReal: estadoTempoReal,
    erroTempoReal
  }
}
export async function conectarNuvem(
  c: ConfigNuvem,
  senha: string,
  modo: 'publicar' | 'baixar'
): Promise<StatusNuvem> {
  if (ocupado || conectando) throw new Error('Aguarde a sincronização atual.')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(c.url))
    throw new Error('Use a URL HTTPS do projeto Supabase.')
  if (!c.chavePublica.startsWith('sb_publishable_')) {
    let papel = ''
    try {
      papel = JSON.parse(Buffer.from(c.chavePublica.split('.')[1], 'base64url').toString()).role
    } catch {
      /* chave inválida */
    }
    if (papel !== 'anon')
      throw new Error(
        'Use somente a chave pública publishable/anon. Nunca use service_role ou chave secreta.'
      )
  }
  if (config<ConfigNuvem>('nuvem') && configuracaoNuvem().url !== c.url.replace(/\/$/, ''))
    throw new Error(
      'Use um perfil separado para conectar outra empresa. Este perfil já está vinculado a um projeto.'
    )
  const anterior = config<ConfigNuvem>('nuvem')
  const configuracoesAnteriores = new Map(
    [
      'nuvem',
      'sessaoNuvem',
      'contextoNuvem',
      'usuarioNuvem',
      'empresaNuvem',
      'computadorId',
      'cursorNuvem'
    ].map((chave) => [
      chave,
      get('SELECT valor FROM configuracoes WHERE chave=?', [chave])?.valor ?? null
    ])
  )
  const sessaoAnterior = config<string>('sessaoNuvem')
  const contextoAnterior = config<ContextoNuvem>('contextoNuvem')
  conectando = true
  salvar('nuvem', { ...c, url: c.url.replace(/\/$/, '') })
  try {
    const s = (await pedido(
      '/auth/v1/token?grant_type=password',
      { email: c.email, password: senha },
      true
    )) as Sessao
    const dono = config<string>('usuarioNuvem')
    gravarSessao(s)
    const contexto = await reconhecerEmpresa(!anterior && modo === 'publicar')
    if (dono && dono !== s.user.id && filaAnterior().length)
      throw new Error(
        'Conclua a sincronização ou preserve as alterações em rascunhos antes de trocar de usuário.'
      )
    if (dono && dono !== s.user.id && contexto.protocolo < 2)
      throw new Error('Atualize a configuração do banco para usar logins individuais da empresa.')
    if (contexto.protocolo >= 2) {
      if (dono && dono !== s.user.id) run('DELETE FROM reservas')
      const chave = `computadorUsuario:${s.user.id}`
      if (dono && dono !== s.user.id && !config<string>(chave)) salvar(chave, randomUUID())
      if (!config<string>(chave)) salvar(chave, computadorId())
      salvar('computadorId', config<string>(chave))
      salvar('cursorNuvem', 0)
    }
    salvar('usuarioNuvem', s.user.id)
    await pedido(
      `/rest/v1/rpc/${contexto.protocolo >= 3 ? 'gdo_dispositivo_v3' : contexto.protocolo >= 2 ? 'gdo_dispositivo_v2' : 'gdo_device'}`,
      {
        p_dispositivo: computadorId(),
        p_nome: hostname()
      }
    )
    if (!anterior) {
      const existentes = (await (contexto.protocolo >= 3
        ? pedido('/rest/v1/rpc/gdo_alteracoes_v3', { p_cursor: 0, p_limite: 1 })
        : pedido('/rest/v1/gdo_entities?select=entidade&limit=1'))) as unknown[]
      if (modo === 'publicar' && existentes.length)
        throw new Error('A nuvem já contém dados. Use baixar a base para conectar este computador.')
      exportarDadosPara(join(pastaDados(), `antes-nuvem-${Date.now()}.gdo-backup`))
      if (modo === 'publicar') {
        if (contexto.protocolo < 3)
          await pedido(
            `/rest/v1/rpc/${contexto.protocolo >= 2 ? 'gdo_bootstrap_v2' : 'gdo_bootstrap_numbers'}`,
            {
              p_dispositivo: computadorId(),
              p_numeros: all(`SELECT tipo,numero FROM ${tabelaNumerosUsados()} WHERE numero>0`)
            }
          )
        tx(() => {
          for (const t of tabelas)
            for (const l of all(`SELECT * FROM ${t}`)) {
              if (
                t === 'configuracoes' &&
                !['empresa', 'parametros', 'camposClientePadrao'].includes(texto(l.chave))
              )
                continue
              const id = texto(l.id ?? l.hash ?? l.chave)
              enfileirar(`${t}:${id}`, { tabela: t, id, row: l })
              salvar(`estado:${t}:${id}`, JSON.stringify({ tabela: t, id, row: l }))
            }
          for (const tipo of tipos)
            for (const l of all(
              `SELECT id FROM ${{ orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[tipo]}
               UNION SELECT documento_id AS id FROM documento_meta WHERE tipo=?
               UNION SELECT documento_id AS id FROM versoes WHERE tipo=?`,
              [tipo, tipo]
            )) {
              const meta = get('SELECT dados FROM documento_meta WHERE tipo=? AND documento_id=?', [
                tipo,
                l.id
              ])
              if (meta) {
                const dados = JSON.parse(texto(meta.dados))
                dados.computadorResponsavel = computadorId()
                run('UPDATE documento_meta SET dados=? WHERE tipo=? AND documento_id=?', [
                  JSON.stringify(dados),
                  tipo,
                  l.id
                ])
              }
              enfileirar(`${tipo}:${texto(l.id)}`, pacoteDocumento(tipo, texto(l.id)))
            }
        })
      } else {
        if (!existentes.length)
          throw new Error(
            'A nuvem está vazia. Publique primeiro pelo computador que contém os dados.'
          )
        const base = await baixarAlteracoes(0)
        if (!base.some((e) => e.entidade === 'configuracoes:empresa' && e.payload.row))
          throw new Error(
            'A nuvem não contém uma base completa. Conclua a publicação no primeiro computador.'
          )
        semRastreamento(() =>
          tx(() => {
            for (const t of [
              'recebimentos',
              'recibos',
              'anexos',
              'relatorio_anexos',
              'itens_servico',
              'materiais',
              'orcamento_textos',
              'relatorio_itens_servico',
              'relatorio_lancamentos',
              'relatorio_textos',
              'orcamentos',
              'relatorios',
              'clientes',
              'servicos',
              'observacoes_padrao',
              'pagamentos_padrao',
              'versoes',
              'documento_meta',
              'imagens',
              'reservas',
              `${tabelaNumerosUsados()}`,
              'fila_nuvem',
              'sincronizacao',
              'conflitos_nuvem',
              'autoria_documentos',
              'edicoes_documento',
              'rascunhos_compartilhados',
              'auditoria_colaboracao'
            ])
              run(`DELETE FROM ${t}`)
            for (const e of ordenarDependencias(base)) aplicar(e)
            salvar('cursorNuvem', Math.max(0, ...base.map((e) => e.sequencia)))
          })
        )
      }
    }
    conectando = false
    const status = await sincronizarNuvem()
    if (protocoloNuvem() >= 2) ativarTempoReal()
    return status
  } catch (e) {
    if ((e as { codigo?: string }).codigo === 'MIGRACAO_PENDENTE') {
      const usuario = sessao()!.user.id
      const dono = config<string>('usuarioNuvem')
      const chave = `computadorUsuario:${usuario}`
      if (!config<string>(chave))
        salvar(chave, dono && dono !== usuario ? randomUUID() : computadorId())
      salvar('computadorId', config<string>(chave))
      salvar('usuarioNuvem', usuario)
      salvar('erroNuvem', (e as Error).message)
      avisarDados({ origem: 'nuvem', entidades: [], status: true })
      return statusNuvem()
    }
    // Depois da adoção local, preserve o protocolo e retome a recuperação na
    // próxima tentativa. Restaurar apenas o contexto deixaria flags inconsistentes.
    if ((contextoAnterior?.protocolo ?? 1) < 3 && protocoloNuvem() >= 3) {
      salvar('erroNuvem', mensagemErro(e))
      avisarDados({ origem: 'nuvem', entidades: [], status: true })
      return statusNuvem()
    }
    if (anterior) {
      for (const [chave, valor] of configuracoesAnteriores) {
        if (valor == null) run('DELETE FROM configuracoes WHERE chave=?', [chave])
        else
          run(
            'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
            [chave, valor]
          )
      }
    }
    if (sessaoAnterior) salvar('sessaoNuvem', sessaoAnterior)
    else run("DELETE FROM configuracoes WHERE chave='sessaoNuvem'")
    if (contextoAnterior) salvar('contextoNuvem', contextoAnterior)
    if (!anterior && !get('SELECT 1 FROM fila_nuvem LIMIT 1') && !config<number>('cursorNuvem')) {
      run("DELETE FROM configuracoes WHERE chave IN ('nuvem','sessaoNuvem','usuarioNuvem')")
    }
    throw e
  } finally {
    conectando = false
  }
}
function upsert(t: string, row: Record<string, unknown>): void {
  if (!permitido.has(t)) throw new Error('Tabela remota desconhecida.')
  const cols = new Set(all(`PRAGMA table_info(${t})`).map((l) => texto(l.name)))
  const chaves = Object.keys(row)
  if (!chaves.length || chaves.some((k) => !cols.has(k)))
    throw new Error('Estrutura remota incompatível. Atualize o aplicativo.')
  const pk = new Set(
    all(`PRAGMA table_info(${t})`)
      .filter((l) => Number(l.pk) > 0)
      .map((l) => texto(l.name))
  )
  const atualizaveis = chaves.filter((k) => !pk.has(k))
  run(
    `INSERT INTO ${t} (${chaves.join(',')}) VALUES (${chaves.map(() => '?').join(',')}) ON CONFLICT DO UPDATE SET ${atualizaveis.map((k) => `${k}=excluded.${k}`).join(',')}`,
    chaves.map((k) => row[k])
  )
  if (tabelas.includes(t)) {
    const id = texto(row.id ?? row.hash ?? row.chave)
    salvar(`estado:${t}:${id}`, JSON.stringify({ tabela: t, id, row }))
  }
}
export type Remoto = {
  emissao?: { tipo: TipoDocumento; documento_id: string; numero: number; criado_em: string } | null
  controle?: {
    tipo: TipoDocumento
    documento_id: string
    usuario_id: string
    dispositivo: string
    geracao: number
    expira_em: string | null
    offline: boolean
    revisao: number
  } | null
  autoria?: {
    tipo: TipoDocumento
    documento_id: string
    usuario_criador: string | null
    alterado_por: string | null
  } | null
  identificador?: {
    tipo: TipoDocumento
    documento_id: string
    id_interno: number
    usuario_criador: string | null
    alterado_por: string | null
  } | null
  entidade: string
  revisao: number
  sequencia: number
  payload: {
    tabela?: string
    id: string
    row?: Record<string, unknown>
    rows?: Record<string, Array<Record<string, unknown>>>
    tipo?: TipoDocumento
    excluido?: boolean
  }
}
async function baixarAlteracoes(inicio: number, protocolo = protocoloNuvem()): Promise<Remoto[]> {
  let cursor = inicio
  const todas: Remoto[] = []
  while (true) {
    const dados = (
      protocolo >= 2
        ? await pedido(
            `/rest/v1/rpc/${protocolo >= 3 ? 'gdo_alteracoes_v3' : 'gdo_alteracoes_v2'}`,
            { p_cursor: cursor, p_limite: 50 }
          )
        : await pedido(
            `/rest/v1/gdo_entities?select=*&sequencia=gt.${cursor}&order=sequencia.asc&limit=50`
          )
    ) as Remoto[]
    if (!dados.length) return todas
    todas.push(...dados)
    cursor = Math.max(cursor, ...dados.map((e) => e.sequencia))
  }
}
function ordenarDependencias(dados: Remoto[]): Remoto[] {
  const ordem = (e: Remoto): number =>
    e.payload.tabela
      ? 0
      : e.payload.tipo === 'orcamento'
        ? 1
        : e.payload.tipo === 'relatorio'
          ? 2
          : 3
  return dados.sort((a, b) => ordem(a) - ordem(b) || a.sequencia - b.sequencia)
}
function aplicar(e: Remoto): void {
  aplicarIdentificador(e)
  const p = e.payload
  if (p.tabela) {
    if (!tabelas.includes(p.tabela)) throw new Error('Entidade remota inválida.')
    if (
      p.tabela === 'configuracoes' &&
      !['empresa', 'parametros', 'camposClientePadrao'].includes(p.id)
    )
      throw new Error('Configuração não compartilhável.')
    if (p.row) {
      upsert(p.tabela, p.row)
      if (p.tabela === 'clientes') {
        const dados = JSON.parse(texto(p.row.dados_json) || '{}') as { codigo?: number }
        registrarCodigoRemoto('cliente', dados.codigo, p.id)
      } else if (p.tabela === 'servicos') registrarCodigoRemoto('servico', p.row.codigo, p.id)
    } else
      run(
        `DELETE FROM ${p.tabela} WHERE ${{ configuracoes: 'chave', imagens: 'hash' }[p.tabela] ?? 'id'}=?`,
        [p.id]
      )
  } else if (p.tipo && tipos.includes(p.tipo) && p.rows) {
    const t = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[p.tipo]
    // UPSERT evita REPLACE no pai, que dispararia cascata antes de repor os filhos.
    for (const filho of tabelasFilhos[p.tipo])
      run(`DELETE FROM ${filho} WHERE ${p.tipo}_id=?`, [p.id])
    if (p.excluido) run(`DELETE FROM ${t} WHERE id=?`, [p.id])
    else {
      const pai = p.rows[t]?.[0]
      if (!pai || pai.id !== p.id) throw new Error('Documento remoto inválido.')
      if (
        p.tipo === 'relatorio' &&
        pai.origem_orcamento_id &&
        !get('SELECT 1 FROM orcamentos WHERE id=?', [pai.origem_orcamento_id])
      )
        pai.origem_orcamento_id = null
      const cols = Object.keys(pai)
      const permitidas = new Set(all(`PRAGMA table_info(${t})`).map((l) => texto(l.name)))
      if (cols.some((c) => !permitidas.has(c))) throw new Error('Versão remota incompatível.')
      run(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols
          .filter((c) => c !== 'id')
          .map((c) => `${c}=excluded.${c}`)
          .join(',')}`,
        cols.map((c) => pai[c])
      )
      for (const filho of tabelasFilhos[p.tipo])
        for (const row of p.rows[filho] ?? []) upsert(filho, row)
      if (Number(pai.numero) > 0) {
        run(`INSERT OR IGNORE INTO ${tabelaNumerosUsados()} VALUES (?,?)`, [p.tipo, pai.numero])
        if (protocoloNuvem() >= 3) {
          const chave = {
            orcamento: 'seqOrcamento',
            relatorio: 'seqRelatorio',
            recibo: 'seqRecibo'
          }[p.tipo]
          salvar(chave, Math.max(config<number>(chave) ?? 0, Number(pai.numero)))
        }
      }
    }
    for (const nome of [
      'documento_meta',
      'versoes',
      ...(p.tipo === 'recibo' ? ['recebimentos'] : [])
    ])
      for (const row of p.rows[nome] ?? []) {
        upsert(nome, row)
        if (nome === 'versoes') {
          // Uma exclusão pode chegar antes de o outro PC ter recebido o documento.
          const numero = Number(JSON.parse(String(row.documento)).numero)
          if (protocoloNuvem() < 3 && Number.isSafeInteger(numero) && numero > 0)
            run(`INSERT OR IGNORE INTO ${tabelaNumerosUsados()} VALUES (?,?)`, [p.tipo, numero])
        }
      }
  } else throw new Error('Pacote remoto inválido.')
  run(
    'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
    [e.entidade, e.revisao]
  )
}
export async function consultarDocumentoRemoto(
  tipo: TipoDocumento,
  id: string
): Promise<Remoto | null> {
  if (protocoloNuvem() < 2)
    throw new Error('A conciliação compartilhada exige o protocolo 2 da nuvem.')
  return (await pedido(
    `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_documento_v3' : 'gdo_documento_v2'}`,
    {
      p_tipo: tipo,
      p_id: id
    }
  )) as Remoto | null
}
export function adotarDocumentoRemoto(e: Remoto): void {
  if (!e.payload.tipo) throw new Error('Documento remoto inválido.')
  if (temOperacaoAtiva(e.entidade))
    throw new Error('Preserve e resolva as operações pendentes antes de adotar a versão remota.')
  semRastreamento(() =>
    tx(() => {
      run('DELETE FROM versoes WHERE tipo=? AND documento_id=?', [e.payload.tipo, e.payload.id])
      aplicar(e)
    })
  )
  avisarDados({ origem: 'nuvem', entidades: [e.entidade], status: true })
}
export function sincronizarNuvem(completa = true): Promise<StatusNuvem> {
  if (sincronizacaoAtual) {
    repetirSincronizacao = true
    repetirCompleta ||= completa
    return sincronizacaoAtual
  }
  sincronizacaoAtual = (async () => {
    let resultado: StatusNuvem
    do {
      repetirSincronizacao = false
      resultado = await executarSincronizacao(completa)
      completa = repetirCompleta
      repetirCompleta = false
    } while (repetirSincronizacao)
    return resultado
  })().finally(() => {
    sincronizacaoAtual = null
  })
  return sincronizacaoAtual
}
export async function finalizarAtualizacaoNumeracao(revisao: string): Promise<StatusNuvem> {
  if (ocupado || conectando || sincronizacaoAtual)
    throw new Error('Aguarde a conferência atual para atualizar a base.')
  const pendente = config<AtualizacaoNumeracaoPendente>('atualizacaoNumeracaoPendente')
  if (!pendente || pendente.revisao !== revisao)
    throw new Error(
      'A conferência das pendências mudou. Conecte novamente e revise os registros atuais.'
    )
  ocupado = true
  try {
    const contexto = (await pedido('/rest/v1/rpc/gdo_contexto_v3', {
      p_criar: false
    })) as ContextoNuvem
    const empresa = config<string>('empresaNuvem') ?? config<string>('usuarioNuvem')
    if (!empresa || contexto.empresaId !== empresa)
      throw new Error('Esta conta pertence a outra empresa. A base local foi preservada.')
    const remotos = await baixarAlteracoes(0, 3)
    if (!remotos.some((e) => e.entidade === 'configuracoes:empresa' && e.payload.row))
      throw new Error(
        'A nuvem não contém uma base completa. A base local e suas pendências foram preservadas.'
      )
    const atual = analisarPendenciasAnteriores(remotos)
    if (atual.revisao !== revisao) {
      salvar('atualizacaoNumeracaoPendente', atual)
      throw new Error(
        'As pendências mudaram durante a conferência. Confira a lista novamente antes de atualizar.'
      )
    }
    const backup = preservarPendenciasAnteriores(contexto.empresaId, contexto.usuarioId)
    suspenderPendenciasAnteriores(revisao)
    salvar('backupAtualizacaoNumeracao', backup)
    await reconhecerEmpresa()
    await pedido('/rest/v1/rpc/gdo_dispositivo_v3', {
      p_dispositivo: computadorId(),
      p_nome: hostname()
    })
  } finally {
    ocupado = false
    avisarDados({ origem: 'nuvem', entidades: [], status: true })
  }
  const status = await sincronizarNuvem()
  if (!status.erro) ativarTempoReal()
  return status
}
async function executarSincronizacao(completa: boolean): Promise<StatusNuvem> {
  if (ocupado || conectando) return statusNuvem()
  ocupado = true
  let erroEnvio: string | null = null
  try {
    if (!completa && config<AtualizacaoNumeracaoPendente>('atualizacaoNumeracaoPendente'))
      throw new Error(
        'Conclua a atualização da base em Nuvem / Sincronização antes de enviar alterações.'
      )
    // As próprias RPCs e o RLS validam o membro em cada acesso. A sessão/contexto
    // também são renovados a cada 30s; não acrescenta uma viagem HTTP a cada aviso.
    if (completa && protocoloNuvem() >= 2) await reconhecerEmpresa()
    if (protocoloNuvem() < 2 && get('SELECT 1 FROM conflitos_nuvem LIMIT 1'))
      throw new Error('Resolva os conflitos antes de sincronizar novas alterações.')
    const pendencias = filaParaEnvio()
    const grupos =
      protocoloNuvem() < 2
        ? [pendencias]
        : [...new Set(pendencias.map((l) => texto(l.grupo)))].map((grupo) =>
            pendencias.filter((l) => texto(l.grupo) === grupo)
          )
    const bloqueadas = new Set(
      [
        ...all('SELECT entidade FROM conflitos_nuvem'),
        ...all("SELECT entidade FROM fila_nuvem WHERE estado IN ('falha','conflito')")
      ].map((l) => texto(l.entidade))
    )
    for (const fila of grupos) {
      if (
        !fila.length ||
        (protocoloNuvem() >= 2 && fila.some((l) => bloqueadas.has(texto(l.entidade))))
      )
        continue
      let result: {
        ok: boolean
        numeros?: Array<{ tipo: TipoDocumento; documentoId: string; numero: number }>
        resultados?: Array<{ entidade: string; revisao: number }>
        entidade?: string
        remoto?: Remoto
      }
      try {
        result = (await pedido(
          `/rest/v1/rpc/${protocoloNuvem() >= 2 ? (protocoloNuvem() >= 3 ? 'gdo_batch_v3' : 'gdo_batch_v2') : 'gdo_batch'}`,
          {
            p_operacoes: fila.map((l) => ({
              id: l.id,
              entidade: l.entidade,
              base: l.base,
              payload: adaptarExclusaoCadastroLegada(
                JSON.parse(
                  texto(
                    get('SELECT payload FROM fila_nuvem WHERE id=?', [l.id])?.payload ?? l.payload
                  )
                )
              ),
              geracao: l.geracao
            })),
            p_dispositivo: computadorId()
          }
        ).catch((e: unknown) => {
          if (
            protocoloNuvem() < 2 ||
            !/Autorização.*(expirada|revogada)|Documento em edição|financeiro reservado|origem reservado/.test(
              String(e)
            )
          )
            throw e
          const op =
            fila.find((l) =>
              ['orcamento', 'relatorio', 'recibo'].includes(texto(l.entidade).split(':')[0])
            ) ?? fila[0]
          run('INSERT OR REPLACE INTO conflitos_nuvem VALUES (?,?,?,?)', [
            op.id,
            op.entidade,
            mensagemErro(e),
            'null'
          ])
          return { ok: false, entidade: op.entidade, remoto: null }
        })) as typeof result
      } catch (e) {
        const erro = e as { status?: number; codigo?: string; name?: string }
        const temporaria =
          erro.status === 401 ||
          erro.status === 408 ||
          erro.status === 429 ||
          (erro.status ?? 0) >= 500 ||
          /TimeoutError|AbortError/.test(erro.name ?? '') ||
          /fetch failed|Failed to fetch|network|ENETUNREACH|ECONNRESET|ETIMEDOUT/i.test(String(e))
        // Uma falha de transporte pode ocultar uma confirmação. Mantém a identidade
        // da operação para reenvio idempotente; nunca cria uma operação substituta.
        if (temporaria) {
          erroEnvio = mensagemErro(e)
          break
        }
        const detalhe = mensagemErro(e, descricaoOperacao(fila[0]))
        marcarGrupo(fila, 'falha', detalhe)
        for (const l of fila) bloqueadas.add(texto(l.entidade))
        continue
      }
      if (!result.ok) {
        const op = fila.find((l) => l.entidade === result.entidade) ?? fila[0]
        run('INSERT OR REPLACE INTO conflitos_nuvem VALUES (?,?,?,?)', [
          op.id,
          op.entidade,
          result.remoto == null
            ? texto(get('SELECT detalhe FROM conflitos_nuvem WHERE id=?', [op.id])?.detalhe) ||
              'A autorização de edição mudou. Suas alterações locais foram preservadas para conferência.'
            : 'A base remota mudou. Suas alterações locais foram preservadas.',
          JSON.stringify(result.remoto)
        ])
        marcarGrupo(fila, 'conflito')
        if (protocoloNuvem() < 2)
          throw new Error('Conflito de sincronização. Compare as versões e escolha como continuar.')
        for (const l of fila) bloqueadas.add(texto(l.entidade))
        const { preservarConflitos } = await import('./rascunhos')
        preservarConflitos(fila.map((l) => texto(l.entidade)))
        continue
      }
      tx(() => {
        for (const r of result.resultados ?? [])
          run(
            'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
            [r.entidade, r.revisao]
          )
        for (const l of fila) run('DELETE FROM fila_nuvem WHERE id=?', [l.id])
        for (const n of result.numeros ?? []) confirmarNumero(n.tipo, n.documentoId, n.numero)
      })
    }
    let cursor = config<number>('cursorNuvem') ?? 0
    const auxiliares =
      protocoloNuvem() >= 2
        ? Promise.all([
            pedido('/rest/v1/edicoes_documento?select=*'),
            pedido('/rest/v1/pedidos_edicao?select=*'),
            pedido(
              `/rest/v1/rpc/${protocoloNuvem() >= 3 ? 'gdo_membros_v3' : 'gdo_membros_v2'}`,
              {}
            ),
            ...(protocoloNuvem() >= 3
              ? [pedido('/rest/v1/mapa_numeracao?select=tipo,documento_id,anterior,novo')]
              : [])
          ]).then(
            (dados) => ({ dados, erro: null }),
            (erro) => ({ dados: null, erro })
          )
        : null
    const alteracoes = await baixarAlteracoes(cursor)
    cursor = Math.max(cursor, ...alteracoes.map((e) => e.sequencia))
    ordenarDependencias(alteracoes)
    semRastreamento(() =>
      tx(() => {
        if (config<boolean>('renumeracaoPendente')) {
          for (const t of ['orcamentos', 'relatorios', 'recibos'])
            run(`UPDATE ${t} SET numero=-1000000000000000-numero`)
        }
        for (const e of alteracoes) {
          aplicarIdentificador(e)
          const conhecido = Number(
            get('SELECT revisao FROM sincronizacao WHERE entidade=?', [e.entidade])?.revisao ?? 0
          )
          const pendente = temOperacaoAtiva(e.entidade)
          if (pendente && e.revisao > conhecido) continue
          if (e.revisao > conhecido) aplicar(e)
        }
        salvar('cursorNuvem', cursor)
        if (config<boolean>('renumeracaoPendente')) salvar('renumeracaoPendente', false)
      })
    )
    // O conteúdo confirmado já pode aparecer. Controles, membros e consumo não
    // devem atrasar a tela nem a publicação da próxima operação local.
    if (alteracoes.length)
      avisarDados({ origem: 'nuvem', entidades: alteracoes.map((e) => e.entidade), status: true })
    if (protocoloNuvem() >= 2) {
      const extra = await auxiliares!
      if (extra.erro) throw extra.erro
      const [dadosControles, dadosPedidos, membros, mapaNumeracao] = extra.dados!
      if (mapaNumeracao) salvar('mapaNumeracaoCache', mapaNumeracao)
      const controles = dadosControles as Array<{
        tipo: TipoDocumento
        documento_id: string
        usuario_id: string
        dispositivo: string
        geracao: number
        expira_em: string | null
        offline: boolean
        revisao: number
      }>
      const mudancas: string[] = []
      tx(() => {
        for (const c of controles) {
          if (!tipos.includes(c.tipo) || !Number.isSafeInteger(c.geracao) || c.geracao < 1)
            throw new Error('Autorização remota inválida.')
          const antes = get(
            'SELECT usuario,computador,geracao,offline FROM edicoes_documento WHERE tipo=? AND documento_id=?',
            [c.tipo, c.documento_id]
          )
          aplicarIdentificador({
            entidade: `${c.tipo}:${c.documento_id}`,
            revisao: 0,
            sequencia: 0,
            payload: { id: c.documento_id, tipo: c.tipo },
            controle: c
          })
          if (
            !antes ||
            antes.usuario !== c.usuario_id ||
            antes.computador !== c.dispositivo ||
            Number(antes.geracao) !== c.geracao ||
            Number(antes.offline) !== Number(c.offline)
          )
            mudancas.push(`controle:${c.tipo}:${c.documento_id}`)
        }
      })
      if (mudancas.length) avisarDados({ origem: 'nuvem', entidades: mudancas, status: true })
      const pedidos = dadosPedidos as Array<{
        tipo: TipoDocumento
        documento_id: string
      }>
      const pedidosAntes = config<typeof pedidos>('pedidosEdicaoCache') ?? []
      if (JSON.stringify(pedidos) !== JSON.stringify(pedidosAntes)) {
        salvar('pedidosEdicaoCache', pedidos)
        avisarDados({
          origem: 'nuvem',
          entidades: [...pedidosAntes, ...pedidos].map(
            (p) => `controle:${p.tipo}:${p.documento_id}`
          ),
          status: true
        })
      }
      if (JSON.stringify(membros) !== JSON.stringify(config('membrosCache'))) {
        salvar('membrosCache', membros)
        avisarDados({ origem: 'nuvem', entidades: ['membros'], status: true })
      }
    }
    if (completa && protocoloNuvem() === 2) {
      const reservasRemotas = (await pedido(
        `/rest/v1/reservas_numeros?select=tipo,numero,documento&dispositivo=eq.${computadorId()}`
      )) as Array<{ tipo: TipoDocumento; numero: number; documento: string | null }>
      tx(() => {
        for (const r of reservasRemotas) {
          if (
            !tipos.includes(r.tipo) ||
            !Number.isInteger(r.numero) ||
            r.numero < 1 ||
            r.numero > 999999
          )
            throw new Error('Reserva remota inválida.')
          run(
            'INSERT INTO reservas VALUES (?,?,?) ON CONFLICT(tipo,numero) DO UPDATE SET usado=MAX(usado,excluded.usado)',
            [r.tipo, r.numero, r.documento ? 1 : 0]
          )
        }
      })
    }
    for (const tipo of tipos)
      if (protocoloNuvem() === 1 && statusNuvem().reservas[tipo] <= 5) {
        const minimo = Number(
          get(`SELECT MAX(numero) AS n FROM ${tabelaNumerosUsados()} WHERE tipo=?`, [tipo])?.n ?? 0
        )
        const numeros = (await pedido(
          `/rest/v1/rpc/${protocoloNuvem() >= 2 ? 'gdo_reserve_v2' : 'gdo_reserve'}`,
          {
            p_tipo: tipo,
            p_dispositivo: computadorId(),
            p_minimo: minimo
          }
        )) as number[]
        tx(() => {
          for (const n of numeros) run('INSERT OR IGNORE INTO reservas VALUES (?,?,0)', [tipo, n])
        })
      }
    // Uma resposta perdida não devolve a autorização offline ao computador anterior.
    // Só uma consulta à base remota pode resolver a transferência pendente.
    for (const l of all(
      "SELECT chave,valor FROM configuracoes WHERE chave LIKE 'transferencia:%'"
    )) {
      const entidade = texto(l.chave).slice('transferencia:'.length)
      const dados = (await pedido(
        `/rest/v1/gdo_entities?select=*&entidade=eq.${encodeURIComponent(entidade)}`
      )) as Remoto[]
      if (dados[0])
        tx(() => {
          semRastreamento(() => aplicar(dados[0]))
          run('DELETE FROM configuracoes WHERE chave=?', [l.chave])
        })
    }
    if (completa) salvar('bytesNuvem', await pedido('/rest/v1/rpc/gdo_usage', {}))
    salvar('ultimaNuvem', new Date().toISOString())
    salvar(
      'erroNuvem',
      erroEnvio ??
        (all("SELECT id FROM fila_nuvem WHERE estado='falha'").length
          ? 'Uma alteração não pôde ser enviada. Confira as operações abaixo; os demais dados continuam sincronizando.'
          : bloqueadas.size
            ? 'Há alterações em conflito preservadas para conciliação. Os demais dados continuam sincronizando.'
            : null)
    )
    avisarDados({ origem: 'nuvem', entidades: [], status: true })
  } catch (e) {
    salvar('erroNuvem', mensagemErro(e))
  } finally {
    ocupado = false
  }
  return statusNuvem()
}
function descricaoOperacao(op: Linha): string {
  let payload: { row?: unknown; rows?: unknown; excluido?: boolean } = {}
  try {
    payload = JSON.parse(texto(op.payload))
  } catch {
    /* payload inválido é preservado */
  }
  const tipo = texto(op.entidade).split(':')[0]
  const nomes: Record<string, string> = {
    clientes: 'cliente',
    servicos: 'serviço do catálogo',
    observacoes_padrao: 'observação padrão',
    pagamentos_padrao: 'forma de pagamento',
    configuracoes: 'configuração',
    imagens: 'imagem',
    orcamento: 'orçamento',
    relatorio: 'relatório',
    recibo: 'recibo'
  }
  const excluir = payload.excluido || (!payload.rows && !payload.row)
  return `${excluir ? 'Excluir' : 'Salvar'} ${nomes[tipo] ?? 'alteração'}`
}
export async function repetirOperacaoNuvem(id: string): Promise<StatusNuvem> {
  if (ocupado || conectando)
    throw new Error('Aguarde a sincronização atual antes de tentar novamente.')
  tentarNovamenteOperacao(id)
  return sincronizarNuvem(false)
}
function aplicarIdentificador(e: Remoto): void {
  if (e.emissao) {
    if (
      e.emissao.tipo !== e.payload.tipo ||
      e.emissao.documento_id !== e.payload.id ||
      e.emissao.numero <= 0
    )
      throw new Error('Numeração de emissão remota inválida.')
    run(
      'INSERT INTO numeros_emitidos VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET numero=excluded.numero,criado_em=excluded.criado_em',
      [e.emissao.tipo, e.emissao.documento_id, e.emissao.numero, e.emissao.criado_em]
    )
  }
  if (e.payload.tipo && !e.payload.excluido && !temOperacaoAtiva(e.entidade)) {
    const versoes = e.payload.rows?.versoes ?? []
    const ultima = [...versoes].sort((a, b) => Number(b.numero) - Number(a.numero))[0]
    if (ultima && typeof ultima.documento === 'string') {
      const d = JSON.parse(ultima.documento)
      if (d.id !== e.payload.id) throw new Error('Snapshot remoto não corresponde ao documento.')
      run(
        'INSERT INTO bases_documento VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET revisao=excluded.revisao,documento=excluded.documento',
        [e.payload.tipo, e.payload.id, e.revisao, ultima.documento]
      )
    }
  }
  const c = e.controle
  if (c) {
    if (
      c.tipo !== e.payload.tipo ||
      c.documento_id !== e.payload.id ||
      !Number.isSafeInteger(c.geracao) ||
      c.geracao < 1
    )
      throw new Error('Controle de edição remoto inválido.')
    run(
      'INSERT INTO edicoes_documento VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET usuario=excluded.usuario,computador=excluded.computador,geracao=excluded.geracao,expira_em=excluded.expira_em,offline=excluded.offline,base_revisao=excluded.base_revisao',
      [
        c.tipo,
        c.documento_id,
        c.usuario_id,
        c.dispositivo,
        c.geracao,
        c.expira_em,
        c.offline ? 1 : 0,
        c.revisao
      ]
    )
  }
  const i = e.autoria ?? e.identificador
  if (!i) return
  if (i.documento_id !== e.payload.id || i.tipo !== e.payload.tipo)
    throw new Error('Autoria remota inválida.')
  run(
    'INSERT INTO autoria_documentos VALUES (?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET usuario_criador=excluded.usuario_criador,alterado_por=excluded.alterado_por',
    [i.tipo, i.documento_id, i.usuario_criador, i.alterado_por]
  )
}
export async function dispositivosNuvem(): Promise<Array<{ id: string; nome: string }>> {
  return (await pedido('/rest/v1/gdo_devices?select=id,nome')) as Array<{
    id: string
    nome: string
  }>
}
export async function transferirDocumento(
  tipo: TipoDocumento,
  id: string,
  destino: string
): Promise<void> {
  exigirResponsavel(tipo, id)
  const s = await sincronizarNuvem()
  if (s.erro || s.pendentes || s.conflitos.length)
    throw new Error(s.erro ?? 'Sincronize todas as alterações antes da transferência.')
  const entidade = `${tipo}:${id}`
  const revisao = Number(
    get('SELECT revisao FROM sincronizacao WHERE entidade=?', [entidade])?.revisao ?? 0
  )
  salvar(`transferencia:${entidade}`, { revisao, destino })
  let falha: unknown
  try {
    await pedido('/rest/v1/rpc/gdo_transfer', {
      p_entidade: entidade,
      p_origem: computadorId(),
      p_destino: destino,
      p_revisao: revisao
    })
  } catch (e) {
    falha = e
  }
  const atualizado = await sincronizarNuvem()
  if (atualizado.erro) throw new Error(atualizado.erro)
  const meta = get('SELECT dados FROM documento_meta WHERE tipo=? AND documento_id=?', [tipo, id])
  if (falha && (!meta || JSON.parse(texto(meta.dados)).computadorResponsavel !== destino))
    throw falha
}
export function sairNuvem(): void {
  pararTempoReal()
  sessaoVolatil = null
  run("DELETE FROM configuracoes WHERE chave='sessaoNuvem'")
}

export async function suspenderNuvemConta(): Promise<void> {
  pararTempoReal()
  await aguardarTempoReal()
  await sincronizacaoAtual?.catch(() => undefined)
  if (renovacaoSessao) await renovacaoSessao.pedido.catch(() => undefined)
  sessaoVolatil = null
  renovacaoSessao = null
  empresaSelecionada = null
  central = false
  estadoTempoReal = 'desconectado'
  erroTempoReal = null
}

export function adotarSessaoConta(c: ConfigNuvem, token: Sessao): void {
  salvar('nuvem', c)
  gravarSessao(token)
}

export function lerSessaoConta(): Sessao | null {
  return sessao()
}
export async function aplicarConflito(id: string): Promise<void> {
  const conflito = get('SELECT entidade FROM conflitos_nuvem WHERE id=?', [id])
  if (
    protocoloNuvem() >= 2 &&
    conflito &&
    ['orcamento', 'relatorio', 'recibo'].includes(texto(conflito.entidade).split(':')[0])
  )
    throw new Error(
      'O trabalho local foi preservado como rascunho. Compare no editor; operações financeiras não são sobrescritas pela conciliação textual.'
    )
  if (ocupado || conectando) throw new Error('Aguarde a sincronização atual.')
  const l = get('SELECT * FROM conflitos_nuvem WHERE id=?', [id])
  if (!l) throw new Error('Conflito não encontrado.')
  ocupado = true
  try {
    // Concilia o conjunto financeiro inteiro: recibos, recebimentos e relatório.
    // A resposta do conflito pode ser antiga; consulta a revisão atual antes de adotar.
    const remotos = await baixarAlteracoes(0)
    const porEntidade = new Map(remotos.map((r) => [r.entidade, r]))
    if (!porEntidade.has(texto(l.entidade))) throw new Error('A versão remota não está disponível.')
    const relacionadas = new Set([texto(l.entidade)])
    const ligar = (reciboId: string, relatorioId: string): boolean => {
      const recibo = `recibo:${reciboId}`,
        relatorio = `relatorio:${relatorioId}`
      if (!relacionadas.has(recibo) && !relacionadas.has(relatorio)) return false
      const mudou = !relacionadas.has(recibo) || !relacionadas.has(relatorio)
      relacionadas.add(recibo)
      relacionadas.add(relatorio)
      return mudou
    }
    let mudou = true
    while (mudou) {
      mudou = false
      for (const row of all('SELECT id,dados FROM recibos')) {
        const r = JSON.parse(texto(row.dados))
        if (r.origemTipo === 'relatorio' && r.origemId)
          mudou = ligar(texto(row.id), r.origemId) || mudou
      }
      for (const remoto of remotos) {
        for (const row of remoto.payload.rows?.recibos ?? []) {
          const r = JSON.parse(String(row.dados))
          if (r.origemTipo === 'relatorio' && r.origemId)
            mudou = ligar(String(row.id), r.origemId) || mudou
        }
      }
    }
    exportarDadosPara(join(pastaDados(), `antes-conciliacao-${Date.now()}.gdo-backup`))
    semRastreamento(() =>
      tx(() => {
        // Cadastros/ativos sem edições pendentes são dependências dos documentos remotos.
        for (const remoto of ordenarDependencias(remotos)) {
          if (remoto.payload.tabela && !temOperacaoAtiva(remoto.entidade)) aplicar(remoto)
        }
        for (const entidade of relacionadas) {
          run("DELETE FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'", [entidade])
          run('DELETE FROM conflitos_nuvem WHERE entidade=?', [entidade])
          if (
            !entidade.startsWith('recibo:') &&
            !entidade.startsWith('relatorio:') &&
            !entidade.startsWith('orcamento:')
          )
            continue
          const [tipo, documentoId] = entidade.split(':')
          run('DELETE FROM versoes WHERE tipo=? AND documento_id=?', [tipo, documentoId])
          run('DELETE FROM documento_meta WHERE tipo=? AND documento_id=?', [tipo, documentoId])
          if (tipo === 'recibo') {
            run('DELETE FROM recebimentos WHERE recibo_id=?', [documentoId])
            if (!porEntidade.has(entidade)) run('DELETE FROM recibos WHERE id=?', [documentoId])
          }
        }
        for (const remoto of ordenarDependencias(
          remotos.filter((r) => relacionadas.has(r.entidade))
        ))
          aplicar(remoto)
        if (get('PRAGMA foreign_key_check'))
          throw new Error('A conciliação produziria referências inválidas e foi cancelada.')
      })
    )
  } finally {
    ocupado = false
  }
}
export function capturarCadastros(): void {
  if (!config<ConfigNuvem>('nuvem')) return
  for (const t of tabelas)
    for (const l of all(`SELECT * FROM ${t}`)) {
      if (
        t === 'configuracoes' &&
        !['empresa', 'parametros', 'camposClientePadrao'].includes(texto(l.chave))
      )
        continue
      const id = texto(l.id ?? l.hash ?? l.chave)
      // Apenas captura quando o estado difere do último envio conhecido.
      const chave = `estado:${t}:${id}`
      const payload = criarPayloadCadastroSalvo(
        t as Parameters<typeof criarPayloadCadastroSalvo>[0],
        id,
        l
      )
      const estado = JSON.stringify(payload)
      const anterior = config<string>(chave)
      let igual = anterior === estado
      if (!igual && anterior) {
        try {
          const conhecido = JSON.parse(anterior)
          igual = conteudoEquivalente(conhecido, payload)
        } catch {
          // Cache inválido não pode esconder uma mudança local real.
        }
      }
      if (!igual) {
        enfileirar(`${t}:${id}`, payload)
        salvar(chave, estado)
      }
    }
}
export function verificarIntegridadeLocal(): void {
  if (texto(db().get('PRAGMA integrity_check')?.integrity_check) !== 'ok')
    throw new Error('Falha de integridade local.')
}
