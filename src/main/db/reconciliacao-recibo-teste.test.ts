import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const migration = readFileSync(
  'supabase/migrations/005_reconciliar_numero_recibos_teste.sql',
  'utf8'
)

async function criarBanco(comOutroNumero = false): Promise<PGlite> {
  const pg = new PGlite()
  const empresa = randomUUID()
  await pg.exec(`
    CREATE SCHEMA sincronizacao;
    CREATE TABLE empresas(id uuid PRIMARY KEY);
    CREATE TABLE reservas_numeros(empresa_id uuid,tipo text,numero integer,dispositivo uuid,documento text);
    CREATE TABLE documentos(empresa_id uuid,tipo text,documento_id text,excluido boolean,responsavel uuid,dados jsonb);
    CREATE TABLE versoes_documentos(empresa_id uuid,id text,tipo text,documento_id text,numero integer,anterior_id text,criado_em text,computador text,descricao text,documento jsonb);
    CREATE TABLE recebimentos(empresa_id uuid,id text,recibo_id text,relatorio_id text,adiantamento_id text,valor numeric,estornado integer);
    CREATE TABLE numeros_emitidos(empresa_id uuid,tipo text,documento_id text,numero bigint);
    CREATE TABLE numeros_documentos(empresa_id uuid,tipo text,numero integer,documento_id text,PRIMARY KEY(empresa_id,tipo,numero));
    CREATE TABLE sincronizacao.sequencias_documentos(empresa_id uuid,tipo text,proximo integer,PRIMARY KEY(empresa_id,tipo));
    CREATE TABLE auditoria_colaboracao(empresa_id uuid,usuario_id uuid,acao text,entidade text,dados jsonb,criado_em timestamptz DEFAULT now());
    CREATE TABLE recibos(empresa_id uuid,id text,numero bigint);
  `)
  await pg.query('INSERT INTO empresas VALUES ($1)', [empresa])
  await pg.query('INSERT INTO recibos VALUES ($1,$2,1)', [empresa, 'real-1'])
  await pg.query("INSERT INTO documentos VALUES ($1,'recibo',$2,true,$3,$4)", [
    empresa,
    'teste-4',
    randomUUID(),
    JSON.stringify({})
  ])
  await pg.query(
    "INSERT INTO versoes_documentos(empresa_id,id,tipo,documento_id,numero,documento) VALUES ($1,$2,'recibo',$3,1,$4)",
    [
      empresa,
      randomUUID(),
      'teste-4',
      JSON.stringify({
        clienteSnapshot: { nome: 'TESTE-RELEASE-20261014' },
        descricao: 'Teste temporário'
      })
    ]
  )
  await pg.query("INSERT INTO numeros_documentos VALUES ($1,'recibo',4,$2)", [empresa, 'teste-4'])
  if (comOutroNumero) {
    await pg.query("INSERT INTO numeros_documentos VALUES ($1,'recibo',2,$2)", [
      empresa,
      'rascunho-real'
    ])
  }
  await pg.query("INSERT INTO sincronizacao.sequencias_documentos VALUES ($1,'recibo',5)", [
    empresa
  ])
  return pg
}

it('libera somente o número do recibo de teste não pago e deixa o próximo em 2', async () => {
  const pg = await criarBanco()
  try {
    await pg.exec(migration)
    expect((await pg.query('SELECT numero,documento_id FROM numeros_documentos')).rows).toEqual([])
    expect(
      (await pg.query('SELECT proximo FROM sincronizacao.sequencias_documentos')).rows
    ).toEqual([{ proximo: 2 }])
    expect(
      (await pg.query("SELECT dados->>'proximoNumero' AS proximo FROM auditoria_colaboracao")).rows
    ).toEqual([{ proximo: '2' }])
  } finally {
    await pg.close()
  }
})

it('aborta sem alterar a sequência se outro documento já usa o número 2', async () => {
  const pg = await criarBanco(true)
  try {
    let erro: unknown
    try {
      await pg.exec(migration)
    } catch (e) {
      erro = e
      await pg.exec('ROLLBACK')
    }
    expect(String(erro)).toContain('Há número atribuído a outro recibo')
    expect(
      (await pg.query('SELECT numero,documento_id FROM numeros_documentos ORDER BY numero')).rows
    ).toEqual([
      { numero: 2, documento_id: 'rascunho-real' },
      { numero: 4, documento_id: 'teste-4' }
    ])
    expect(
      (await pg.query('SELECT proximo FROM sincronizacao.sequencias_documentos')).rows
    ).toEqual([{ proximo: 5 }])
  } finally {
    await pg.close()
  }
})
