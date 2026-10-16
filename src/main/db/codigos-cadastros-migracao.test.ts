import { afterEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const abertos: PGlite[] = []
async function legado(): Promise<{ pg: PGlite; empresa: string; usuario: string }> {
  const pg = new PGlite()
  abertos.push(pg)
  const empresa = randomUUID()
  const usuario = randomUUID()
  await pg.exec(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.empresas(id uuid PRIMARY KEY);
    CREATE TABLE public.codigos_cadastros(
      empresa_id uuid NOT NULL REFERENCES auth.users(id),
      tipo text NOT NULL, codigo bigint NOT NULL, cadastro_id text NOT NULL,
      PRIMARY KEY(empresa_id,tipo,codigo));`)
  await pg.query('INSERT INTO auth.users(id) VALUES($1)', [usuario])
  await pg.query('INSERT INTO public.empresas(id) VALUES($1)', [empresa])
  return { pg, empresa, usuario }
}

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((pg) => pg.close()))
})

it('troca a FK legada sem alterar códigos e aceita empresa distinta do usuário', async () => {
  const { pg, empresa, usuario } = await legado()
  await pg.query('INSERT INTO public.empresas(id) VALUES($1)', [usuario])
  await pg.query("INSERT INTO public.codigos_cadastros VALUES($1,'cliente',1,'existente')", [
    usuario
  ])
  const migracao = readFileSync('supabase/migrations/006_corrigir_fk_codigos_cadastros.sql', 'utf8')
  await pg.exec(migracao)
  await pg.exec(migracao)
  await pg.query("INSERT INTO public.codigos_cadastros VALUES($1,'servico',2,'novo')", [empresa])
  expect(
    (
      await pg.query<{ cadastro_id: string }>(
        'SELECT cadastro_id FROM public.codigos_cadastros ORDER BY codigo'
      )
    ).rows.map((r) => r.cadastro_id)
  ).toEqual(['existente', 'novo'])
  expect(
    (
      await pg.query<{ tabela: string }>(`SELECT confrelid::regclass::text tabela FROM pg_constraint
      WHERE conname='codigos_cadastros_empresa_id_fkey'`)
    ).rows[0].tabela
  ).toBe('empresas')
})

it('aborta sem apagar códigos quando há empresa órfã', async () => {
  const { pg, empresa } = await legado()
  await pg.query('INSERT INTO auth.users(id) VALUES($1)', [empresa])
  await pg.query("INSERT INTO public.codigos_cadastros VALUES($1,'cliente',4,'orfao')", [empresa])
  await pg.query('DELETE FROM public.empresas WHERE id=$1', [empresa])
  await expect(
    pg.exec(readFileSync('supabase/migrations/006_corrigir_fk_codigos_cadastros.sql', 'utf8'))
  ).rejects.toThrow('empresas inexistentes')
  await pg.exec('ROLLBACK')
  expect((await pg.query('SELECT * FROM public.codigos_cadastros')).rows).toHaveLength(1)
})

it('instala a migração 004 após o esquema central com FK da empresa', async () => {
  const pg = new PGlite()
  abertos.push(pg)
  const usuario = randomUUID()
  const empresa = randomUUID()
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE ROLE service_role; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await pg.query('INSERT INTO auth.users VALUES($1,$2)', [usuario, 'usuario@teste.invalid'])
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.exec(readFileSync('supabase/central/001_servico_central.sql', 'utf8'))
  await pg.query('INSERT INTO public.empresas(id,nome) VALUES($1,$2)', [empresa, 'Teste'])
  await pg.exec('DROP TABLE public.codigos_cadastros')
  await pg.exec(readFileSync('supabase/migrations/004_codigos_cadastros.sql', 'utf8'))
  await pg.query("INSERT INTO public.codigos_cadastros VALUES($1,'cliente',1,'novo',now())", [
    empresa
  ])
  expect(
    (
      await pg.query<{ tabela: string }>(`SELECT confrelid::regclass::text tabela FROM pg_constraint
      WHERE conname='codigos_cadastros_empresa_id_fkey'`)
    ).rows[0].tabela
  ).toBe('empresas')
}, 30000)
