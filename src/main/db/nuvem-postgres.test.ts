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
  const payload = { responsavel: pc1, tipo: 'orcamento', rows: { orcamentos: [{ numero: 1 }] } }
  expect((await aplicar(entidade, 0, payload, pc1, id)).revisao).toBe(1)
  expect((await aplicar(entidade, 0, payload, pc1, id)).revisao).toBe(1)
  expect((await aplicar(entidade, 0, payload)).ok).toBe(false)
  await expect(
    aplicar(`orcamento:${randomUUID()}`, 0, { ...payload, responsavel: pc2 }, pc2)
  ).rejects.toThrow('Numero nao reservado')
  await expect(aplicar(entidade, 1, { ...payload, responsavel: pc2 }, pc2)).rejects.toThrow(
    'outro computador'
  )
})
it('envia conjuntos de alterações atomicamente e preserva operações após reenvio', async () => {
  const e = `clientes:${randomUUID()}`
  await aplicar(e, 0, { nome: 'original' })
  const ops = [
    { id: randomUUID(), entidade: `clientes:${randomUUID()}`, base: 0, payload: { nome: 'novo' } },
    { id: randomUUID(), entidade: e, base: 0, payload: { nome: 'conflito' } }
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
    pg.query("insert into gdo_entities values ($1,'clientes:invasao',1,'{}',1)", [usuario])
  ).rejects.toThrow('permission denied')
  await pg.exec('reset role;set role anon')
  await expect(pg.query('select * from gdo_entities')).rejects.toThrow('permission denied')
  await pg.exec('reset role')
  await conta(usuario)
})
it('transfere responsabilidade só na revisão sincronizada', async () => {
  const id = randomUUID(),
    e = `orcamento:${id}`,
    meta = {
      tipo: 'orcamento',
      documento_id: id,
      dados: JSON.stringify({ computadorResponsavel: pc1 })
    }
  await aplicar(e, 0, {
    responsavel: pc1,
    tipo: 'orcamento',
    rows: { orcamentos: [{ numero: 2 }], documento_meta: [meta] }
  })
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
  expect(
    (
      await aplicar(
        e,
        2,
        { ...novo, tipo: 'orcamento', rows: { orcamentos: [{ numero: 2 }] } },
        pc2
      )
    ).ok
  ).toBe(true)
  await expect(
    aplicar(
      e,
      3,
      { responsavel: pc1, tipo: 'orcamento', rows: { orcamentos: [{ numero: 2 }] } },
      pc1
    )
  ).rejects.toThrow('outro computador')
})
