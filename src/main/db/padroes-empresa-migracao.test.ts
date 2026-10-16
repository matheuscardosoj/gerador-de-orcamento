import { afterAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const pg = new PGlite()
afterAll(() => pg.close())

it('cria padrões uma vez por empresa central e entrega o código do serviço na atualização incremental', async () => {
  const usuario = randomUUID(),
    empresa = randomUUID(),
    outro = randomUUID()
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await pg.query('INSERT INTO auth.users VALUES($1,$2),($3,$4)', [
    usuario,
    'a@teste.invalid',
    outro,
    'b@teste.invalid'
  ])
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.exec(readFileSync('supabase/central/001_servico_central.sql', 'utf8'))
  await pg.query('INSERT INTO empresas(id,nome) VALUES($1,$2)', [empresa, 'Isolada'])
  await pg.query(
    'INSERT INTO membros_empresa(empresa_id,usuario_id,nome,papel) VALUES($1,$2,$3,$4),($1,$5,$6,$7)',
    [empresa, usuario, 'A', 'administrador', outro, 'B', 'membro']
  )
  for (const tabela of ['observacoes_padrao', 'formas_pagamento_padrao'])
    expect(
      (await pg.query(`SELECT id FROM ${tabela} WHERE empresa_id=$1`, [empresa])).rows
    ).toHaveLength(1)
  const servico = randomUUID()
  await pg.query('INSERT INTO servicos(empresa_id,id,nome) VALUES($1,$2,$3)', [
    empresa,
    servico,
    'Serviço'
  ])
  const codigo = (
    await pg.query<{ codigo: number }>(
      'SELECT codigo FROM servicos WHERE empresa_id=$1 AND id=$2',
      [empresa, servico]
    )
  ).rows[0].codigo
  await pg.query(
    "INSERT INTO sincronizacao.entidades VALUES($1,$2,1,nextval('gdo_changes'),false)",
    [empresa, `servicos:${servico}`]
  )
  const original = (
    await pg.query<{ definicao: string }>(
      "SELECT pg_get_functiondef('sincronizacao.linhas(uuid,text,text,text)'::regprocedure) definicao"
    )
  ).rows[0].definicao
  const antigo = original.replace(/,\s*'codigo'\s*,\s*r\.codigo/, '')
  expect(antigo).not.toBe(original)
  await pg.exec(antigo)
  expect(
    (
      await pg.query<{ payload: { row: { codigo?: number } } }>(
        'SELECT sincronizacao.payload($1,$2) payload',
        [empresa, `servicos:${servico}`]
      )
    ).rows[0].payload.row.codigo
  ).toBeUndefined()
  const sql = readFileSync('supabase/migrations/007_padroes_empresa_e_codigo_servico.sql', 'utf8')
  await pg.exec(sql)
  await pg.exec(sql)
  const depois = (
    await pg.query<{ payload: { row: { codigo: number } } }>(
      'SELECT sincronizacao.payload($1,$2) payload',
      [empresa, `servicos:${servico}`]
    )
  ).rows[0].payload.row
  expect(depois.codigo).toBe(codigo)
  for (const tabela of ['observacoes_padrao', 'formas_pagamento_padrao'])
    expect(
      (await pg.query(`SELECT id FROM ${tabela} WHERE empresa_id=$1`, [empresa])).rows
    ).toHaveLength(1)
  await pg.query('DELETE FROM observacoes_padrao WHERE empresa_id=$1', [empresa])
  await pg.exec(sql)
  expect(
    (await pg.query('SELECT id FROM observacoes_padrao WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
}, 30000)
