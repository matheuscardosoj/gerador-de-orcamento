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
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 INSERT INTO auth.users(id,email) VALUES('${dono}','dono@teste.com'),('${membro}','membro@teste.com'),('${estranho}','outro@teste.com');`)
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
  for (const migration of [
    '009_operador_acesso_global',
    '010_operador_protegido_e_excluir_empresa',
    '011_sessao_edicao_e_isolamento',
    '012_geracao_manutencao_empresa'
  ])
    await pg.exec(readFileSync(`supabase/migrations/${migration}.sql`, 'utf8'))
}, 30000)
afterAll(() => pg.close())

it('operador sem vínculo solicita, cancela e recebe transferência de edição', async () => {
  const pcA = randomUUID(),
    pcB = randomUUID()
  await identidade(dono, empresaB)
  await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [pcA, 'PC A'])
  await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [pcB, 'PC B'])
  await pg.query(
    "INSERT INTO sincronizacao.entidades(empresa_id,entidade,revisao,sequencia,excluido) VALUES($1,'orcamento:doc',1,nextval('gdo_changes'),false)",
    [empresaB]
  )
  const edicao = async (
    acao: string,
    pc: string,
    geracao: number | null = null,
    destino: string | null = null
  ) =>
    (
      await pg.query<{
        r: {
          geracao: number
          podeEditar: boolean
          pedidoPendente: boolean
          solicitacoes: unknown[]
        }
      }>("SELECT gdo_edicao_v3('orcamento','doc',$1,$2,$3,$4) r", [pc, acao, geracao, destino])
    ).rows[0].r
  await pg.query("INSERT INTO documentos VALUES($1,'orcamento','doc',false,$2,'{}')", [
    empresaB,
    pcA
  ])
  const c = await edicao('adquirir', pcA)
  expect(c.podeEditar).toBe(true)
  expect((await edicao('solicitar', pcB)).pedidoPendente).toBe(true)
  expect((await edicao('solicitar', pcB)).solicitacoes).toHaveLength(1)
  expect((await edicao('cancelarPedido', pcB)).pedidoPendente).toBe(false)
  await edicao('solicitar', pcB)
  await edicao('transferir', pcA, c.geracao, pcB)
  expect((await edicao('obter', pcB)).podeEditar).toBe(true)
  expect((await edicao('obter', pcA)).podeEditar).toBe(false)
})
it('solicitar adquire imediatamente um documento livre', async () => {
  await identidade(dono, empresaB)
  const pc = randomUUID()
  await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [pc, 'PC livre'])
  await pg.query(
    "INSERT INTO sincronizacao.entidades(empresa_id,entidade,revisao,sequencia,excluido) VALUES($1,'orcamento:livre',1,nextval('gdo_changes'),false)",
    [empresaB]
  )
  await pg.query("INSERT INTO documentos VALUES($1,'orcamento','livre',false,$2,'{}')", [
    empresaB,
    pc
  ])
  expect(
    (
      await pg.query<{ r: { podeEditar: boolean } }>(
        "SELECT gdo_edicao_v3('orcamento','livre',$1,'solicitar') r",
        [pc]
      )
    ).rows[0].r.podeEditar
  ).toBe(true)
})
it('não cancela convite pertencente a outra empresa mesmo como operador', async () => {
  await identidade(dono)
  const id = randomUUID()
  await pg.query('SELECT gdo_preparar_convite($1,$2,$3,NULL,$4,$5,$6)', [
    dono,
    id,
    empresaB,
    'convite@example.test',
    'Pessoa',
    'membro'
  ])
  await expect(pg.query('SELECT gdo_convites_operador($1,$2)', [dono, id])).rejects.toThrow(
    'Convite indisponível'
  )
  expect(
    (await pg.query<{ r: unknown[] }>('SELECT gdo_convites_operador($1,NULL) r', [dono])).rows[0].r
  ).toEqual([])
})
it('empresa excluída retorna código terminal verificável e mantém outras empresas', async () => {
  await identidade(dono, empresaB)
  await pg.query('SELECT gdo_excluir_empresa($1,$2)', [dono, empresaB])
  await expect(pg.query('SELECT gdo_contexto_v4($1)', [empresaB])).rejects.toMatchObject({
    code: 'GDE01'
  })
  await identidade(dono)
  expect(
    (await pg.query<{ r: { empresaId: string } }>('SELECT gdo_contexto_v4($1) r', [dono])).rows[0].r
      .empresaId
  ).toBe(dono)
})

it('manutenção rejeita gravações antigas e somente aceita a geração atual após concluir', async () => {
  await identidade(dono)
  const pc = randomUUID()
  await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [pc, 'PC manutenção'])
  await pg.query('INSERT INTO central.manutencao_empresas VALUES($1,1,true)', [dono])
  await expect(pg.query("SELECT gdo_batch_v3('[]',$1)", [pc])).rejects.toMatchObject({
    code: 'GDM01'
  })
  await pg.query('UPDATE central.manutencao_empresas SET em_manutencao=false WHERE empresa_id=$1', [
    dono
  ])
  await expect(pg.query("SELECT gdo_batch_v3('[]',$1)", [pc])).rejects.toMatchObject({
    code: 'GDM02'
  })
  await pg.query("SELECT set_config('request.headers',$1,false)", [
    JSON.stringify({ 'x-gdo-empresa': dono, 'x-gdo-geracao': '1' })
  ])
  await expect(pg.query("SELECT gdo_batch_v3('[]',$1)", [pc])).resolves.toBeDefined()
  expect(
    (
      await pg.query<{ r: { geracao: number; emManutencao: boolean } }>(
        'SELECT gdo_estado_base() r'
      )
    ).rows[0].r
  ).toEqual({ geracao: 1, emManutencao: false })
  await pg.exec(readFileSync('supabase/migrations/012_geracao_manutencao_empresa.sql', 'utf8'))
  await expect(pg.query("SELECT gdo_batch_v3('[]',$1)", [pc])).resolves.toBeDefined()
})
