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
const saida = resolve('output/playwright', `migracao-numeracao-${Date.now()}`)
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
  const mapa = (await pg.query('SELECT * FROM mapa_numeracao ORDER BY tipo,novo')).rows
  const indice = new Map(mapa.map((m) => [`${m.tipo}:${m.documento_id}`, Number(m.novo)]))
  const normalizar = (v) => {
    if (Array.isArray(v))
      return v.map(normalizar).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, normalizar(v[k])])
      )
    return v
  }
  const canon = (v) => JSON.stringify(normalizar(v))
  const novasVersoes = []
  for (const e of entidades) {
    const novo = (
      await pg.query('SELECT * FROM gdo_entities WHERE usuario=$1 AND entidade=$2', [
        e.usuario,
        e.entidade
      ])
    ).rows[0]
    const esperado = structuredClone(e.payload)
    const n = indice.get(e.entidade)
    if (n) {
      const t = esperado.tipo,
        tabela = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[t]
      esperado.rows[tabela][0].numero = n
      if (t === 'relatorio' && esperado.rows.relatorios[0].origem_orcamento_id) {
        const origem = indice.get('orcamento:' + esperado.rows.relatorios[0].origem_orcamento_id)
        if (origem) esperado.rows.relatorios[0].origem_orcamento_numero = origem
      }
      if (t === 'recibo') {
        const d = JSON.parse(esperado.rows.recibos[0].dados)
        d.numero = n
        const fonte = mapa.find((m) => m.tipo === d.origemTipo && m.documento_id === d.origemId)
        if (fonte)
          d.descricao = d.descricao.replace(
            `conforme ${fonte.tipo === 'orcamento' ? 'proposta' : 'relatório'} Nº ${String(fonte.anterior).padStart(6, '0')}.`,
            `conforme ${fonte.tipo === 'orcamento' ? 'proposta' : 'relatório'} Nº ${String(fonte.novo).padStart(6, '0')}.`
          )
        esperado.rows.recibos[0].dados = JSON.stringify(d)
      }
      const meta = JSON.parse(esperado.rows.documento_meta[0].dados)
      delete meta.idInterno
      const antigas = esperado.rows.versoes
      const novas = novo.payload.rows.versoes.filter((v) => !antigas.some((a) => a.id === v.id))
      if (antigas.length) {
        assert.equal(novas.length, 1, e.entidade)
        const ultima = [...antigas].sort((a, b) => b.numero - a.numero)[0]
        const snap = JSON.parse(ultima.documento)
        snap.numero = n
        if (t === 'recibo') snap.descricao = JSON.parse(esperado.rows.recibos[0].dados).descricao
        snap.versao = ultima.numero + 1
        delete snap.idInterno
        if (t === 'relatorio' && snap.origemOrcamento?.id) {
          const origem = indice.get('orcamento:' + snap.origemOrcamento.id)
          if (origem) snap.origemOrcamento.numero = origem
        }
        assert.equal(
          canon(JSON.parse(novas[0].documento)),
          canon(snap),
          e.entidade + ' nova versão'
        )
        assert.equal(novas[0].numero, ultima.numero + 1)
        assert.equal(novas[0].anterior_id, ultima.id)
        meta.versao = novas[0].numero
        novasVersoes.push(novas[0])
      }
      esperado.rows.documento_meta[0].dados = JSON.stringify(meta)
      esperado.rows.versoes.push(...novas)
      assert.equal(Number(novo.revisao), Number(e.revisao) + 1)
    } else {
      assert.equal(Number(novo.revisao), Number(e.revisao), e.entidade)
    }
    assert.equal(
      (
        await pg.query(
          'SELECT sincronizacao.semantico($1::jsonb)=sincronizacao.semantico($2::jsonb) iguais',
          [JSON.stringify(esperado), JSON.stringify(novo.payload)]
        )
      ).rows[0].iguais,
      true,
      e.entidade + ' conteúdo'
    )
  }
  const depois = await retrato()
  for (const t of tabelas.filter(
    (t) =>
      ![
        'orcamentos',
        'relatorios',
        'recibos',
        'documentos',
        'versoes_documentos',
        'imagens_versoes',
        'reservas_numeros'
      ].includes(t)
  )) {
    assert.equal(canon(depois[t]), canon(antes[t]), t)
  }
  for (const antigo of antes.versoes_documentos)
    assert.equal(
      canon(depois.versoes_documentos.find((v) => v.id === antigo.id)),
      canon(antigo),
      'Versão antiga ' + antigo.id
    )
  for (const antiga of antes.imagens_versoes)
    assert.ok(
      depois.imagens_versoes.some((v) => canon(v) === canon(antiga)),
      'Referência antiga de imagem'
    )
  for (const t of ['orcamento', 'relatorio', 'recibo']) {
    const ms = mapa.filter((m) => m.tipo === t)
    assert.deepEqual(
      ms.map((m) => Number(m.novo)),
      Array.from({ length: ms.length }, (_, i) => i + 1)
    )
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [contas[0]])
    assert.equal(
      (await pg.query('SELECT gdo_numeracao_v3($1) r', [t])).rows[0].r.proximoNumero,
      ms.length + 1
    )
  }
  await pg.exec(schema)
  assert.equal(
    canon(await retrato()),
    canon(depois),
    'Reexecução não pode duplicar ou alterar a migração'
  )
  const resultado = {
    saida,
    entidades: entidades.length,
    documentosRenumerados: mapa.length,
    versoesAntigasPreservadas: antes.versoes_documentos.length,
    versoesNovas: novasVersoes.length,
    imagensPreservadas: antes.imagens.length,
    recebimentosPreservados: antes.recebimentos.length,
    contagens: Object.fromEntries(
      ['orcamento', 'relatorio', 'recibo'].map((t) => [t, mapa.filter((m) => m.tipo === t).length])
    ),
    conteudoIntegralPreservado: true,
    reexecucaoSegura: true
  }
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify(resultado, null, 2))
  writeFileSync(join(saida, 'mapa.json'), JSON.stringify(mapa, null, 2))
  writeFileSync(
    join(saida, 'entidades-migradas.json'),
    JSON.stringify((await pg.query('SELECT * FROM gdo_entities ORDER BY sequencia')).rows, null, 2)
  )
  console.log(JSON.stringify(resultado))
} catch (e) {
  console.error(JSON.stringify({ erro: e.message, detalhe: e.detail, contexto: e.where }))
  process.exitCode = 1
} finally {
  await pg.close()
}
