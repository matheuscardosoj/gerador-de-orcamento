// Dois perfis SQLite independentes e as funções reais PostgreSQL, com transporte
// REST simulado para exercer interrupções/reenvios sem usar contas ou dados reais.
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Orcamento } from '@shared/types'
const raiz = mkdtempSync(join(tmpdir(), 'gdo-dois-perfis-'))
let perfil = join(raiz, 'pc1')
vi.mock('electron', () => ({
  app: { getPath: () => perfil, isPackaged: false, getAppPath: () => perfil },
  dialog: {},
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))
const pg = new PGlite()
const usuario = '11111111-1111-4111-8111-111111111111'
let offline = false,
  perderResposta = false
let perderTransferencia = false
let sql: typeof import('./sqlite'),
  repos: typeof import('../repositories'),
  nuvem: typeof import('../nuvem')
const config = {
  url: 'https://teste.supabase.co',
  chavePublica: 'sb_publishable_teste',
  email: 'teste@example.com'
}
let proposta: Orcamento
async function trocar(pc: string): Promise<void> {
  sql.fecharBanco()
  perfil = join(raiz, pc)
  sql.abrirBanco()
  if (repos.bancoVazio()) repos.semear()
}
beforeAll(async () => {
  await pg.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${usuario}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    select set_config('request.jwt.claim.sub','${usuario}',false);`)
  await pg.exec(readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8'))
  vi.stubGlobal('fetch', async (url: string, options: RequestInit = {}) => {
    if (offline) throw new Error('Sem conexão de teste')
    const u = new URL(url),
      body = options.body ? JSON.parse(String(options.body)) : {}
    let result: unknown
    if (u.pathname === '/auth/v1/token')
      result = {
        access_token: 'teste',
        refresh_token: 'teste',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: usuario }
      }
    else if (u.pathname === '/rest/v1/gdo_entities') {
      const entidade = u.searchParams.get('entidade')?.slice(3)
      const seq = Number(u.searchParams.get('sequencia')?.slice(3) ?? 0)
      result = entidade
        ? (await pg.query('select * from gdo_entities where entidade=$1', [entidade])).rows
        : (
            await pg.query(
              'select * from gdo_entities where sequencia>$1 order by sequencia limit $2',
              [seq, Number(u.searchParams.get('limit') ?? 50)]
            )
          ).rows
    } else if (u.pathname === '/rest/v1/gdo_devices')
      result = (await pg.query('select id,nome from gdo_devices')).rows
    else {
      const fn = u.pathname.split('/').at(-1)
      if (fn === 'gdo_device') {
        await pg.query('select gdo_device($1,$2)', [body.p_dispositivo, body.p_nome])
        result = null
      } else if (fn === 'gdo_bootstrap_numbers') {
        await pg.query('select gdo_bootstrap_numbers($1,$2)', [
          body.p_dispositivo,
          JSON.stringify(body.p_numeros)
        ])
        result = null
      } else if (fn === 'gdo_reserve')
        result = (
          await pg.query<{ n: number }>('select gdo_reserve($1,$2,$3) as n', [
            body.p_tipo,
            body.p_dispositivo,
            body.p_minimo
          ])
        ).rows.map((r) => r.n)
      else if (fn === 'gdo_batch') {
        result = (
          await pg.query<{ r: unknown }>('select gdo_batch($1,$2) as r', [
            JSON.stringify(body.p_operacoes),
            body.p_dispositivo
          ])
        ).rows[0].r
        if (perderResposta) {
          perderResposta = false
          throw new Error('Resposta perdida após gravação')
        }
      } else if (fn === 'gdo_usage') result = 123456
      else if (fn === 'gdo_transfer') {
        await pg.query('select gdo_transfer($1,$2,$3,$4)', [
          body.p_entidade,
          body.p_origem,
          body.p_destino,
          body.p_revisao
        ])
        if (perderTransferencia) {
          perderTransferencia = false
          offline = true
          throw new Error('Transferência gravada sem resposta')
        }
        result = null
      } else throw new Error(`Endpoint de teste desconhecido: ${u.pathname}`)
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  sql = await import('./sqlite')
  repos = await import('../repositories')
  nuvem = await import('../nuvem')
  await trocar('pc1')
})
afterAll(async () => {
  sql.fecharBanco()
  await pg.close()
  vi.unstubAllGlobals()
  rmSync(raiz, { recursive: true, force: true })
})
it('publica e baixa uma base com cliente alterado após a proposta, preservando os snapshots', async () => {
  const c = repos.clientesRepo.create({ nome: 'Nome original', tratamento: '', ativo: true })
  proposta = repos.orcamentosRepo.create({
    data: '2026-10-11',
    clienteId: c.id,
    destinatario: c.nome,
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
  expect((await nuvem.conectarNuvem(config, 'senha-de-teste', 'publicar')).erro).toBeNull()
  repos.clientesRepo.update(c.id, { nome: 'Nome atual' })
  nuvem.capturarCadastros()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await trocar('pc2')
  expect((await nuvem.conectarNuvem(config, 'senha-de-teste', 'baixar')).erro).toBeNull()
  expect(repos.clientesRepo.get(c.id)?.nome).toBe('Nome atual')
  expect(repos.orcamentosRepo.get(proposta.id)?.clienteSnapshot?.nome).toBe('Nome original')
  expect(() => repos.orcamentosRepo.update(proposta.id, { titulo: 'Edição indevida' })).toThrow(
    'outro computador'
  )
  const copia = repos.orcamentosRepo.duplicate(proposta.id)!
  expect(copia.numero).toBeGreaterThan(20)
  expect(copia.clienteSnapshot?.nome).toBe('Nome original')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
})
it('preserva a fila após reinício offline e reenvia uma operação sem duplicá-la', async () => {
  await trocar('pc1')
  offline = true
  const novo = repos.orcamentosRepo.update(proposta.id, { titulo: 'Alterado offline' })!
  const pendentes = nuvem.statusNuvem().pendentes
  expect(pendentes).toBeGreaterThan(0)
  await trocar('pc1')
  expect(nuvem.statusNuvem().pendentes).toBe(pendentes)
  expect(repos.orcamentosRepo.get(proposta.id)?.titulo).toBe(novo.titulo)
  expect((await nuvem.sincronizarNuvem()).erro).toContain('Sem conexão')
  offline = false
  perderResposta = true
  expect((await nuvem.sincronizarNuvem()).pendentes).toBe(pendentes)
  expect((await nuvem.sincronizarNuvem()).pendentes).toBe(0)
  const rows = (
    await pg.query('select * from gdo_entities where entidade=$1', [`orcamento:${proposta.id}`])
  ).rows
  expect(rows).toHaveLength(1)
  await trocar('pc2')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(repos.orcamentosRepo.get(proposta.id)?.titulo).toBe('Alterado offline')
})
it('transfere e permite que o novo responsável edite sem reutilizar números', async () => {
  const pc2 = nuvem.statusNuvem().computador
  await trocar('pc1')
  await nuvem.transferirDocumento('orcamento', proposta.id, pc2)
  expect(() =>
    repos.orcamentosRepo.update(proposta.id, { titulo: 'Edição do antigo dono' })
  ).toThrow('outro computador')
  await trocar('pc2')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  repos.orcamentosRepo.update(proposta.id, { titulo: 'Edição do novo responsável' })
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
})
it('bloqueia o antigo computador após interrupção da transferência, inclusive após reinício', async () => {
  await trocar('pc1')
  const pc1 = nuvem.statusNuvem().computador
  await trocar('pc2')
  perderTransferencia = true
  await expect(nuvem.transferirDocumento('orcamento', proposta.id, pc1)).rejects.toThrow(
    'Sem conexão'
  )
  await trocar('pc2')
  expect(() => repos.orcamentosRepo.update(proposta.id, { titulo: 'Inválido offline' })).toThrow(
    'transferência'
  )
  offline = false
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(() => repos.orcamentosRepo.update(proposta.id, { titulo: 'Inválido online' })).toThrow(
    'outro computador'
  )
})
it('sincroniza recebimento e saldo na mesma operação sem duplicar após perder a resposta', async () => {
  await trocar('pc1')
  await nuvem.sincronizarNuvem()
  const p = repos.orcamentosRepo.update(proposta.id, {
    itensServico: [
      {
        id: 'servico-recebido',
        descricao: 'Serviço',
        unidade: 'un',
        quantidade: 1,
        valorUnitario: 1000,
        valorTotal: 1000
      }
    ],
    valorTotal: 1000
  })!
  const rel = repos.relatoriosRepo.criarDeOrcamento(p.id)!
  const { recibosRepo } = await import('../recibos')
  const r = recibosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente',
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
  recibosRepo.confirmar(r.id)
  perderResposta = true
  expect((await nuvem.sincronizarNuvem()).erro).toContain('Resposta perdida')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await trocar('pc2')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  expect(recibosRepo.get(r.id)?.status).toBe('recebido')
  expect(sql.get('SELECT COUNT(*) AS n FROM recebimentos WHERE recibo_id=?', [r.id])?.n).toBe(1)
})
it('preserva as duas edições de cadastro em conflito até conciliação explícita', async () => {
  await trocar('pc1')
  const c = repos.clientesRepo.list()[0]
  repos.clientesRepo.update(c.id, { nome: 'Alteração remota' })
  nuvem.capturarCadastros()
  await nuvem.sincronizarNuvem()
  await trocar('pc2')
  repos.clientesRepo.update(c.id, { nome: 'Alteração local' })
  nuvem.capturarCadastros()
  const status = await nuvem.sincronizarNuvem()
  expect(status.conflitos).toHaveLength(1)
  expect(repos.clientesRepo.get(c.id)?.nome).toBe('Alteração local')
  await nuvem.aplicarConflito(status.conflitos[0].id)
  expect(repos.clientesRepo.get(c.id)?.nome).toBe('Alteração remota')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
})

it('concilia conflito financeiro sem publicar saldo ou pagamento de uma operação descartada', async () => {
  await trocar('pc1')
  await nuvem.sincronizarNuvem()
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta.id)!
  const { recibosRepo } = await import('../recibos')
  const novo = () =>
    recibosRepo.create({
      data: '2026-10-11',
      destinatario: 'Cliente',
      descricao: 'Serviço',
      valor: 100,
      local: 'Rio Verde',
      formaPagamento: 'Pix',
      status: 'pendente',
      quitacao: 'parcial',
      observacao: '',
      origemTipo: 'relatorio',
      origemId: rel.id
    })
  const r = novo()
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  recibosRepo.confirmar(r.id)
  const naoEnviado = novo()
  recibosRepo.confirmar(naoEnviado.id)
  await pg.query(
    "update gdo_entities set revisao=revisao+1,sequencia=nextval('gdo_changes') where entidade=$1",
    [`relatorio:${rel.id}`]
  )
  const conflito = await nuvem.sincronizarNuvem()
  expect(conflito.conflitos).toHaveLength(1)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  await nuvem.aplicarConflito(conflito.conflitos[0].id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
  expect(recibosRepo.get(r.id)?.status).toBe('pendente')
  expect(recibosRepo.get(naoEnviado.id)).toBeNull()
  expect(sql.get('SELECT count(*) AS n FROM recebimentos WHERE relatorio_id=?', [rel.id])?.n).toBe(
    0
  )
  expect(readdirSync(sql.pastaDados()).some((n) => n.startsWith('antes-conciliacao-'))).toBe(true)
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  await trocar('pc2')
  expect((await nuvem.sincronizarNuvem()).erro).toBeNull()
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
  expect(recibosRepo.get(r.id)?.status).toBe('pendente')
})
