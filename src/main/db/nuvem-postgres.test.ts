import { beforeAll, afterAll, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
let pg: PGlite
const usuario = randomUUID(),
  outro = randomUUID(),
  pc1 = randomUUID(),
  pc2 = randomUUID()
function cadastro(id: string, nome: string): unknown {
  return {
    tabela: 'clientes',
    id,
    row: {
      id,
      nome,
      tratamento: '',
      contato: null,
      observacao: null,
      ativo: 1,
      criado_em: '2026-10-12T00:00:00Z',
      dados_json: '{}'
    }
  }
}
function documento(id: string, numero: number, pc: string): Record<string, unknown> {
  return {
    id,
    tipo: 'orcamento',
    excluido: false,
    responsavel: pc,
    rows: {
      orcamentos: [
        {
          id,
          numero,
          data: '2026-10-12',
          cliente_id: null,
          destinatario: '',
          formato: 'carta',
          titulo: '',
          introducao: null,
          prazo_dias: null,
          observacao_interna: null,
          valor_total: 0,
          status: 'rascunho',
          criado_em: '2026-10-12T00:00:00Z',
          atualizado_em: '2026-10-12T00:00:00Z'
        }
      ],
      documento_meta: [
        {
          tipo: 'orcamento',
          documento_id: id,
          dados: JSON.stringify({ computadorResponsavel: pc })
        }
      ],
      itens_servico: [],
      materiais: [],
      orcamento_textos: [],
      anexos: [],
      versoes: []
    }
  }
}
async function conta(id: string): Promise<void> {
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function aplicar(
  entidade: string,
  base: number,
  payload: unknown,
  pc = pc1,
  id = randomUUID()
): Promise<{ ok: boolean; revisao: number }> {
  const r = await pg.query<{ r: { ok: boolean; revisao: number } }>(
    'select gdo_apply($1,$2,$3,$4,$5) as r',
    [id, entidade, base, JSON.stringify(payload), pc]
  )
  return r.rows[0].r
}
beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`
  )
  await pg.query('insert into auth.users values ($1),($2)', [usuario, outro])
  await pg.exec(readFileSync(resolve('supabase/schema.sql'), 'utf8'))
  await conta(usuario)
  await pg.query('select gdo_device($1,$2)', [pc1, 'Primeiro computador'])
  await pg.query('select gdo_device($1,$2)', [pc2, 'Segundo computador'])
}, 30000)
afterAll(async () => {
  await pg.close()
})
it('reserva faixas exclusivas de vinte números para dois computadores', async () => {
  const a = await pg.query<{ n: number }>("select gdo_reserve('orcamento',$1,0) as n", [pc1])
  const b = await pg.query<{ n: number }>("select gdo_reserve('orcamento',$1,0) as n", [pc2])
  expect(a.rows).toHaveLength(20)
  expect(b.rows[0].n).toBe(21)
})
it('é idempotente, rejeita revisão obsoleta e números de outro computador', async () => {
  const id = randomUUID(),
    entidade = `orcamento:${randomUUID()}`
  const payload = documento(entidade.slice('orcamento:'.length), 1, pc1)
  expect((await aplicar(entidade, 0, payload, pc1, id)).revisao).toBe(1)
  expect((await aplicar(entidade, 0, payload, pc1, id)).revisao).toBe(1)
  expect((await aplicar(entidade, 0, payload)).ok).toBe(false)
  const outroDoc = randomUUID()
  await expect(
    aplicar(`orcamento:${outroDoc}`, 0, documento(outroDoc, 1, pc2), pc2)
  ).rejects.toThrow('Numero nao reservado')
  await expect(aplicar(entidade, 1, { ...payload, responsavel: pc2 }, pc2)).rejects.toThrow(
    'outro computador'
  )
})
it('envia conjuntos de alterações atomicamente e preserva operações após reenvio', async () => {
  const clienteId = randomUUID(),
    e = `clientes:${clienteId}`,
    novoId = randomUUID()
  await aplicar(e, 0, cadastro(clienteId, 'original'))
  const ops = [
    {
      id: randomUUID(),
      entidade: `clientes:${novoId}`,
      base: 0,
      payload: cadastro(novoId, 'novo')
    },
    { id: randomUUID(), entidade: e, base: 0, payload: cadastro(clienteId, 'conflito') }
  ]
  const r = await pg.query<{ r: { ok: boolean } }>('select gdo_batch($1,$2) as r', [
    JSON.stringify(ops),
    pc1
  ])
  expect(r.rows[0].r.ok).toBe(false)
  expect(
    (await pg.query('select 1 from gdo_entities where entidade=$1', [ops[0].entidade])).rows
  ).toHaveLength(0)
})
it('isola empresas e impede leitura e escrita direta anônima', async () => {
  await conta(outro)
  await pg.exec('set role authenticated')
  expect((await pg.query('select * from gdo_entities')).rows).toHaveLength(0)
  await expect(
    pg.query(
      "insert into clientes (empresa_id,id,nome,campos_presentes) values ($1,'invasao','Invasão','{}')",
      [usuario]
    )
  ).rejects.toThrow('permission denied')
  await pg.exec('reset role;set role anon')
  await expect(pg.query('select * from gdo_entities')).rejects.toThrow('permission denied')
  await pg.exec('reset role')
  await conta(usuario)
})
it('transfere responsabilidade só na revisão sincronizada', async () => {
  const id = randomUUID(),
    e = `orcamento:${id}`
  await aplicar(e, 0, documento(id, 2, pc1))
  await pg.query('select gdo_device($1,$2)', [pc2, 'Segundo computador'])
  await expect(pg.query('select gdo_transfer($1,$2,$3,0)', [e, pc1, pc2])).rejects.toThrow(
    'Sincronize'
  )
  await pg.query('select gdo_transfer($1,$2,$3,1)', [e, pc1, pc2])
  const novo = (
    await pg.query<{ payload: { responsavel: string } }>(
      'select payload from gdo_entities where entidade=$1',
      [e]
    )
  ).rows[0].payload
  expect(novo.responsavel).toBe(pc2)
  expect((await aplicar(e, 2, documento(id, 2, pc2), pc2)).ok).toBe(true)
  await expect(aplicar(e, 3, documento(id, 2, pc1), pc1)).rejects.toThrow('outro computador')
})
