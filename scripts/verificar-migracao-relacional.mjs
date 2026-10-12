// Migração PostgreSQL em memória de uma exportação remota. Sem conexão real.
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
assert.ok(process.argv[2], 'Informe a exportação JSON da nuvem para validar sua migração em cópia.')
const entidades = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'))
const saida = resolve('output/playwright', `relacional-${Date.now()}`)
mkdirSync(saida, { recursive: true })
const pg = new PGlite()
try {
  await pg.exec(
    `CREATE SCHEMA auth;CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`
  )
  await pg.exec(readFileSync('supabase/migrations/001_nuvem_legada.sql', 'utf8'))
  const contas = [...new Set(entidades.map((e) => e.usuario))]
  for (const u of contas) await pg.query('INSERT INTO auth.users VALUES ($1)', [u])
  for (const e of entidades) {
    if (e.payload.responsavel)
      await pg.query('INSERT INTO gdo_devices VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
        e.usuario,
        e.payload.responsavel,
        'Computador da cópia'
      ])
    await pg.query('INSERT INTO gdo_entities VALUES ($1,$2,$3,$4,$5)', [
      e.usuario,
      e.entidade,
      e.revisao,
      JSON.stringify(e.payload),
      e.sequencia
    ])
  }
  await pg.query("SELECT setval('gdo_changes',$1)", [
    Math.max(...entidades.map((e) => Number(e.sequencia))) + 1
  ])
  const schema = readFileSync('supabase/schema.sql', 'utf8')
  await pg.exec(schema)
  const comparar = async () => {
    const depois = (await pg.query('SELECT * FROM gdo_entities')).rows
    assert.equal(depois.length, entidades.length)
    for (const e of entidades) {
      const novo = depois.find((r) => r.usuario === e.usuario && r.entidade === e.entidade)
      assert.equal(Number(novo.revisao), Number(e.revisao))
      assert.equal(Number(novo.sequencia), Number(e.sequencia))
      const iguais = (
        await pg.query(
          'SELECT sincronizacao.semantico($1::jsonb)=sincronizacao.semantico($2::jsonb) iguais',
          [JSON.stringify(e.payload), JSON.stringify(novo.payload)]
        )
      ).rows[0].iguais
      assert.equal(iguais, true, e.entidade)
    }
  }
  await comparar()
  await pg.exec(schema)
  await comparar()
  assert.equal(
    (await pg.query("SELECT to_regclass('sincronizacao.legado_em_migracao') tabela")).rows[0]
      .tabela,
    null
  )
  assert.equal(
    (await pg.query("SELECT relkind FROM pg_class WHERE oid='public.gdo_entities'::regclass"))
      .rows[0].relkind,
    'v'
  )
  const contagens = {}
  for (const tabela of [
    'clientes',
    'orcamentos',
    'itens_orcamento',
    'materiais_orcamento',
    'relatorios',
    'itens_relatorio',
    'recibos',
    'recebimentos',
    'imagens',
    'versoes_documentos',
    'imagens_versoes'
  ])
    contagens[tabela] = (await pg.query(`SELECT COUNT(*) n FROM ${tabela}`)).rows[0].n
  const campos = (await pg.query('SELECT nome,tipo_pessoa,cpf_cnpj,telefone,email FROM clientes'))
    .rows
  assert.ok(campos.every((c) => c.nome))
  const rls = (
    await pg.query(
      "SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity"
    )
  ).rows[0].n
  assert.equal(rls, 0)
  const resultado = {
    exportacaoPreservada: true,
    migracaoTransacional: true,
    conteudoIntegralConferido: true,
    reexecucaoSegura: true,
    semDuplicacaoDoPayload: true,
    entidades: entidades.length,
    contagens,
    tabelasPublicasComRls: true
  }
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify({ saida, ...resultado }))
} catch (e) {
  console.error(JSON.stringify({ erro: e.message, detalhe: e.detail, contexto: e.where }))
  process.exitCode = 1
} finally {
  await pg.close()
}
