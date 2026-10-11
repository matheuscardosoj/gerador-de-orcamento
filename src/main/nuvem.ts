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

let ocupado = false
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
async function pedido(path: string, body?: unknown, login = false): Promise<unknown> {
  const c = configuracaoNuvem()
  let token = c.chavePublica
  if (!login) {
    let s = sessao()
    if (!s) throw new Error('Entre na conta da empresa para sincronizar.')
    if (s.expires_at * 1000 < Date.now() + 60000) {
      const atualizado = (await pedido(
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok)
    throw new Error(dados?.msg ?? dados?.message ?? `Falha na nuvem (${resposta.status}).`)
  return dados
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
    reservas
  }
}
export async function conectarNuvem(
  c: ConfigNuvem,
  senha: string,
  modo: 'publicar' | 'baixar'
): Promise<StatusNuvem> {
  if (ocupado) throw new Error('Aguarde a sincronização atual.')
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
  salvar('nuvem', { ...c, url: c.url.replace(/\/$/, '') })
  try {
    const s = (await pedido(
      '/auth/v1/token?grant_type=password',
      { email: c.email, password: senha },
      true
    )) as Sessao
    const dono = config<string>('usuarioNuvem')
    if (dono && dono !== s.user.id)
      throw new Error('Este perfil pertence a outra conta. Use a mesma conta da empresa.')
    gravarSessao(s)
    salvar('usuarioNuvem', s.user.id)
    await pedido('/rest/v1/rpc/gdo_device', { p_dispositivo: computadorId(), p_nome: hostname() })
    if (!anterior) {
      const existentes = (await pedido(
        '/rest/v1/gdo_entities?select=entidade&limit=1'
      )) as unknown[]
      if (modo === 'publicar' && existentes.length)
        throw new Error('A nuvem já contém dados. Use baixar a base para conectar este computador.')
      exportarDadosPara(join(pastaDados(), `antes-nuvem-${Date.now()}.gdo-backup`))
      if (modo === 'publicar') {
        await pedido('/rest/v1/rpc/gdo_bootstrap_numbers', {
          p_dispositivo: computadorId(),
          p_numeros: all('SELECT tipo,numero FROM numeros_usados WHERE numero>0')
        })
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
              `SELECT id FROM ${{ orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[tipo]}`
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
              'conflitos_nuvem'
            ])
              run(`DELETE FROM ${t}`)
            salvar('cursorNuvem', 0)
          })
        )
      }
    }
    return await sincronizarNuvem()
  } catch (e) {
    if (!anterior && !get('SELECT 1 FROM fila_nuvem LIMIT 1') && !config<number>('cursorNuvem')) {
      run("DELETE FROM configuracoes WHERE chave IN ('nuvem','sessaoNuvem','usuarioNuvem')")
    }
    throw e
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
function aplicar(e: Remoto): void {
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
      for (const row of p.rows[nome] ?? []) upsert(nome, row)
  } else throw new Error('Pacote remoto inválido.')
  run(
    'INSERT INTO sincronizacao VALUES (?,?) ON CONFLICT(entidade) DO UPDATE SET revisao=excluded.revisao',
    [e.entidade, e.revisao]
  )
}
export async function sincronizarNuvem(): Promise<StatusNuvem> {
  if (ocupado) return statusNuvem()
  ocupado = true
  try {
    if (get('SELECT 1 FROM conflitos_nuvem LIMIT 1'))
      throw new Error('Resolva os conflitos antes de sincronizar novas alterações.')
    const fila = all('SELECT * FROM fila_nuvem ORDER BY rowid')
    if (fila.length) {
      const result = (await pedido('/rest/v1/rpc/gdo_batch', {
        p_operacoes: fila.map((l) => ({
          id: l.id,
          entidade: l.entidade,
          base: l.base,
          payload: JSON.parse(texto(l.payload))
        })),
        p_dispositivo: computadorId()
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
        throw new Error('Conflito de sincronização. Compare as versões e escolha como continuar.')
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
    const alteracoes: Remoto[] = []
    while (true) {
      const dados = (await pedido(
        `/rest/v1/gdo_entities?select=*&sequencia=gt.${cursor}&order=sequencia.asc&limit=50`
      )) as Remoto[]
      if (!dados.length) break
      alteracoes.push(...dados)
      cursor = Math.max(cursor, ...dados.map((e) => e.sequencia))
    }
    // O feed contém o último estado de cada entidade: um cliente alterado
    // depois da proposta precisa ser aplicado antes dela em uma base vazia.
    const ordem = (e: Remoto): number =>
      e.payload.tabela
        ? 0
        : e.payload.tipo === 'orcamento'
          ? 1
          : e.payload.tipo === 'relatorio'
            ? 2
            : 3
    alteracoes.sort((a, b) => ordem(a) - ordem(b) || a.sequencia - b.sequencia)
    semRastreamento(() =>
      tx(() => {
        for (const e of alteracoes) {
          const conhecido = Number(
            get('SELECT revisao FROM sincronizacao WHERE entidade=?', [e.entidade])?.revisao ?? 0
          )
          const pendente = get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [e.entidade])
          if (pendente && e.revisao > conhecido)
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
        const numeros = (await pedido('/rest/v1/rpc/gdo_reserve', {
          p_tipo: tipo,
          p_dispositivo: computadorId(),
          p_minimo: minimo
        })) as number[]
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
    salvar('erroNuvem', null)
  } catch (e) {
    salvar('erroNuvem', String(e).replace(/^Error:\s*/, ''))
  } finally {
    ocupado = false
  }
  return statusNuvem()
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
  run("DELETE FROM configuracoes WHERE chave='sessaoNuvem'")
}
export function aplicarConflito(id: string): void {
  const l = get('SELECT * FROM conflitos_nuvem WHERE id=?', [id])
  if (!l) throw new Error('Conflito não encontrado.')
  exportarDadosPara(join(pastaDados(), `antes-conciliacao-${Date.now()}.gdo-backup`))
  tx(() => {
    const remoto = JSON.parse(texto(l.remoto)) as Remoto | null
    if (!remoto) throw new Error('A versão remota não está disponível.')
    run('DELETE FROM fila_nuvem WHERE entidade=?', [l.entidade])
    semRastreamento(() => aplicar(remoto))
    run('DELETE FROM conflitos_nuvem WHERE id=?', [id])
  })
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
