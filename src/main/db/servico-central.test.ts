import { beforeAll, afterAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const pg = new PGlite()
const dono = randomUUID(),
  membro = randomUUID(),
  estranho = randomUUID(),
  empresaB = randomUUID()
async function identidade(usuario: string, empresa = dono) {
  await pg.query(
    "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",
    [usuario, JSON.stringify({ 'x-gdo-empresa': empresa })]
  )
}
beforeAll(async () => {
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 INSERT INTO auth.users VALUES('${dono}','dono@teste.com'),('${membro}','membro@teste.com'),('${estranho}','outro@teste.com');`)
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.exec(
    `INSERT INTO empresas(id,nome) VALUES('${dono}','Original'),('${empresaB}','Outra');
 INSERT INTO membros_empresa(empresa_id,usuario_id,nome) VALUES('${dono}','${dono}','Dono'),('${dono}','${membro}','Membro'),('${empresaB}','${empresaB}','B');`.replace(
      `('${empresaB}','${empresaB}','B')`,
      `('${empresaB}','${estranho}','B')`
    )
  )
  // A segunda empresa tem responsável diferente do UUID histórico.
  await pg.exec(
    `UPDATE empresas SET id=id WHERE id='${empresaB}'; DELETE FROM membros_empresa WHERE empresa_id='${empresaB}'; DELETE FROM sincronizacao.entidades WHERE empresa_id='${empresaB}'; DELETE FROM observacoes_padrao WHERE empresa_id='${empresaB}'; DELETE FROM formas_pagamento_padrao WHERE empresa_id='${empresaB}'; DELETE FROM empresas WHERE id='${empresaB}';`
  )
  await pg.exec(readFileSync('supabase/central/001_servico_central.sql', 'utf8'))
  await pg.exec(
    `INSERT INTO empresas(id,nome) VALUES('${empresaB}','Outra'); INSERT INTO membros_empresa(empresa_id,usuario_id,nome,papel) VALUES('${empresaB}','${estranho}','Outro','administrador'); INSERT INTO central.operadores VALUES('${dono}');`
  )
}, 30000)
afterAll(() => pg.close())
it('exige empresa autorizada e rejeita cliente sem contexto', async () => {
  await identidade(membro)
  expect((await pg.query<{ e: string }>('SELECT gdo_empresa() e')).rows[0].e).toBe(dono)
  await identidade(membro, empresaB)
  await expect(pg.query('SELECT gdo_empresa()')).rejects.toThrow('Você não tem acesso')
  await pg.query("SELECT set_config('request.headers','{}',false)")
  await expect(pg.query('SELECT gdo_empresa()')).rejects.toThrow('Selecione uma empresa')
})
it('membro não gere equipe e último administrador fica protegido', async () => {
  await identidade(membro)
  await expect(pg.query('SELECT gdo_membros_v3($1,NULL,NULL,false)', [dono])).rejects.toThrow(
    'Somente administradores'
  )
  await identidade(dono)
  await expect(pg.query('SELECT gdo_papel_membro($1,$2)', [dono, 'membro'])).rejects.toThrow(
    'pelo menos um administrador'
  )
  await expect(pg.query('SELECT gdo_membros_v3($1,NULL,NULL,false)', [dono])).rejects.toThrow(
    'pelo menos um administrador'
  )
})
it('operador cria convite idempotente e somente destinatário recebe vínculo', async () => {
  const id = randomUUID()
  const preparar = () =>
    pg.query<{ r: { empresaId: string } }>(
      'SELECT gdo_preparar_convite($1,$2,NULL,$3,$4,$5,$6) r',
      [dono, id, 'Nova', 'membro@teste.com', 'Pessoa', 'administrador']
    )
  const empresa = (await preparar()).rows[0].r.empresaId
  await expect(preparar()).rejects.toThrow('Aguarde um minuto')
  const quantidade = (await pg.query('SELECT count(*) FROM empresas')).rows
  await pg.query(
    "UPDATE central.convites SET ultimo_envio=now()-interval '2 minutes' WHERE id=$1",
    [id]
  )
  expect((await preparar()).rows[0].r.empresaId).toBe(empresa)
  expect((await pg.query('SELECT count(*) FROM empresas')).rows).toEqual(quantidade)
  await identidade(estranho, empresaB)
  await pg.query('SELECT gdo_aceitar_convites()')
  expect(
    (await pg.query('SELECT 1 FROM membros_empresa WHERE empresa_id=$1', [empresa])).rows
  ).toHaveLength(0)
  await identidade(membro)
  await pg.query('SELECT gdo_aceitar_convites()')
  await pg.query('SELECT gdo_aceitar_convites()')
  expect(
    (await pg.query('SELECT papel FROM membros_empresa WHERE empresa_id=$1', [empresa])).rows
  ).toEqual([{ papel: 'administrador' }])
})
it('API administrativa não é executável pelos clientes', async () => {
  expect(
    (
      await pg.query<{ ok: boolean }>(
        "SELECT has_function_privilege('authenticated','gdo_preparar_convite(uuid,uuid,uuid,text,text,text,text)','EXECUTE') ok"
      )
    ).rows[0].ok
  ).toBe(false)
})
it('membro consulta números, mas não avança sequência nem altera padrões comerciais', async () => {
  await identidade(membro)
  await expect(pg.query("SELECT gdo_numeracao_v3('orcamento',100)")).rejects.toThrow(
    'Somente administradores'
  )
  await expect(pg.query("SELECT gdo_numeracao_v3('orcamento',NULL)")).resolves.toBeDefined()
  for (const tabela of ['configuracoes', 'observacoes_padrao', 'pagamentos_padrao']) {
    await expect(
      pg.query('SELECT gdo_batch_v3($1::jsonb,$2::uuid)', [
        JSON.stringify([{ payload: { tabela } }]),
        randomUUID()
      ])
    ).rejects.toThrow('Somente administradores')
  }
})
