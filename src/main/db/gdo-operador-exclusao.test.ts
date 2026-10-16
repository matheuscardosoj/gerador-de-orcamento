import { afterEach, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { fecharBanco, abrirBanco, run } from './sqlite'
import { documentosAcompanhados } from '../colaboracao'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const local = vi.hoisted(() => ({ pasta: '' }))
vi.mock('electron', () => ({ app: { getPath: () => local.pasta } }))

const bancos: PGlite[] = []

afterEach(async () => {
  try {
    fecharBanco()
  } catch {
    /* o teste pode não ter aberto SQLite */
  }
  if (local.pasta) rmSync(local.pasta, { recursive: true, force: true })
  await Promise.all(bancos.splice(0).map((pg) => pg.close()))
})

async function preparar() {
  const pg = new PGlite()
  bancos.push(pg)
  const operador = randomUUID()
  const comum = randomUUID()
  const empresa = randomUUID()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA central; CREATE SCHEMA sincronizacao;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE central.operadores(usuario_id uuid PRIMARY KEY REFERENCES auth.users(id));
    CREATE TABLE public.empresas(id uuid PRIMARY KEY,nome text NOT NULL);
    CREATE TABLE public.membros_empresa(
      empresa_id uuid NOT NULL REFERENCES public.empresas(id),usuario_id uuid NOT NULL,
      nome text NOT NULL,ativo boolean NOT NULL,papel text NOT NULL,
      PRIMARY KEY(empresa_id,usuario_id));
    CREATE TABLE public.configuracoes_empresa(empresa_id uuid,chave text,valor jsonb);
    CREATE TABLE public.auditoria_colaboracao(empresa_id uuid,usuario_id uuid,acao text,dados jsonb);
    CREATE TABLE public.z_parent(empresa_id uuid NOT NULL REFERENCES public.empresas(id),id uuid PRIMARY KEY);
    CREATE TABLE public.a_child(empresa_id uuid NOT NULL REFERENCES public.empresas(id),parent uuid REFERENCES public.z_parent(id),id uuid PRIMARY KEY);
    CREATE TABLE central.convites(id uuid PRIMARY KEY,empresa_id uuid NOT NULL REFERENCES public.empresas(id));
    CREATE FUNCTION public.gdo_empresa() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
      DECLARE e uuid:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-gdo-empresa';
      BEGIN IF NOT sincronizacao.membro(e) THEN RAISE EXCEPTION 'sem acesso'; END IF; RETURN e; END$$;`)
  await pg.query('INSERT INTO auth.users VALUES($1,$2,$3),($4,$5,$6)', [
    operador,
    'operador@example.test',
    { name: 'Operador' },
    comum,
    'comum@example.test',
    { name: 'Pessoa' }
  ])
  await pg.query('INSERT INTO central.operadores VALUES($1)', [operador])
  await pg.query('INSERT INTO public.empresas VALUES($1,$2)', [empresa, 'Empresa teste'])
  await pg.query('INSERT INTO public.membros_empresa VALUES($1,$2,$3,true,$4)', [
    empresa,
    comum,
    'Pessoa',
    'administrador'
  ])
  await pg.query('INSERT INTO public.z_parent VALUES($1,$2)', [empresa, randomUUID()])
  const parent = (await pg.query<{ id: string }>('SELECT id FROM public.z_parent')).rows[0].id
  await pg.query('INSERT INTO public.a_child VALUES($1,$2,$3)', [empresa, parent, randomUUID()])
  await pg.query('INSERT INTO central.convites VALUES($1,$2)', [randomUUID(), empresa])
  await pg.exec(readFileSync('supabase/migrations/009_operador_acesso_global.sql', 'utf8'))
  await pg.exec(
    readFileSync('supabase/migrations/010_operador_protegido_e_excluir_empresa.sql', 'utf8')
  )
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [operador])
  await pg.query("SELECT set_config('request.headers',$1,false)", [
    JSON.stringify({ 'x-gdo-empresa': empresa })
  ])
  return { pg, operador, comum, empresa }
}

it('protege o papel global e não lista o operador como membro comum', async () => {
  const { pg, operador } = await preparar()
  const membros = await pg.query<{ membros: unknown[] }>(
    'SELECT public.gdo_membros_v3() AS membros'
  )
  expect(membros.rows[0].membros).toEqual([
    expect.objectContaining({ usuarioId: expect.any(String), papel: 'administrador' })
  ])
  await expect(
    pg.query('SELECT public.gdo_papel_membro($1,$2)', [operador, 'membro'])
  ).rejects.toThrow('Operador do Sistema')
  await expect(
    pg.query('SELECT public.gdo_membros_v3($1,NULL,NULL,false)', [operador])
  ).rejects.toThrow('Operador do Sistema')
  const segundo = randomUUID()
  await pg.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [segundo, 'outro@example.test'])
  await expect(pg.query('INSERT INTO central.operadores VALUES($1)', [segundo])).rejects.toThrow()
})

it('só permite exclusão pelo operador e remove dados em dependência sem apagar Auth', async () => {
  const { pg, operador, comum, empresa } = await preparar()
  await expect(
    pg.query('SELECT public.gdo_excluir_empresa($1,$2)', [comum, empresa])
  ).rejects.toThrow('Somente o Operador do Sistema')
  await pg.query('SELECT public.gdo_excluir_empresa($1,$2)', [operador, empresa])
  expect(
    (await pg.query('SELECT * FROM public.empresas WHERE id=$1', [empresa])).rows
  ).toHaveLength(0)
  expect(
    (await pg.query('SELECT * FROM public.z_parent WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
  expect(
    (await pg.query('SELECT * FROM public.a_child WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
  expect(
    (await pg.query('SELECT * FROM public.membros_empresa WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
  expect(
    (await pg.query('SELECT * FROM central.convites WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
  expect(
    (await pg.query('SELECT * FROM central.empresas_excluidas WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(1)
  expect((await pg.query('SELECT * FROM auth.users WHERE id=$1', [operador])).rows).toHaveLength(1)
  expect((await pg.query('SELECT sincronizacao.membro($1)', [empresa])).rows[0]).toEqual({
    membro: false
  })
  await pg.query('SELECT public.gdo_excluir_empresa($1,$2)', [operador, empresa])
})

it('reverte todos os dados e o bloqueio quando uma exclusão falha no meio', async () => {
  const { pg, operador, empresa } = await preparar()
  await pg.exec(`CREATE FUNCTION public.bloquear_exclusao_ensaio() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'bloqueio de ensaio'; END $$;
    CREATE TRIGGER bloquear_exclusao_ensaio BEFORE DELETE ON public.a_child
      FOR EACH ROW EXECUTE FUNCTION public.bloquear_exclusao_ensaio();`)

  await expect(
    pg.query('SELECT public.gdo_excluir_empresa($1,$2)', [operador, empresa])
  ).rejects.toThrow('bloqueio de ensaio')

  expect(
    (await pg.query('SELECT id FROM public.empresas WHERE id=$1', [empresa])).rows
  ).toHaveLength(1)
  expect(
    (await pg.query('SELECT id FROM public.z_parent WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(1)
  expect(
    (await pg.query('SELECT id FROM public.a_child WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(1)
  expect(
    (await pg.query('SELECT * FROM central.empresas_excluidas WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
})

it('descobre documentos acompanhados sem colapsar tipo ou ID', () => {
  local.pasta = mkdtempSync(join(tmpdir(), 'gdo-pedidos-'))
  abrirBanco()
  run(
    "INSERT INTO edicoes_documento VALUES ('orcamento','abc','u','d',1,'2099-01-01T00:00:00.000Z',0,1)"
  )
  run(
    "INSERT INTO edicoes_documento VALUES ('relatorio','abc','u','d',1,'2099-01-01T00:00:00.000Z',0,1)"
  )
  run(
    "INSERT INTO edicoes_documento VALUES ('recibo','xyz','u','d',1,'2099-01-01T00:00:00.000Z',0,1)"
  )
  expect(documentosAcompanhados()).toEqual([
    { tipo: 'orcamento', id: 'abc' },
    { tipo: 'recibo', id: 'xyz' },
    { tipo: 'relatorio', id: 'abc' }
  ])
})
