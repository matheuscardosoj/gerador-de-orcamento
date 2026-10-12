// Ensaio de uma exportação atual em PostgreSQL isolado. Sem rede nem credenciais.
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
assert.ok(process.argv[2], 'Informe a pasta da exportação verificada.')
const entrada = resolve(process.argv[2])
const entidades = JSON.parse(readFileSync(join(entrada, 'Nuvem antes da migração.json'), 'utf8'))
const controles = JSON.parse(
  readFileSync(join(entrada, 'Controles antes da migração.json'), 'utf8')
)
const saida = resolve('output/playwright', `migracao-colaboracao-${Date.now()}`)
mkdirSync(saida, { recursive: true })
const pg = new PGlite()
try {
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE SCHEMA realtime; CREATE TABLE realtime.messages(payload jsonb,extension text,topic text);
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA realtime TO authenticated;
    GRANT SELECT ON realtime.messages TO authenticated;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic',true) $$;
    CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.messages VALUES($1,'broadcast',$3) $$;`)
  await pg.exec(readFileSync('supabase/migrations/001_nuvem_legada.sql', 'utf8'))
  const contas = [...new Set(entidades.map((e) => e.usuario))]
  for (const u of contas)
    await pg.query('INSERT INTO auth.users VALUES ($1,$2)', [u, `${u}@teste.local`])
  for (const d of controles.computadores)
    await pg.query('INSERT INTO gdo_devices VALUES($1,$2,$3)', [d.empresa_id, d.id, d.nome])
  for (const n of controles.reservas_numeros)
    await pg.query('INSERT INTO gdo_numbers VALUES($1,$2,$3,$4,$5)', [
      n.empresa_id,
      n.tipo,
      n.numero,
      n.dispositivo,
      n.documento
    ])
  for (const e of entidades)
    await pg.query('INSERT INTO gdo_entities VALUES($1,$2,$3,$4,$5)', [
      e.usuario,
      e.entidade,
      e.revisao,
      JSON.stringify(e.payload),
      e.sequencia
    ])
  await pg.query("SELECT setval('gdo_changes',$1)", [
    Math.max(...entidades.map((e) => Number(e.sequencia))) + 1
  ])
  await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))
  const tabelas = (
    await pg.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='empresa_id' GROUP BY table_name ORDER BY table_name"
    )
  ).rows.map((r) => r.table_name)
  const retrato = async () =>
    Object.fromEntries(
      await Promise.all(
        tabelas.map(async (t) => [
          t,
          (await pg.query(`SELECT * FROM ${t} ORDER BY to_jsonb(${t})::text`)).rows
        ])
      )
    )
  const antes = await retrato()
  const schema = readFileSync('supabase/schema-colaboracao.sql', 'utf8')
  await pg.exec(schema)
  const comparar = async () => {
    assert.deepEqual(
      await retrato(),
      antes,
      'Os dados e controles originais devem permanecer iguais'
    )
    for (const e of entidades) {
      const novo = (
        await pg.query('SELECT * FROM gdo_entities WHERE usuario=$1 AND entidade=$2', [
          e.usuario,
          e.entidade
        ])
      ).rows[0]
      assert.equal(Number(novo.revisao), Number(e.revisao), e.entidade)
      assert.equal(Number(novo.sequencia), Number(e.sequencia), e.entidade)
      assert.equal(
        (
          await pg.query(
            'SELECT sincronizacao.semantico($1::jsonb)=sincronizacao.semantico($2::jsonb) AS iguais',
            [JSON.stringify(e.payload), JSON.stringify(novo.payload)]
          )
        ).rows[0].iguais,
        true,
        e.entidade
      )
    }
  }
  await comparar()
  const ids = (
    await pg.query(
      'SELECT tipo,id_interno,documento_id FROM identificadores_documento ORDER BY tipo,id_interno'
    )
  ).rows
  for (const tipo of ['orcamento', 'relatorio', 'recibo']) {
    const esperados = (
      await pg.query(
        "SELECT d.documento_id FROM documentos d LEFT JOIN orcamentos o ON d.tipo='orcamento' AND o.empresa_id=d.empresa_id AND o.id=d.documento_id LEFT JOIN relatorios r ON d.tipo='relatorio' AND r.empresa_id=d.empresa_id AND r.id=d.documento_id LEFT JOIN recibos c ON d.tipo='recibo' AND c.empresa_id=d.empresa_id AND c.id=d.documento_id WHERE d.tipo=$1 AND NOT d.excluido ORDER BY coalesce(o.data,r.data,c.data),coalesce(o.criado_em,r.criado_em,c.criado_em),coalesce(o.numero,r.numero,c.numero),d.documento_id",
        [tipo]
      )
    ).rows
    const atuais = ids.filter((r) => r.tipo === tipo)
    assert.deepEqual(
      atuais.map((r) => Number(r.id_interno)),
      Array.from({ length: esperados.length }, (_, i) => i + 1)
    )
    assert.deepEqual(
      atuais.map((r) => r.documento_id),
      esperados.map((r) => r.documento_id)
    )
  }
  await pg.exec(schema)
  await comparar()
  assert.deepEqual(
    (
      await pg.query(
        'SELECT tipo,id_interno,documento_id FROM identificadores_documento ORDER BY tipo,id_interno'
      )
    ).rows,
    ids
  )
  await pg.query('UPDATE membros_empresa SET nome=nome WHERE empresa_id=$1', [contas[0]])
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [contas[0]])
  await pg.exec('SET ROLE authenticated')
  const contexto = (await pg.query('SELECT gdo_contexto_v2() AS contexto')).rows[0].contexto
  assert.equal(contexto.empresaId, contas[0])
  assert.equal(contexto.protocolo, 2)
  await pg.query("SELECT set_config('realtime.topic',$1,false)", [`empresa:${contas[0]}`])
  // Um aviso só de metadados é visível exclusivamente no canal da própria empresa.
  assert.ok((await pg.query('SELECT count(*) AS n FROM realtime.messages')).rows[0].n > 0)
  await pg.query(
    "SELECT set_config('realtime.topic','empresa:00000000-0000-0000-0000-000000000001',false)"
  )
  assert.equal((await pg.query('SELECT count(*) AS n FROM realtime.messages')).rows[0].n, 0)
  const d = controles.computadores[0]
  await assert.rejects(pg.query('SELECT gdo_device($1,$2)', [d.id, d.nome]), /permission denied/)
  await pg.exec('RESET ROLE')
  const contagens = Object.fromEntries(
    await Promise.all(
      [
        'clientes',
        'orcamentos',
        'relatorios',
        'recibos',
        'recebimentos',
        'imagens',
        'versoes_documentos',
        'imagens_versoes',
        'reservas_numeros'
      ].map(async (t) => [t, (await pg.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n])
    )
  )
  const resultado = {
    saida,
    entidades: entidades.length,
    tabelasConferidas: tabelas.length,
    contagens,
    idsPorDataPreservandoNumeros: true,
    reexecucaoSegura: true,
    conteudoIntegralPreservado: true,
    canalPrivadoIsolado: true,
    gravacaoLegadaBloqueada: true
  }
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} catch (e) {
  console.error(JSON.stringify({ erro: e.message, detalhe: e.detail, contexto: e.where }))
  process.exitCode = 1
} finally {
  await pg.close()
}
