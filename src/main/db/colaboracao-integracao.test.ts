// Dois logins/perfis, SQLite e funções reais v2. Transporte HTTP de teste;
// o canal WebSocket é exercitado separadamente, sem conectar serviços externos.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
const estado = vi.hoisted(() => ({ perfil: '' }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-v2-perfis-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, isPackaged: false, getAppPath: () => estado.perfil },
  dialog: {},
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))
vi.mock('../tempo-real', () => ({
  iniciarTempoReal: () => {},
  pararTempoReal: () => {},
  avisarEstadoTempoReal: () => {}
}))
const pg = new PGlite(),
  empresa = randomUUID(),
  segundo = randomUUID()
let sql: typeof import('./sqlite'),
  repos: typeof import('../repositories'),
  recibos: typeof import('../recibos'),
  nuvem: typeof import('../nuvem'),
  colaboracao: typeof import('../colaboracao')
const config = {
  url: 'https://teste.supabase.co',
  chavePublica: 'sb_publishable_teste',
  email: 'a@example.com'
}
let reciboId = '',
  offline = false
let reterControles: Promise<void> | null = null
let renovacoes = 0
let lotesPublicados = 0
let recusarEntidade: string | null = null
let rascunhos: typeof import('../rascunhos')
async function perfil(nome: string) {
  sql.fecharBanco()
  estado.perfil = join(raiz, nome)
  sql.abrirBanco()
  if (repos.bancoVazio()) repos.semear()
}
beforeAll(async () => {
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    INSERT INTO auth.users VALUES('${empresa}','a@example.com'),('${segundo}','b@example.com');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.exec('SET ROLE authenticated')
  const endpoints = new Set([
    'gdo_contexto_v2',
    'gdo_contexto_v3',
    'gdo_dispositivo_v3',
    'gdo_membros_v3',
    'gdo_edicao_v3',
    'gdo_batch_v3',
    'gdo_alteracoes_v3',
    'gdo_documento_v3',
    'gdo_numeracao_v3',
    'gdo_dispositivo_v2',
    'gdo_bootstrap_v2',
    'gdo_reserve_v2',
    'gdo_alteracoes_v2',
    'gdo_batch_v2',
    'gdo_membros_v2',
    'gdo_edicao_v2',
    'gdo_numeracao_v2',
    'gdo_documento_v2',
    'gdo_usage'
  ])
  vi.stubGlobal('fetch', async (url: string, options: RequestInit = {}) => {
    if (offline) throw new Error('Sem internet no teste')
    const u = new URL(url),
      body = options.body ? JSON.parse(String(options.body)) : {}
    try {
      if (u.pathname === '/auth/v1/token') {
        if (u.searchParams.get('grant_type') === 'refresh_token') {
          renovacoes++
          await new Promise((r) => setTimeout(r, 20))
        }
        return new Response(
          JSON.stringify({
            access_token: body.email === 'b@example.com' ? segundo : empresa,
            refresh_token: 'teste',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: body.email === 'b@example.com' ? segundo : empresa }
          })
        )
      }
      const token = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '')
      await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [token])
      let result: unknown
      if (u.pathname === '/rest/v1/gdo_entities')
        result = (
          await pg.query(
            'SELECT * FROM gdo_entities WHERE usuario=gdo_empresa() ORDER BY sequencia LIMIT 1'
          )
        ).rows
      else if (u.pathname === '/rest/v1/edicoes_documento') {
        result = (await pg.query('SELECT * FROM edicoes_documento')).rows
        if (reterControles) await reterControles
      } else if (u.pathname === '/rest/v1/mapa_numeracao')
        result = (await pg.query('SELECT tipo,documento_id,anterior,novo FROM mapa_numeracao')).rows
      else if (u.pathname === '/rest/v1/pedidos_edicao')
        result = (await pg.query('SELECT * FROM pedidos_edicao')).rows
      else if (u.pathname === '/rest/v1/recibos')
        result = (
          await pg.query("SELECT id FROM recibos WHERE origem_tipo='relatorio' AND origem_id=$1", [
            u.searchParams.get('origem_id')?.slice(3)
          ])
        ).rows
      else if (u.pathname === '/rest/v1/reservas_numeros')
        result = (
          await pg.query(
            'SELECT tipo,numero,documento FROM reservas_numeros WHERE dispositivo=$1',
            [u.searchParams.get('dispositivo')?.slice(3)]
          )
        ).rows
      else if (u.pathname === '/rest/v1/gdo_devices')
        result = (await pg.query('SELECT id,nome FROM gdo_devices')).rows
      else {
        const fn = u.pathname.split('/').at(-1)!
        if (fn === 'gdo_batch_v3') lotesPublicados++
        if (
          fn === 'gdo_batch_v3' &&
          body.p_operacoes.some((op: { entidade: string }) => op.entidade === recusarEntidade)
        )
          return new Response(
            JSON.stringify({
              code: 'P0001',
              message:
                'Campos incompatíveis com o esquema da nuvem. Atualize a configuração do banco; nenhuma alteração foi aplicada'
            }),
            { status: 400 }
          )
        if (!endpoints.has(fn)) throw new Error('Endpoint desconhecido: ' + fn)
        const keys = Object.keys(body)
        if (keys.some((k) => !/^p_[a-z_]+$/.test(k))) throw new Error('Parâmetro inválido')
        const args = keys.map((k, n) => `${k}=>$${n + 1}`).join(',')
        const rows = (
          await pg.query<{ r: unknown }>(
            `SELECT ${fn}(${args}) AS r`,
            keys.map((k) =>
              typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k]
            )
          )
        ).rows
        result = ['gdo_alteracoes_v2', 'gdo_alteracoes_v3', 'gdo_reserve_v2'].includes(fn)
          ? rows.map((r) => r.r)
          : rows[0]?.r
      }
      return new Response(JSON.stringify(result), { status: 200 })
    } catch (e) {
      return new Response(
        JSON.stringify({
          message: (e as Error).message,
          code: (e as { code?: string }).code ?? 'P0001'
        }),
        { status: 400 }
      )
    }
  })
  sql = await import('./sqlite')
  repos = await import('../repositories')
  recibos = await import('../recibos')
  nuvem = await import('../nuvem')
  colaboracao = await import('../colaboracao')
  rascunhos = await import('../rascunhos')
  await perfil('a')
})
afterAll(async () => {
  sql.fecharBanco()
  vi.unstubAllGlobals()
  await pg.close()
  rmSync(raiz, { recursive: true, force: true })
})
it('publica, atribui número no servidor e baixa a mesma empresa em outro login', async () => {
  expect((await nuvem.conectarNuvem(config, 'teste', 'publicar')).erro).toBeNull()
  const r = recibos.recibosRepo.create({
    data: '2026-10-12',
    destinatario: 'Cliente',
    descricao: 'Serviço original',
    valor: 100,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'rascunho',
    quitacao: 'parcial',
    observacao: ''
  })
  reciboId = r.id
  // Criação e edição antes da primeira resposta: a operação mantém geração nula
  // e só é aceita sob a primeira autorização do mesmo usuário/computador.
  recibos.recibosRepo.update(r.id, {
    observacao: 'Edição inicial antes de sincronizar',
    versao: r.versao
  })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(recibos.recibosRepo.get(r.id)?.numero).toBe(1)
  expect(recibos.recibosRepo.get(r.id)?.observacao).toBe('Edição inicial antes de sincronizar')
  await colaboracao.vincularMembro('b@example.com', 'Pessoa B')
  await perfil('b')
  const s = await nuvem.conectarNuvem({ ...config, email: 'b@example.com' }, 'teste', 'baixar')
  expect(s.erro).toBeNull()
  expect(s.empresaId).toBe(empresa)
  expect(s.usuarioId).toBe(segundo)
  expect(recibos.recibosRepo.get(r.id)).toMatchObject({
    valor: 100,
    descricao: 'Serviço original'
  })
})
it('coordena edição entre os logins e preserva a revisão recebida', async () => {
  await expect(colaboracao.autorizarGravacao('recibo', reciboId)).rejects.toThrow('outro usuário')
  await perfil('a')
  await colaboracao.controlarEdicao('recibo', reciboId, 'liberar')
  await perfil('b')
  await colaboracao.autorizarGravacao('recibo', reciboId)
  const r = recibos.recibosRepo.get(reciboId)!
  recibos.recibosRepo.update(reciboId, { observacao: 'Revisado pela pessoa B', versao: r.versao })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('a')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(recibos.recibosRepo.get(reciboId)).toMatchObject({
    alteradoPor: segundo,
    observacao: 'Revisado pela pessoa B',
    valor: 100,
    numero: 1
  })
})
it('mantém a geração do salvamento ao ficar offline e não usa a geração nova após recuperação', async () => {
  await perfil('b')
  await colaboracao.controlarEdicao('recibo', reciboId, 'offline')
  offline = true
  const r = recibos.recibosRepo.get(reciboId)!
  recibos.recibosRepo.update(reciboId, {
    observacao: 'Trabalho offline preservado',
    versao: r.versao
  })
  const geracao = sql.get('SELECT geracao FROM fila_nuvem LIMIT 1')?.geracao
  expect(Number(geracao)).toBeGreaterThan(0)
  offline = false
  await perfil('a')
  await colaboracao.controlarEdicao('recibo', reciboId, 'recuperar')
  await perfil('b')
  const s = await nuvem.sincronizarNuvem()
  expect(s.conflitos).toHaveLength(1)
  expect(s.pendentes).toBeGreaterThan(0)
  expect(sql.get('SELECT geracao FROM fila_nuvem LIMIT 1')?.geracao).toBe(geracao)
  expect(recibos.recibosRepo.get(reciboId)?.observacao).toBe('Trabalho offline preservado')
})
it('compara o trabalho offline com a base de partida e aplica só após liberar a edição', async () => {
  const r = rascunhos.criarRascunho('recibo', reciboId)
  expect(r.base).toMatchObject({ observacao: 'Revisado pela pessoa B' })
  expect(r.documento).toMatchObject({ observacao: 'Trabalho offline preservado' })
  const comparacao = await rascunhos.compararRascunho(r.id)
  expect(comparacao.conflitos).toEqual([])
  expect(comparacao.documento).toMatchObject({ observacao: 'Trabalho offline preservado' })
  await expect(rascunhos.aplicarRascunho(r.id, comparacao.revisaoRemota, {})).rejects.toThrow(
    'outro usuário'
  )
  await perfil('a')
  await colaboracao.controlarEdicao('recibo', reciboId, 'liberar')
  await perfil('b')
  const aplicado = await rascunhos.aplicarRascunho(r.id, comparacao.revisaoRemota, {})
  expect(aplicado).toMatchObject({
    numero: 1,
    valor: 100,
    descricao: 'Serviço original',
    observacao: 'Trabalho offline preservado'
  })
  expect(rascunhos.obterRascunho(r.id).estado).toBe('aplicado')
  expect(sql.get('SELECT count(*) AS n FROM recebimentos')?.n).toBe(0)
})
it('revisa confirmação e estorno após revogação sem dupla contabilização', async () => {
  await perfil('a')
  const financeiro = await import('../conciliacao-financeira')
  const p = repos.orcamentosRepo.create({
    data: '2026-10-12',
    destinatario: 'Cliente financeiro',
    formato: 'carta',
    titulo: 'Proposta',
    itensServico: [
      {
        id: randomUUID(),
        descricao: 'Serviço',
        unidade: 'un',
        quantidade: 1,
        valorUnitario: 1000,
        valorTotal: 1000
      }
    ],
    materiais: [],
    observacoes: [],
    pagamentos: [],
    anexos: [],
    valorTotal: 1000,
    status: 'rascunho'
  })
  const rel = repos.relatoriosRepo.criarDeOrcamento(p.id)!
  const recibo = recibos.recibosRepo.create({
    data: '2026-10-12',
    destinatario: 'Cliente financeiro',
    descricao: 'Serviço',
    valor: 200,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'pendente',
    quitacao: 'parcial',
    observacao: '',
    origemTipo: 'relatorio',
    origemId: rel.id
  })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await colaboracao.controlarEdicao('recibo', recibo.id, 'offline')
  offline = true
  recibos.recibosRepo.confirmar(recibo.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  offline = false
  await perfil('b')
  await nuvem.sincronizarNuvem()
  await colaboracao.controlarEdicao('relatorio', rel.id, 'recuperar')
  await perfil('a')
  await nuvem.sincronizarNuvem()
  expect(nuvem.statusNuvem().conflitos.length).toBeGreaterThan(0)
  let revisao = await financeiro.revisarRecebimentos('relatorio', rel.id)
  expect(revisao.operacoes).toMatchObject([{ valor: 200, acao: 'confirmar', situacao: 'pendente' }])
  await colaboracao.controlarEdicao('relatorio', rel.id, 'recuperar')
  await financeiro.conciliarRecebimentos(revisao, 'reaplicar')
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  expect(recibos.recibosRepo.get(recibo.id)?.status).toBe('recebido')
  expect(
    sql.get('SELECT count(*) AS n FROM recebimentos WHERE recibo_id=? AND estornado=0', [recibo.id])
      ?.n
  ).toBe(1)
  // Preparar novamente reserva o conjunto; o estorno offline também recebe uma operação nova.
  await colaboracao.controlarEdicao('recibo', recibo.id, 'offline')
  offline = true
  recibos.recibosRepo.cancelar(recibo.id)
  offline = false
  await perfil('b')
  await nuvem.sincronizarNuvem()
  await colaboracao.controlarEdicao('relatorio', rel.id, 'recuperar')
  await perfil('a')
  await nuvem.sincronizarNuvem()
  revisao = await financeiro.revisarRecebimentos('recibo', recibo.id)
  expect(revisao.operacoes).toMatchObject([{ acao: 'estornar', situacao: 'pendente' }])
  await colaboracao.controlarEdicao('relatorio', rel.id, 'recuperar')
  await financeiro.conciliarRecebimentos(revisao, 'reaplicar')
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
  expect(sql.get('SELECT count(*) AS n FROM recebimentos WHERE recibo_id=?', [recibo.id])?.n).toBe(
    1
  )
  expect(
    sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [recibo.id])?.estornado
  ).toBe(1)
  expect(
    sql.get("SELECT count(*) AS n FROM auditoria_colaboracao WHERE acao='recebimentos:reaplicar'")
      ?.n
  ).toBe(2)
  expect((await financeiro.revisarRecebimentos('recibo', recibo.id)).operacoes).toEqual([])
})
it('preserva um recebimento divergente e arquiva só pendências locais com revisão explícita', async () => {
  const financeiro = await import('../conciliacao-financeira')
  const r = recibos.recibosRepo.create({
    data: '2026-10-12',
    destinatario: 'Cliente avulso',
    descricao: 'Serviço avulso',
    valor: 150,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'pendente',
    quitacao: 'parcial',
    observacao: ''
  })
  await nuvem.sincronizarNuvem()
  await colaboracao.controlarEdicao('recibo', r.id, 'offline')
  offline = true
  recibos.recibosRepo.confirmar(r.id)
  offline = false
  await perfil('b')
  await nuvem.sincronizarNuvem()
  await colaboracao.controlarEdicao('recibo', r.id, 'recuperar')
  const atual = recibos.recibosRepo.get(r.id)!
  recibos.recibosRepo.update(r.id, { valor: 200, versao: atual.versao })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('a')
  await nuvem.sincronizarNuvem()
  const revisao = await financeiro.revisarRecebimentos('recibo', r.id)
  expect(revisao.operacoes).toMatchObject([{ valor: 150, situacao: 'divergente' }])
  await expect(financeiro.conciliarRecebimentos(revisao, 'reaplicar')).rejects.toThrow(
    'divergências financeiras'
  )
  await expect(
    financeiro.conciliarRecebimentos({ ...revisao, revisoes: {} }, 'arquivar')
  ).rejects.toThrow('mudaram desde a revisão')
  await financeiro.conciliarRecebimentos(revisao, 'arquivar')
  expect(recibos.recibosRepo.get(r.id)).toMatchObject({ valor: 200, status: 'pendente' })
  expect(sql.get('SELECT count(*) AS n FROM recebimentos WHERE recibo_id=?', [r.id])?.n).toBe(0)
  expect(
    rascunhos
      .listarRascunhos('recibo', r.id)
      .some((r) => (r.documento as import('@shared/types').Recibo).valor === 150)
  ).toBe(true)
  const auditoria = sql.get(
    "SELECT dados FROM auditoria_colaboracao WHERE acao='recebimentos:arquivar'"
  )!
  expect(JSON.parse(String(auditoria.dados)).recebimentosOriginais[0].valor).toBe(150)
})

it('aplica os dados antes de aguardar consultas auxiliares demoradas', async () => {
  await perfil('a')
  const c = repos.clientesRepo.create({ nome: 'Teste de latência', tratamento: '', ativo: true })
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('b')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  repos.clientesRepo.update(c.id, { nome: 'Alteração confirmada pela pessoa B' })
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem(false)).erro).toBeNull()
  await perfil('a')
  let liberar!: () => void
  reterControles = new Promise<void>((r) => {
    liberar = r
  })
  let concluiu = false
  const sincronizando = nuvem.sincronizarNuvem(false).then((s) => {
    concluiu = true
    return s
  })
  try {
    await expect
      .poll(() => repos.clientesRepo.get(c.id)?.nome)
      .toBe('Alteração confirmada pela pessoa B')
    expect(concluiu).toBe(false)
  } finally {
    reterControles = null
    liberar()
    expect((await sincronizando).erro).toBeNull()
  }
})
it('renova uma sessão expirada uma única vez para consultas concorrentes', async () => {
  const l = sql.get("SELECT valor FROM configuracoes WHERE chave='sessaoNuvem'")!
  const s = JSON.parse(Buffer.from(JSON.parse(String(l.valor)), 'base64').toString())
  s.expires_at = 0
  sql.run("UPDATE configuracoes SET valor=? WHERE chave='sessaoNuvem'", [
    JSON.stringify(Buffer.from(JSON.stringify(s)).toString('base64'))
  ])
  const antes = renovacoes
  await Promise.all([
    nuvem.pedidoNuvem('/rest/v1/rpc/gdo_contexto_v3', { p_criar: false }),
    nuvem.pedidoNuvem('/rest/v1/rpc/gdo_membros_v3', {}),
    nuvem.pedidoNuvem('/rest/v1/edicoes_documento?select=*')
  ])
  expect(renovacoes - antes).toBe(1)
})

it('confirma a referência do relatório criado offline antes da numeração da proposta', async () => {
  await perfil('a')
  offline = true
  const p = repos.orcamentosRepo.create({
    data: '2026-10-12',
    destinatario: 'Origem offline',
    formato: 'carta',
    titulo: 'Proposta',
    itensServico: [],
    materiais: [],
    observacoes: [],
    pagamentos: [],
    anexos: [],
    valorTotal: 0,
    status: 'rascunho'
  })
  const rel = repos.relatoriosRepo.criarDeOrcamento(p.id)!
  expect(p.numero).toBeLessThan(0)
  expect(rel.origemOrcamento?.numero).toBe(p.numero)
  offline = false
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  const confirmado = repos.orcamentosRepo.get(p.id)!
  expect(confirmado.numero).toBeGreaterThan(0)
  expect(repos.relatoriosRepo.get(rel.id)?.origemOrcamento?.numero).toBe(confirmado.numero)
  const local = JSON.parse(
    String(
      sql.get(
        "SELECT documento FROM versoes WHERE tipo='relatorio' AND documento_id=? ORDER BY numero DESC LIMIT 1",
        [rel.id]
      )?.documento
    )
  )
  expect(local.origemOrcamento.numero).toBe(confirmado.numero)
  await colaboracao.autorizarGravacao('relatorio', rel.id)
  repos.relatoriosRepo.update(rel.id, { introducao: 'Atualização posterior à numeração' })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('b')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(repos.relatoriosRepo.get(rel.id)?.origemOrcamento?.numero).toBe(confirmado.numero)
})

it('não reenfileira cadastros recebidos quando o JSON remoto muda a ordem das propriedades', async () => {
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(sql.get('SELECT COUNT(*) AS n FROM fila_nuvem')?.n).toBe(0)
  nuvem.capturarCadastros()
  expect(sql.get('SELECT COUNT(*) AS n FROM fila_nuvem')?.n).toBe(0)
  const c = repos.clientesRepo.list()[0]
  sql.run('UPDATE clientes SET contato=? WHERE id=?', ['Contato alterado localmente', c.id])
  nuvem.capturarCadastros()
  expect(
    sql.get('SELECT COUNT(*) AS n FROM fila_nuvem WHERE entidade=?', [`clientes:${c.id}`])?.n
  ).toBe(1)
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
})

function simularContextoAnterior(): void {
  const c = JSON.parse(
    String(sql.get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")?.valor)
  )
  c.protocolo = 2
  sql.run("UPDATE configuracoes SET valor=? WHERE chave='contextoNuvem'", [JSON.stringify(c)])
}
async function repetirCliente(id: string, grupo = randomUUID(), nome?: string) {
  const { enfileirar } = await import('../versoes')
  const row = { ...sql.get('SELECT * FROM clientes WHERE id=?', [id])! }
  if (nome) {
    row.nome = nome
    sql.run('UPDATE clientes SET nome=? WHERE id=?', [nome, id])
  }
  const json = JSON.parse(String(row.dados_json))
  row.dados_json = JSON.stringify(Object.fromEntries(Object.entries(json).reverse()), null, 2)
  enfileirar(`clientes:${id}`, { tabela: 'clientes', id, row })
  sql.run('UPDATE fila_nuvem SET grupo=? WHERE entidade=?', [grupo, `clientes:${id}`])
}
it('recupera 37 pendências equivalentes do protocolo anterior sem republicar dados', async () => {
  await perfil('a')
  const ids = Array.from(
    { length: 37 },
    (_, i) =>
      repos.clientesRepo.create({ nome: `Cliente replica ${i}`, tratamento: 'A', ativo: true }).id
  )
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('b')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  for (const id of ids) await repetirCliente(id)
  expect(sql.get('SELECT COUNT(*) AS n FROM fila_nuvem')?.n).toBe(37)
  simularContextoAnterior()
  const antes = lotesPublicados
  const s = await nuvem.conectarNuvem({ ...config, email: 'b@example.com' }, 'teste', 'baixar')
  expect(s.erro).toBeNull()
  expect(s.protocolo).toBe(3)
  expect(s.pendentes).toBe(0)
  expect(lotesPublicados).toBe(antes)
  const arquivo = sql.get(
    "SELECT dados FROM auditoria_colaboracao WHERE acao='numeracao:pendencias-anteriores' ORDER BY criado_em DESC LIMIT 1"
  )!
  expect(JSON.parse(String(arquivo.dados)).fila).toHaveLength(37)
  expect(s.backupAtualizacao).toBeTruthy()
  nuvem.capturarCadastros()
  expect(nuvem.statusNuvem().pendentes).toBe(0)
})
it('preserva pendência diferente na fila e no backup, sem publicar a alteração antiga', async () => {
  const c = repos.clientesRepo.list()[0]
  const original = c.nome
  await repetirCliente(c.id, randomUUID(), 'Alteração local antiga preservada')
  const operacao = sql.get('SELECT * FROM fila_nuvem')!
  simularContextoAnterior()
  const s = await nuvem.conectarNuvem({ ...config, email: 'b@example.com' }, 'teste', 'baixar')
  expect(s.autenticada).toBe(true)
  expect(s.atualizacaoPendente?.divergentes).toBe(1)
  expect(sql.get('SELECT COUNT(*) AS n FROM fila_nuvem')?.n).toBe(1)
  const antes = lotesPublicados
  const atualizado = await nuvem.finalizarAtualizacaoNumeracao(s.atualizacaoPendente!.revisao)
  expect(atualizado.erro).toBeNull()
  expect(atualizado.pendentes).toBe(0)
  expect(atualizado.pendenciasPreservadas).toBe(1)
  expect(sql.get('SELECT * FROM fila_nuvem WHERE id=?', [operacao.id])).toEqual({
    ...operacao,
    estado: 'preservada'
  })
  expect(repos.clientesRepo.get(c.id)?.nome).toBe(original)
  expect(lotesPublicados).toBe(antes)
  const { Database } = await import('node-sqlite3-wasm')
  const backup = new Database(atualizado.backupAtualizacao!)
  try {
    const a = backup.all(
      "SELECT dados FROM auditoria_colaboracao WHERE acao='numeracao:pendencias-anteriores'"
    ) as Array<{ dados: string }>
    expect(
      a.some((l) => JSON.parse(l.dados).fila.some((p: { id: string }) => p.id === operacao.id))
    ).toBe(true)
    expect(backup.get("SELECT 1 FROM configuracoes WHERE chave='sessaoNuvem'")).toBeNull()
  } finally {
    backup.close()
  }
})
it('não retira parte de grupo que contém documento e recusa decisão desatualizada', async () => {
  const c = repos.clientesRepo.list()[1],
    grupo = randomUUID()
  await repetirCliente(c.id, grupo)
  const { enfileirar, pacoteDocumento } = await import('../versoes')
  const d = repos.orcamentosRepo.list()[0]
  enfileirar(`orcamento:${d.id}`, pacoteDocumento('orcamento', d.id))
  sql.run('UPDATE fila_nuvem SET grupo=? WHERE entidade=?', [grupo, `orcamento:${d.id}`])
  simularContextoAnterior()
  const s = await nuvem.conectarNuvem({ ...config, email: 'b@example.com' }, 'teste', 'baixar')
  expect(s.atualizacaoPendente?.equivalentes).toBe(0)
  const fila = sql.all('SELECT * FROM fila_nuvem ORDER BY rowid')
  await expect(nuvem.finalizarAtualizacaoNumeracao('revisao-antiga')).rejects.toThrow('conferência')
  await expect(nuvem.finalizarAtualizacaoNumeracao(s.atualizacaoPendente!.revisao)).rejects.toThrow(
    'documentos ou pagamentos'
  )
  expect(sql.all('SELECT * FROM fila_nuvem ORDER BY rowid')).toEqual(fila)
})
it('equivalência aceita ordem de propriedades e preserva ordem de listas e tipos', async () => {
  const { conteudoEquivalente } = await import('../pendencias-anteriores')
  expect(
    conteudoEquivalente({ dados_json: '{"a":1,"b":2}' }, { dados_json: '{ "b": 2, "a": 1 }' })
  ).toBe(true)
  expect(conteudoEquivalente({ valor: '[1,2]' }, { valor: '[2,1]' })).toBe(false)
  expect(conteudoEquivalente({ nome: '1' }, { nome: 1 })).toBe(false)
})
it('falha de backup ou conta de outra empresa não remove a fila antiga', async () => {
  await perfil('a')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  const c = repos.clientesRepo.list()[0]
  await repetirCliente(c.id)
  simularContextoAnterior()
  const fila = sql.all('SELECT * FROM fila_nuvem ORDER BY rowid')
  const dados = await import('../dados')
  const falha = vi.spyOn(dados, 'exportarDadosPara').mockImplementation(() => {
    throw new Error('Não foi possível verificar o backup.')
  })
  try {
    await expect(nuvem.conectarNuvem(config, 'teste', 'baixar')).rejects.toThrow('backup')
    expect(sql.all('SELECT * FROM fila_nuvem ORDER BY rowid')).toEqual(fila)
  } finally {
    falha.mockRestore()
  }
  sql.run("UPDATE configuracoes SET valor=? WHERE chave='empresaNuvem'", [
    JSON.stringify(randomUUID())
  ])
  try {
    await expect(nuvem.conectarNuvem(config, 'teste', 'baixar')).rejects.toThrow('outra empresa')
    expect(sql.all('SELECT * FROM fila_nuvem ORDER BY rowid')).toEqual(fila)
  } finally {
    sql.run("UPDATE configuracoes SET valor=? WHERE chave='empresaNuvem'", [
      JSON.stringify(empresa)
    ])
  }
  expect((await nuvem.conectarNuvem(config, 'teste', 'baixar')).erro).toBeNull()
})
it('uma falha de envio não bloqueia outros cadastros nem as alterações recebidas, e o reenvio mantém a identidade', async () => {
  await perfil('falha-a')
  expect((await nuvem.conectarNuvem(config, 'teste', 'baixar')).erro).toBeNull()
  const falho = repos.clientesRepo.create({
    nome: 'Cliente com envio recusado',
    tratamento: '',
    ativo: true
  })
  const independente = repos.clientesRepo.create({
    nome: 'Envio independente',
    tratamento: '',
    ativo: true
  })
  nuvem.capturarCadastros()
  recusarEntidade = `clientes:${falho.id}`
  const op = sql.get('SELECT id,base,payload,grupo FROM fila_nuvem WHERE entidade=?', [
    recusarEntidade
  ])!
  const status = await nuvem.sincronizarNuvem()
  expect(status.falhas).toHaveLength(1)
  expect(status.falhas![0].detalhe).toContain('Salvar cliente')
  expect(status.falhas![0].detalhe).not.toContain('Atualize a configuração do banco')
  expect(status.pendentes).toBe(1)
  expect(
    sql.get('SELECT 1 FROM fila_nuvem WHERE entidade=?', [`clientes:${independente.id}`])
  ).toBeNull()
  await perfil('falha-b')
  expect(
    (await nuvem.conectarNuvem({ ...config, email: 'b@example.com' }, 'teste', 'baixar')).erro
  ).toBeNull()
  const recebido = repos.clientesRepo.create({
    nome: 'Alteração recebida durante falha',
    tratamento: '',
    ativo: true
  })
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await perfil('falha-a')
  await nuvem.sincronizarNuvem()
  expect(repos.clientesRepo.get(recebido.id)?.nome).toBe(recebido.nome)
  expect(sql.get('SELECT id,base,payload,grupo FROM fila_nuvem WHERE id=?', [op.id])).toEqual(op)
  recusarEntidade = null
  expect((await nuvem.repetirOperacaoNuvem(String(op.id))).erro).toBeNull()
  expect(sql.get('SELECT 1 FROM fila_nuvem WHERE id=?', [op.id])).toBeNull()
  await perfil('falha-b')
  await nuvem.sincronizarNuvem()
  expect(repos.clientesRepo.get(falho.id)?.nome).toBe(falho.nome)
})
it('recupera a exclusão row:null já pendente mesmo sem atualizar a função da nuvem', async () => {
  const c = repos.clientesRepo.create({
    nome: 'Teste de exclusão legada',
    tratamento: '',
    ativo: true
  })
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  const base = Number(
    sql.get('SELECT revisao FROM sincronizacao WHERE entidade=?', [`clientes:${c.id}`])?.revisao
  )
  const func = (
    await pg.query<{ def: string }>(
      "SELECT pg_get_functiondef('sincronizacao.semantico(jsonb)'::regprocedure) def"
    )
  ).rows[0].def
  // Comparação antiga: row:null difere de row ausente. Exercita o adaptador
  // do aplicativo, sem depender da correção SQL de compatibilidade.
  await pg.exec(
    'RESET ROLE; CREATE OR REPLACE FUNCTION sincronizacao.semantico(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT p $$; SET ROLE authenticated;'
  )
  try {
    const { enfileirar } = await import('../versoes')
    repos.clientesRepo.remove(c.id)
    enfileirar(`clientes:${c.id}`, { tabela: 'clientes', id: c.id, row: null })
    const op = sql.get('SELECT * FROM fila_nuvem WHERE entidade=?', [`clientes:${c.id}`])!
    expect(op.base).toBe(base)
    expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
    expect(sql.get('SELECT 1 FROM fila_nuvem WHERE id=?', [op.id])).toBeNull()
    expect((await pg.query('SELECT id FROM clientes WHERE id=$1', [c.id])).rows).toEqual([])
  } finally {
    await pg.exec(`RESET ROLE; ${func}; SET ROLE authenticated;`)
  }
  await perfil('falha-a')
  await nuvem.sincronizarNuvem()
  expect(repos.clientesRepo.get(c.id)).toBeNull()
})
