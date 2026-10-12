import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const pg = new PGlite()
const a = randomUUID(),
  b = randomUUID(),
  outro = randomUUID(),
  pcA = randomUUID(),
  pcB = randomUUID()
const pacote = (id: string, n: number, pc = pcA, descricao = 'Serviço original') => ({
  tipo: 'recibo',
  id,
  responsavel: pc,
  excluido: false,
  rows: {
    recibos: [
      {
        id,
        numero: n,
        dados: JSON.stringify({
          id,
          numero: n,
          data: '2026-10-12',
          destinatario: 'Cliente',
          descricao,
          valor: 100,
          local: 'Rio Verde',
          formaPagamento: 'Pix',
          status: 'rascunho',
          quitacao: 'parcial',
          observacao: '',
          criadoEm: '2026-10-12T00:00:00Z',
          atualizadoEm: '2026-10-12T00:00:00Z'
        })
      }
    ],
    documento_meta: [
      { tipo: 'recibo', documento_id: id, dados: JSON.stringify({ computadorResponsavel: pc }) }
    ],
    versoes: [],
    recebimentos: []
  }
})
async function usuario(id: string) {
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function edicao(id: string, acao: string, pc = pcA, geracao?: number) {
  return (
    await pg.query<{ r: { geracao: number; podeEditar: boolean; offline: boolean } | null }>(
      'SELECT gdo_edicao_v2($1,$2,$3,$4,$5) AS r',
      ['recibo', id, pc, acao, geracao ?? null]
    )
  ).rows[0].r
}
async function gravar(
  id: string,
  numero: number,
  base: number,
  geracao?: number,
  pc = pcA,
  operacao = randomUUID()
) {
  return (
    await pg.query<{ r: { ok: boolean } }>('SELECT gdo_batch_v2($1,$2) AS r', [
      JSON.stringify([
        { id: operacao, entidade: `recibo:${id}`, base, payload: pacote(id, numero, pc), geracao }
      ]),
      pc
    ])
  ).rows[0].r
}
beforeAll(async () => {
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    INSERT INTO auth.users VALUES('${a}','a@example.com'),('${b}','b@example.com'),('${outro}','outro@example.com');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE SCHEMA realtime; CREATE TABLE realtime.avisos(payload jsonb,evento text,topico text,privado boolean);
    CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$INSERT INTO realtime.avisos VALUES($1,$2,$3,$4)$$;`)
  await usuario(a)
  await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await pg.query('SELECT gdo_device($1,$2)', [pcA, 'PC A'])
  await pg.query('SELECT gdo_bootstrap_numbers($1,$2)', [
    pcA,
    JSON.stringify([
      { tipo: 'recibo', numero: 4 },
      { tipo: 'recibo', numero: 6 }
    ])
  ])
  for (const [id, n] of [
    ['legado-4', 4],
    ['legado-6', 6]
  ] as const)
    await pg.query('SELECT gdo_apply($1,$2,0,$3,$4)', [
      randomUUID(),
      `recibo:${id}`,
      JSON.stringify(pacote(id, n)),
      pcA
    ])
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.query('SELECT gdo_dispositivo_v2($1,$2)', [pcA, 'PC A'])
  await pg.exec('SET ROLE authenticated')
})
beforeEach(async () => {
  await usuario(a)
})
afterAll(async () => {
  await pg.close()
})

it('migra IDs a partir de 1 sem alterar números, descrições ou valores da base', async () => {
  const ids = (
    await pg.query(
      'SELECT documento_id,id_interno FROM identificadores_documento ORDER BY id_interno'
    )
  ).rows
  expect(ids).toEqual([
    { documento_id: 'legado-4', id_interno: 1 },
    { documento_id: 'legado-6', id_interno: 2 }
  ])
  expect(
    (await pg.query('SELECT numero,descricao,valor FROM recibos ORDER BY numero')).rows
  ).toEqual([
    { numero: 4, descricao: 'Serviço original', valor: '100' },
    { numero: 6, descricao: 'Serviço original', valor: '100' }
  ])
})
it('vincula outro login à mesma empresa e isola usuários não vinculados', async () => {
  await pg.query('SELECT gdo_membros_v2(NULL,$1,$2,NULL)', ['b@example.com', 'Pessoa B'])
  await usuario(b)
  expect(
    (
      await pg.query<{ r: { empresaId: string; usuarioId: string } }>(
        'SELECT gdo_contexto_v2() AS r'
      )
    ).rows[0].r
  ).toMatchObject({ empresaId: a, usuarioId: b })
  expect((await pg.query('SELECT id FROM recibos')).rows).toHaveLength(2)
  await pg.query('SELECT gdo_dispositivo_v2($1,$2)', [pcB, 'PC B'])
  await usuario(outro)
  expect((await pg.query('SELECT id FROM recibos')).rows).toHaveLength(0)
  await expect(pg.query('SELECT gdo_contexto_v2()')).rejects.toThrow('não está vinculada')
})
it('mantém bloqueio online, geração e exclusividade da preparação offline', async () => {
  const lock = await edicao('legado-4', 'adquirir')
  expect(lock?.podeEditar).toBe(true)
  expect((await edicao('legado-4', 'adquirir'))?.geracao).toBe(lock?.geracao)
  await edicao('legado-4', 'offline')
  await usuario(b)
  await expect(edicao('legado-4', 'adquirir', pcB)).rejects.toThrow('outro usuário')
  const recuperada = await edicao('legado-4', 'recuperar', pcB)
  await usuario(a)
  await expect(gravar('legado-4', 4, 1, lock?.geracao)).rejects.toThrow('revogada')
  await usuario(b)
  expect((await gravar('legado-4', 4, 1, recuperada?.geracao, pcB)).ok).toBe(true)
})
it('usa operações idempotentes e não duplica IDs ou auditoria ao reenviar', async () => {
  const numeros = (
    await pg.query<{ n: number }>('SELECT gdo_reserve_v2($1,$2,0) AS n', ['recibo', pcA])
  ).rows
  const op = randomUUID()
  expect((await gravar('novo', numeros[0].n, 0, undefined, pcA, op)).ok).toBe(true)
  expect((await gravar('novo', numeros[0].n, 0, undefined, pcA, op)).ok).toBe(true)
  expect(
    (
      await pg.query('SELECT id_interno FROM identificadores_documento WHERE documento_id=$1', [
        'novo'
      ])
    ).rows
  ).toEqual([{ id_interno: 3 }])
  expect(
    (await pg.query("SELECT id FROM auditoria_colaboracao WHERE dados->>'operacao'=$1", [op])).rows
  ).toHaveLength(1)
  await pg.exec('RESET ROLE')
  try {
    const eventos = (await pg.query<{ n: number }>('SELECT count(*) AS n FROM realtime.avisos'))
      .rows[0]
    expect(Number(eventos.n)).toBeGreaterThan(0)
  } finally {
    await pg.exec('SET ROLE authenticated')
  }
})
it('bloqueia gravações pelo protocolo antigo e alterações diretas nas tabelas', async () => {
  await expect(
    pg.query('SELECT gdo_apply($1,$2,0,$3,$4)', [
      randomUUID(),
      'recibo:inválido',
      JSON.stringify(pacote('inválido', 88)),
      pcA
    ])
  ).rejects.toThrow('permission denied')
  await expect(pg.query('UPDATE recibos SET valor=1')).rejects.toThrow('permission denied')
})
it('impede retirar o último membro e mudar a sequência para números reservados', async () => {
  await pg.query('SELECT gdo_membros_v2($1,NULL,NULL,false)', [b])
  await expect(pg.query('SELECT gdo_membros_v2($1,NULL,NULL,false)', [a])).rejects.toThrow(
    'último membro'
  )
  await expect(pg.query('SELECT gdo_numeracao_v2($1,1)', ['recibo'])).rejects.toThrow('reservados')
  expect(
    (
      await pg.query<{ r: { proximoNumero: number } }>('SELECT gdo_numeracao_v2($1,100) AS r', [
        'recibo'
      ])
    ).rows[0].r.proximoNumero
  ).toBe(100)
})
