import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const pg = new PGlite(),
  empresa = randomUUID(),
  segundo = randomUUID(),
  estranho = randomUUID(),
  pcA = randomUUID(),
  pcB = randomUUID()
const pacote = (id: string, n: number, pc = pcA) => ({
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
          descricao: 'Serviço',
          valor: 100,
          local: 'Rio Verde',
          formaPagamento: 'Pix',
          status: 'rascunho',
          quitacao: 'parcial',
          observacao: '',
          criadoEm: '2026-10-12',
          atualizadoEm: '2026-10-12'
        })
      }
    ],
    documento_meta: [
      {
        tipo: 'recibo',
        documento_id: id,
        dados: JSON.stringify({ computadorResponsavel: pc, versao: 1 })
      }
    ],
    recebimentos: [],
    versoes: []
  }
})
const usuario = async (id: string) => {
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function salvar(
  id: string,
  n = -1,
  base = 0,
  pc = pcA,
  op = randomUUID(),
  payload: unknown = pacote(id, n, pc)
) {
  return (
    await pg.query<{ r: { ok: boolean; numeros: Array<{ numero: number }> } }>(
      'SELECT gdo_batch_v3($1,$2) r',
      [JSON.stringify([{ id: op, entidade: `recibo:${id}`, base, payload }]), pc]
    )
  ).rows[0].r
}
beforeAll(async () => {
  await pg.exec(`CREATE SCHEMA auth;CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 INSERT INTO auth.users VALUES('${empresa}','a@teste.com'),('${segundo}','b@teste.com'),('${estranho}','outro@teste.com');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await usuario(empresa)
  await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await pg.query('SELECT gdo_device($1,$2)', [pcA, 'PC A'])
  await pg.query('SELECT gdo_bootstrap_numbers($1,$2)', [
    pcA,
    JSON.stringify([
      { tipo: 'recibo', numero: 4 },
      { tipo: 'recibo', numero: 9 }
    ])
  ])
  for (const [id, n] of [
    ['primeiro', 4],
    ['segundo', 9]
  ] as const) {
    const p = pacote(id, n)
    const doc = JSON.parse(p.rows.recibos[0].dados)
    const versao = {
      id: `v-${id}`,
      tipo: 'recibo',
      documento_id: id,
      numero: 1,
      anterior_id: null,
      criado_em: '2026-10-12',
      computador: 'PC A',
      descricao: 'Original',
      documento: JSON.stringify(doc)
    }
    const completo = { ...p, rows: { ...p.rows, versoes: [versao] } }
    await pg.query('SELECT gdo_apply($1,$2,0,$3,$4)', [
      randomUUID(),
      `recibo:${id}`,
      JSON.stringify(completo),
      pcA
    ])
  }
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.query('SELECT gdo_dispositivo_v2($1,$2)', [pcA, 'PC A'])
  await pg.query('SELECT gdo_membros_v2(NULL,$1,$2,NULL)', ['b@teste.com', 'Pessoa B'])
  await usuario(segundo)
  await pg.query('SELECT gdo_dispositivo_v2($1,$2)', [pcB, 'PC B'])
  await pg.exec('SET ROLE authenticated')
})
beforeEach(async () => {
  await usuario(empresa)
})
afterAll(async () => {
  await pg.close()
})
it('organiza a base, preserva os snapshots antigos e cria versões auditáveis', async () => {
  expect((await pg.query('SELECT numero,valor FROM recibos ORDER BY numero')).rows).toEqual([
    { numero: 1, valor: '100' },
    { numero: 2, valor: '100' }
  ])
  const originais = (
    await pg.query<{ documento: { numero: number } }>(
      'SELECT documento FROM versoes_documentos WHERE numero=1 ORDER BY documento_id'
    )
  ).rows
  expect(originais.map((v) => v.documento.numero)).toEqual([4, 9])
  expect((await pg.query('SELECT anterior,novo FROM mapa_numeracao ORDER BY novo')).rows).toEqual([
    { anterior: 4, novo: 1 },
    { anterior: 9, novo: 2 }
  ])
  expect(
    (
      await pg.query(
        "SELECT documento->>'numero' n FROM versoes_documentos WHERE numero=2 ORDER BY documento_id"
      )
    ).rows
  ).toEqual([{ n: '1' }, { n: '2' }])
  expect(
    (
      await pg.query<{ t: string | null }>(
        "SELECT to_regclass('public.identificadores_documento') t"
      )
    ).rows[0].t
  ).toBeNull()
  expect(
    (await pg.query<{ r: { proximoNumero: number } }>("SELECT gdo_numeracao_v3('recibo') r"))
      .rows[0].r.proximoNumero
  ).toBe(3)
})
it('atribui um único número compartilhado sem faixa por computador e aceita reenvio', async () => {
  const op = randomUUID()
  const a = await salvar('novo-a', -15, 0, pcA, op)
  expect(a.ok).toBe(true)
  expect((await salvar('novo-a', -15, 0, pcA, op)).numeros).toEqual(a.numeros)
  await usuario(segundo)
  const b = await salvar('novo-b', -19, 0, pcB)
  expect(b.numeros[0].numero).toBe(a.numeros[0].numero + 1)
})
it('não consome número quando o grupo falha por revisão ou validação', async () => {
  const antes = (
    await pg.query<{ r: { proximoNumero: number } }>("SELECT gdo_numeracao_v3('recibo') r")
  ).rows[0].r.proximoNumero
  const novo = {
    id: randomUUID(),
    entidade: 'recibo:falha',
    base: 0,
    payload: pacote('falha', -30)
  }
  const conflito = {
    id: randomUUID(),
    entidade: 'clientes:inexistente',
    base: 99,
    payload: { tabela: 'clientes', id: 'inexistente' }
  }
  expect(
    (
      await pg.query<{ r: { ok: boolean } }>('SELECT gdo_batch_v3($1,$2) r', [
        JSON.stringify([novo, conflito]),
        pcA
      ])
    ).rows[0].r.ok
  ).toBe(false)
  const invalido = pacote('invalido', -32)
  invalido.rows.recibos[0].dados = JSON.stringify({
    ...JSON.parse(invalido.rows.recibos[0].dados),
    valor: -1
  })
  await expect(salvar('invalido', -32, 0, pcA, randomUUID(), invalido)).rejects.toThrow()
  expect(
    (await pg.query<{ r: { proximoNumero: number } }>("SELECT gdo_numeracao_v3('recibo') r"))
      .rows[0].r.proximoNumero
  ).toBe(antes)
})
it('normaliza versões provisórias e mantém a versão publicada imutável', async () => {
  const p = pacote('provisorio', -89)
  const v = {
    id: randomUUID(),
    tipo: 'recibo',
    documento_id: 'provisorio',
    numero: 1,
    anterior_id: null,
    criado_em: '2026-10-12',
    computador: 'PC A',
    descricao: 'Offline',
    documento: p.rows.recibos[0].dados
  }
  const completo = { ...p, rows: { ...p.rows, versoes: [v] } }
  const r = await salvar('provisorio', -89, 0, pcA, randomUUID(), completo)
  expect(
    (
      await pg.query<{ documento: { numero: number } }>(
        'SELECT documento FROM versoes_documentos WHERE id=$1',
        [v.id]
      )
    ).rows[0].documento.numero
  ).toBe(r.numeros[0].numero)
})
it('bloqueia clientes antigos e não expõe dados a contas fora da empresa', async () => {
  await expect(pg.query('SELECT gdo_batch_v2($1,$2)', ['[]', pcA])).rejects.toThrow(
    'permission denied'
  )
  await expect(pg.query("SELECT gdo_reserve_v2('recibo',$1,0)", [pcA])).rejects.toThrow(
    'permission denied'
  )
  await usuario(estranho)
  await expect(pg.query('SELECT gdo_alteracoes_v3()')).rejects.toThrow('não está vinculada')
  expect((await pg.query('SELECT * FROM numeros_documentos')).rows).toHaveLength(0)
})
it('reexecuta a instalação sem renumerar de novo ou duplicar versões', async () => {
  await pg.exec('RESET ROLE')
  const antes = (await pg.query('SELECT * FROM versoes_documentos ORDER BY id')).rows
  const mapa = (await pg.query('SELECT * FROM mapa_numeracao ORDER BY documento_id')).rows
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  expect((await pg.query('SELECT * FROM versoes_documentos ORDER BY id')).rows).toEqual(antes)
  expect((await pg.query('SELECT * FROM mapa_numeracao ORDER BY documento_id')).rows).toEqual(mapa)
  await pg.exec('SET ROLE authenticated')
})
