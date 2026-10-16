import { afterEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const abertos: PGlite[] = []

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((pg) => pg.close()))
})

it('mostra o nome configurado na seleção e mantém fallback para empresas antigas', async () => {
  const pg = new PGlite()
  abertos.push(pg)
  const usuario = randomUUID()
  const empresaComNome = randomUUID()
  const empresaSemNome = randomUUID()

  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA central;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE central.operadores(usuario_id uuid PRIMARY KEY);
    CREATE TABLE public.empresas(id uuid PRIMARY KEY,nome text NOT NULL);
    CREATE TABLE public.membros_empresa(
      empresa_id uuid NOT NULL REFERENCES public.empresas(id), usuario_id uuid NOT NULL,
      nome text NOT NULL, ativo boolean NOT NULL, papel text NOT NULL);
    CREATE TABLE public.configuracoes_empresa(
      empresa_id uuid NOT NULL REFERENCES public.empresas(id), chave text NOT NULL,
      valor jsonb, PRIMARY KEY(empresa_id,chave));`)
  await pg.query('INSERT INTO public.empresas VALUES($1,$2),($3,$4)', [
    empresaComNome,
    'Empresa',
    empresaSemNome,
    'Empresa antiga'
  ])
  await pg.query('INSERT INTO public.membros_empresa VALUES($1,$3,$4,true,$5),($2,$3,$4,true,$5)', [
    empresaComNome,
    empresaSemNome,
    usuario,
    'Matheus',
    'administrador'
  ])
  await pg.query(
    `INSERT INTO public.configuracoes_empresa VALUES($1,'empresa',
      '{"nome":"VS PRESTADORA DE SERVIÇOS","nomeExibicao":"nome","razaoSocial":"V S DE JESUS"}')`,
    [empresaComNome]
  )

  await pg.exec(readFileSync('supabase/migrations/008_nome_empresa_selecao.sql', 'utf8'))
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [usuario])

  const result = await pg.query<{ contas: { empresas: Array<{ id: string; nome: string }> } }>(
    'SELECT public.gdo_contas() AS contas'
  )
  expect(result.rows[0].contas.empresas).toEqual([
    { id: empresaSemNome, nome: 'Empresa antiga', papel: 'administrador', usuarioNome: 'Matheus' },
    {
      id: empresaComNome,
      nome: 'VS PRESTADORA DE SERVIÇOS',
      papel: 'administrador',
      usuarioNome: 'Matheus'
    }
  ])
})
