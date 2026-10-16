import { afterEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const abertos: PGlite[] = []

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((pg) => pg.close()))
})

async function preparar(): Promise<{
  pg: PGlite
  usuario: string
  operador: string
  empresaA: string
  empresaB: string
}> {
  const pg = new PGlite()
  abertos.push(pg)
  const operador = randomUUID()
  const usuario = randomUUID()
  const empresaA = randomUUID()
  const empresaB = randomUUID()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA central; CREATE SCHEMA sincronizacao;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE central.operadores(usuario_id uuid PRIMARY KEY REFERENCES auth.users(id));
    CREATE TABLE public.empresas(id uuid PRIMARY KEY,nome text NOT NULL);
    CREATE TABLE public.membros_empresa(
      empresa_id uuid NOT NULL REFERENCES public.empresas(id), usuario_id uuid NOT NULL,
      nome text NOT NULL, ativo boolean NOT NULL, papel text NOT NULL);
    CREATE TABLE public.configuracoes_empresa(empresa_id uuid,chave text,valor jsonb);
    CREATE FUNCTION public.gdo_empresa() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
      DECLARE e uuid:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-gdo-empresa';
      BEGIN IF NOT sincronizacao.membro(e) THEN RAISE EXCEPTION 'sem acesso'; END IF; RETURN e; END$$;`)
  await pg.query('INSERT INTO auth.users VALUES($1,$2,$3),($4,$5,$6)', [
    operador,
    'operador@example.test',
    { name: 'Operador' },
    usuario,
    'membro@example.test',
    { name: 'Membro' }
  ])
  await pg.query('INSERT INTO central.operadores VALUES($1)', [operador])
  await pg.query('INSERT INTO public.empresas VALUES($1,$3),($2,$4)', [
    empresaA,
    empresaB,
    'Empresa A',
    'Empresa B'
  ])
  await pg.query('INSERT INTO public.membros_empresa VALUES($1,$2,$3,true,$4)', [
    empresaA,
    usuario,
    'Membro',
    'membro'
  ])
  await pg.exec(readFileSync('supabase/migrations/009_operador_acesso_global.sql', 'utf8'))
  return { pg, usuario, operador, empresaA, empresaB }
}

it('dá ao operador acesso administrativo global sem vínculo por empresa', async () => {
  const { pg, operador, empresaA, empresaB } = await preparar()
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [operador])
  const contas = await pg.query<{
    contas: { operador: boolean; empresas: Array<{ id: string; papel: string }> }
  }>('SELECT public.gdo_contas() AS contas')
  expect(contas.rows[0].contas.operador).toBe(true)
  expect(contas.rows[0].contas.empresas).toEqual([
    { id: empresaA, papel: 'administrador', usuarioNome: 'Operador', nome: 'Empresa A' },
    { id: empresaB, papel: 'administrador', usuarioNome: 'Operador', nome: 'Empresa B' }
  ])
  expect((await pg.query('SELECT sincronizacao.membro($1)', [empresaB])).rows[0]).toEqual({
    membro: true
  })
  expect(
    (await pg.query('SELECT central.administrador($1,$2)', [empresaB, operador])).rows[0]
  ).toEqual({
    administrador: true
  })
  await pg.query("SELECT set_config('request.headers',$1,false)", [
    JSON.stringify({ 'x-gdo-empresa': empresaB })
  ])
  const contexto = await pg.query<{ contexto: { empresaId: string; papel: string } }>(
    'SELECT public.gdo_contexto_v4($1) AS contexto',
    [empresaB]
  )
  expect(contexto.rows[0].contexto).toMatchObject({ empresaId: empresaB, papel: 'administrador' })
})

it('mantém usuários comuns limitados ao vínculo e ao papel cadastrados', async () => {
  const { pg, usuario, operador, empresaA, empresaB } = await preparar()
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [usuario])
  const contas = await pg.query<{
    contas: { operador: boolean; empresas: Array<{ id: string; papel: string }> }
  }>('SELECT public.gdo_contas() AS contas')
  expect(contas.rows[0].contas).toEqual({
    operador: false,
    empresas: [{ id: empresaA, nome: 'Empresa A', papel: 'membro', usuarioNome: 'Membro' }]
  })
  expect((await pg.query('SELECT sincronizacao.membro($1)', [empresaA])).rows[0]).toEqual({
    membro: true
  })
  expect((await pg.query('SELECT sincronizacao.membro($1)', [empresaB])).rows[0]).toEqual({
    membro: false
  })
  expect(
    (await pg.query('SELECT central.administrador($1,$2)', [empresaA, usuario])).rows[0]
  ).toEqual({
    administrador: false
  })
  expect(
    (await pg.query('SELECT central.administrador($1,$2)', [empresaB, operador])).rows[0]
  ).toEqual({
    administrador: true
  })
})
