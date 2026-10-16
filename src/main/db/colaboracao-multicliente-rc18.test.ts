import { beforeAll, afterAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const pg = new PGlite()
const dono = randomUUID(),
  membro = randomUUID(),
  estranho = randomUUID(),
  empresaB = randomUUID()
async function identidade(usuario: string, empresa: string = dono) {
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

it('50 dispositivos, cinco usuários, duas empresas e dois documentos mantêm responsável único', async () => {
  const usuarios = Array.from({ length: 5 }, () => randomUUID())
  for (const usuario of usuarios) {
    await pg.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [
      usuario,
      `${usuario}@example.invalid`
    ])
    for (const empresa of [dono, empresaB])
      await pg.query('INSERT INTO membros_empresa(empresa_id,usuario_id,nome) VALUES($1,$2,$3)', [
        empresa,
        usuario,
        'Mesmo nome'
      ])
  }
  const pcs = Array.from({ length: 50 }, (_, i) => ({
    id: randomUUID(),
    usuario: usuarios[i % usuarios.length]
  }))
  const chamada = async (
    empresa: string,
    pc: (typeof pcs)[number],
    doc: string,
    acao: string,
    geracao: number | null = null,
    destino: string | null = null
  ) => {
    await identidade(pc.usuario, empresa)
    return (
      await pg.query<{
        r: { geracao: number; computador: string; podeEditar: boolean; solicitacoes: unknown[] }
      }>("SELECT gdo_edicao_v3('orcamento',$1,$2,$3,$4,$5) r", [doc, pc.id, acao, geracao, destino])
    ).rows[0].r
  }
  for (const empresa of [dono, empresaB]) {
    for (const pc of pcs) {
      await identidade(pc.usuario, empresa)
      await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [pc.id, 'Mesmo hostname'])
    }
    for (const doc of ['compartilhado', 'independente']) {
      await pg.query(
        "INSERT INTO sincronizacao.entidades(empresa_id,entidade,revisao,sequencia,excluido) VALUES($1,$2,1,nextval('gdo_changes'),false)",
        [empresa, `orcamento:${doc}`]
      )
      await pg.query("INSERT INTO documentos VALUES($1,'orcamento',$2,false,$3,'{}')", [
        empresa,
        doc,
        pcs[0].id
      ])
      await chamada(empresa, pcs[0], doc, 'adquirir')
    }
  }
  for (const pc of pcs.slice(1)) {
    await chamada(dono, pc, 'compartilhado', 'solicitar')
    await chamada(dono, pc, 'compartilhado', 'solicitar')
  }
  expect((await chamada(dono, pcs[0], 'compartilhado', 'obter')).solicitacoes).toHaveLength(49)
  let responsavel = pcs[0],
    geracao = 1
  for (let i = 1; i <= 20; i++) {
    const proximo = pcs[i % pcs.length]
    const anterior = responsavel
    await chamada(dono, responsavel, 'compartilhado', 'transferir', geracao, proximo.id)
    geracao++
    responsavel = proximo
    expect((await chamada(dono, anterior, 'compartilhado', 'obter')).podeEditar).toBe(false)
    expect((await chamada(dono, responsavel, 'compartilhado', 'obter')).podeEditar).toBe(true)
    await expect(
      chamada(dono, anterior, 'compartilhado', 'transferir', geracao - 1, pcs[0].id)
    ).rejects.toThrow('revogada')
    const linhas = (
      await pg.query<{ dispositivo: string; geracao: number }>(
        "SELECT dispositivo,geracao FROM edicoes_documento WHERE empresa_id=$1 AND tipo='orcamento' AND documento_id='compartilhado'",
        [dono]
      )
    ).rows
    expect(linhas).toHaveLength(1)
    expect(linhas[0].dispositivo).toBe(responsavel.id)
  }
  expect((await chamada(empresaB, pcs[0], 'compartilhado', 'obter')).geracao).toBe(1)
  expect((await chamada(dono, pcs[0], 'independente', 'obter')).geracao).toBe(1)
}, 30000)
