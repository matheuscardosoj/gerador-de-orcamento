import { safeStorage } from 'electron'
import { hostname } from 'os'
import { all, get, run, texto, tx, db } from './db/sqlite'
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
import { iniciarTempoReal, pararTempoReal, avisarEstadoTempoReal } from './tempo-real'
import { randomUUID } from 'crypto'

let ocupado = false
let conectando = false
type ContextoNuvem = {
  protocolo: number
  empresaId: string
  usuarioId: string
  usuarioNome: string
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
function sessao(): Sessao | null {
  const s = config<string>('sessaoNuvem')
  return s ? JSON.parse(safeStorage.decryptString(Buffer.from(s, 'base64'))) : null
}
function gravarSessao(s: Sessao): void {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('A proteção de credenciais do Windows está indisponível.')
  salvar('sessaoNuvem', safeStorage.encryptString(JSON.stringify(s)).toString('base64'))
}
export async function pedidoNuvem(path: string, body?: unknown, login = false): Promise<unknown> {
  const c = configuracaoNuvem()
  let token = c.chavePublica
  if (!login) {
    let s = sessao()
    if (!s) throw new Error('Entre na conta da empresa para sincronizar.')
    if (s.expires_at * 1000 < Date.now() + 60000) {
      const atualizado = (await pedidoNuvem(
        '/auth/v1/token?grant_type=refresh_token',
        { refresh_token: s.refresh_token },
        true
      )) as Sessao
      gravarSessao(atualizado)
      s = atualizado
    }
    token = s.access_token
  }
  const resposta = await fetch(c.url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: c.chavePublica,
      ...(!login ? { Authorization: `Bearer ${token}` } : {}),
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
    contexto = (await pedido('/rest/v1/rpc/gdo_contexto_v2', { p_criar: criar })) as ContextoNuvem
  } catch (e) {
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
  salvar('contextoNuvem', contexto)
  salvar('empresaNuvem', contexto.empresaId)
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
    sincronizar: sincronizarNuvem,
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
      await pedido('/rest/v1/rpc/gdo_dispositivo_v2', {
        p_dispositivo: computadorId(),
        p_nome: hostname()
      })
      salvar('cursorNuvem', 0)
      ativarTempoReal()
    } else await sincronizarNuvem()
  } catch (e) {
    salvar('erroNuvem', String(e).replace(/^Error:\s*/, ''))
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
    autenticada: !!config<string>('sessaoNuvem'),
    computador: computadorId(),
    pendentes: Number(get('SELECT COUNT(*) AS n FROM fila_nuvem')?.n ?? 0),
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
    if (dono && dono !== s.user.id && get('SELECT 1 FROM fila_nuvem LIMIT 1'))
      throw new Error(
        'Conclua a sincronização ou preserve as alterações em rascunhos antes de trocar de usuário.'
      )
    gravarSessao(s)
    const contexto = await reconhecerEmpresa(!anterior && modo === 'publicar')
    if (dono && dono !== s.user.id && contexto.protocolo < 2)
      throw new Error('Atualize a configuração do banco para usar logins individuais da empresa.')
    if (contexto.protocolo >= 2) {
      const chave = `computadorUsuario:${s.user.id}`
      if (dono && dono !== s.user.id && !config<string>(chave)) salvar(chave, randomUUID())
      if (!config<string>(chave)) salvar(chave, computadorId())
      salvar('computadorId', config<string>(chave))
      salvar('cursorNuvem', 0)
    }
    salvar('usuarioNuvem', s.user.id)
    await pedido(`/rest/v1/rpc/${contexto.protocolo >= 2 ? 'gdo_dispositivo_v2' : 'gdo_device'}`, {
      p_dispositivo: computadorId(),
      p_nome: hostname()
    })
    if (!anterior) {
      const existentes = (await pedido(
        '/rest/v1/gdo_entities?select=entidade&limit=1'
      )) as unknown[]
      if (modo === 'publicar' && existentes.length)
        throw new Error('A nuvem já contém dados. Use baixar a base para conectar este computador.')
      exportarDadosPara(join(pastaDados(), `antes-nuvem-${Date.now()}.gdo-backup`))
      if (modo === 'publicar') {
        await pedido(
          `/rest/v1/rpc/${contexto.protocolo >= 2 ? 'gdo_bootstrap_v2' : 'gdo_bootstrap_numbers'}`,
          {
            p_dispositivo: computadorId(),
            p_numeros: all('SELECT tipo,numero FROM numeros_usados WHERE numero>0')
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
              'numeros_usados',
              'fila_nuvem',
              'sincronizacao',
              'conflitos_nuvem',
              'identificadores_documento',
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
type Remoto = {
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
async function baixarAlteracoes(inicio: number): Promise<Remoto[]> {
  let cursor = inicio
  const todas: Remoto[] = []
  while (true) {
    const dados = (
      protocoloNuvem() >= 2
        ? await pedido('/rest/v1/rpc/gdo_alteracoes_v2', { p_cursor: cursor, p_limite: 50 })
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
    if (p.row) upsert(p.tabela, p.row)
    else
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
      if (Number(pai.numero) > 0)
        run('INSERT OR IGNORE INTO numeros_usados VALUES (?,?)', [p.tipo, pai.numero])
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
          if (Number.isSafeInteger(numero) && numero > 0)
            run('INSERT OR IGNORE INTO numeros_usados VALUES (?,?)', [p.tipo, numero])
        }
      }
  } else throw new Error('Pacote remoto inválido.')
  run(
    'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
    [e.entidade, e.revisao]
  )
}
export async function sincronizarNuvem(): Promise<StatusNuvem> {
  if (ocupado || conectando) return statusNuvem()
  ocupado = true
  try {
    if (protocoloNuvem() >= 2) await reconhecerEmpresa()
    if (protocoloNuvem() < 2 && get('SELECT 1 FROM conflitos_nuvem LIMIT 1'))
      throw new Error('Resolva os conflitos antes de sincronizar novas alterações.')
    const pendencias = all('SELECT * FROM fila_nuvem ORDER BY rowid')
    const grupos =
      protocoloNuvem() < 2
        ? [pendencias]
        : [...new Set(pendencias.map((l) => texto(l.grupo)))].map((grupo) =>
            pendencias.filter((l) => texto(l.grupo) === grupo)
          )
    const bloqueadas = new Set(
      all('SELECT entidade FROM conflitos_nuvem').map((l) => texto(l.entidade))
    )
    for (const fila of grupos) {
      if (
        !fila.length ||
        (protocoloNuvem() >= 2 && fila.some((l) => bloqueadas.has(texto(l.entidade))))
      )
        continue
      const result = (await pedido(
        `/rest/v1/rpc/${protocoloNuvem() >= 2 ? 'gdo_batch_v2' : 'gdo_batch'}`,
        {
          p_operacoes: fila.map((l) => ({
            id: l.id,
            entidade: l.entidade,
            base: l.base,
            payload: JSON.parse(texto(l.payload)),
            geracao: l.geracao
          })),
          p_dispositivo: computadorId()
        }
      ).catch((e: unknown) => {
        if (
          protocoloNuvem() < 2 ||
          !/Autorização.*(expirada|revogada)|Documento em edição/.test(String(e))
        )
          throw e
        const op =
          fila.find((l) =>
            ['orcamento', 'relatorio', 'recibo'].includes(texto(l.entidade).split(':')[0])
          ) ?? fila[0]
        run('INSERT OR REPLACE INTO conflitos_nuvem VALUES (?,?,?,?)', [
          op.id,
          op.entidade,
          String(e).replace(/^Error:\s*/, ''),
          'null'
        ])
        return { ok: false, entidade: op.entidade, remoto: null }
      })) as {
        ok: boolean
        resultados?: Array<{ entidade: string; revisao: number }>
        entidade?: string
        remoto?: Remoto
      }
      if (!result.ok) {
        const op = fila.find((l) => l.entidade === result.entidade) ?? fila[0]
        run('INSERT OR REPLACE INTO conflitos_nuvem VALUES (?,?,?,?)', [
          op.id,
          op.entidade,
          'A base remota mudou. Suas alterações locais foram preservadas.',
          JSON.stringify(result.remoto)
        ])
        if (protocoloNuvem() < 2)
          throw new Error('Conflito de sincronização. Compare as versões e escolha como continuar.')
        for (const l of fila) bloqueadas.add(texto(l.entidade))
        continue
      }
      tx(() => {
        for (const r of result.resultados ?? [])
          run(
            'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
            [r.entidade, r.revisao]
          )
        for (const l of fila) run('DELETE FROM fila_nuvem WHERE id=?', [l.id])
      })
    }
    let cursor = config<number>('cursorNuvem') ?? 0
    const alteracoes = await baixarAlteracoes(cursor)
    if (protocoloNuvem() >= 2) {
      const controles = (await pedido('/rest/v1/edicoes_documento?select=*')) as Array<{
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
    }
    cursor = Math.max(cursor, ...alteracoes.map((e) => e.sequencia))
    ordenarDependencias(alteracoes)
    semRastreamento(() =>
      tx(() => {
        for (const e of alteracoes) {
          aplicarIdentificador(e)
          const conhecido = Number(
            get('SELECT revisao FROM sincronizacao WHERE entidade=?', [e.entidade])?.revisao ?? 0
          )
          const pendente = get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [e.entidade])
          if (pendente && e.revisao > conhecido)
            if (protocoloNuvem() >= 2) continue
            else
              throw new Error(
                'Há edições locais novas; sincronize novamente antes de baixar alterações.'
              )
          if (e.revisao > conhecido) aplicar(e)
        }
        salvar('cursorNuvem', cursor)
      })
    )
    for (const tipo of tipos)
      if (statusNuvem().reservas[tipo] <= 5) {
        const minimo = Number(
          get('SELECT MAX(numero) AS n FROM numeros_usados WHERE tipo=?', [tipo])?.n ?? 0
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
    salvar('bytesNuvem', await pedido('/rest/v1/rpc/gdo_usage', {}))
    salvar('ultimaNuvem', new Date().toISOString())
    salvar(
      'erroNuvem',
      bloqueadas.size
        ? 'Há alterações em conflito preservadas para conciliação. Os demais dados continuam sincronizando.'
        : null
    )
    if (alteracoes.length)
      avisarDados({ origem: 'nuvem', entidades: alteracoes.map((e) => e.entidade), status: true })
  } catch (e) {
    salvar('erroNuvem', String(e).replace(/^Error:\s*/, ''))
  } finally {
    ocupado = false
  }
  return statusNuvem()
}
function aplicarIdentificador(e: Remoto): void {
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
  const i = e.identificador
  if (!i) return
  if (
    !Number.isSafeInteger(i.id_interno) ||
    i.id_interno < 1 ||
    i.documento_id !== e.payload.id ||
    i.tipo !== e.payload.tipo
  )
    throw new Error('Identificador interno remoto inválido.')
  run(
    'INSERT INTO identificadores_documento VALUES (?,?,?,?,?) ON CONFLICT(tipo,documento_id) DO UPDATE SET id_interno=excluded.id_interno,usuario_criador=excluded.usuario_criador,alterado_por=excluded.alterado_por',
    [i.tipo, i.documento_id, i.id_interno, i.usuario_criador, i.alterado_por]
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
  run("DELETE FROM configuracoes WHERE chave='sessaoNuvem'")
}
export async function aplicarConflito(id: string): Promise<void> {
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
          if (
            remoto.payload.tabela &&
            !get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [remoto.entidade])
          )
            aplicar(remoto)
        }
        for (const entidade of relacionadas) {
          run('DELETE FROM fila_nuvem WHERE entidade=?', [entidade])
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
      const payload = { tabela: t, id, row: l }
      const estado = JSON.stringify(payload)
      if (config<string>(chave) !== estado) {
        enfileirar(`${t}:${id}`, payload)
        salvar(chave, estado)
      }
    }
}
export function verificarIntegridadeLocal(): void {
  if (texto(db().get('PRAGMA integrity_check')?.integrity_check) !== 'ok')
    throw new Error('Falha de integridade local.')
}
