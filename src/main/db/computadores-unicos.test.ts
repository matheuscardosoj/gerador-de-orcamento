import { afterEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

const bancos: PGlite[] = []
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((pg) => pg.close()))
})

/** Reproduz o que aparecia em "Transferir para": cada Windows com vários identificadores. */
async function preparar() {
  const pg = new PGlite()
  bancos.push(pg)
  const empresa = randomUUID()
  const outra = randomUUID()
  const [eu, colega] = [randomUUID(), randomUUID()]
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.computadores(empresa_id uuid NOT NULL,id uuid NOT NULL,nome text NOT NULL,PRIMARY KEY(empresa_id,id));
    CREATE TABLE public.dispositivos_usuarios(empresa_id uuid NOT NULL,dispositivo uuid NOT NULL,usuario_id uuid NOT NULL,
      visto_em timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(empresa_id,dispositivo));
    CREATE FUNCTION public.gdo_empresa() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.empresa',true),'')::uuid$$;`)
  const dispositivo = async (
    emp: string,
    nome: string,
    usuario: string,
    visto: string
  ): Promise<string> => {
    const id = randomUUID()
    await pg.query('INSERT INTO computadores VALUES($1,$2,$3)', [emp, id, nome])
    await pg.query('INSERT INTO dispositivos_usuarios VALUES($1,$2,$3,$4)', [
      emp,
      id,
      usuario,
      visto
    ])
    return id
  }
  const ids = {
    d_antigo: await dispositivo(empresa, 'D-MATHEUS', eu, '2026-10-14T02:33:00Z'),
    d_atual: await dispositivo(empresa, 'D-MATHEUS', eu, '2026-10-24T01:04:00Z'),
    n_velho: await dispositivo(empresa, 'N-MATHEUS', eu, '2026-10-12T18:52:00Z'),
    n_meio: await dispositivo(empresa, 'N-MATHEUS', eu, '2026-10-14T02:39:00Z'),
    n_atual: await dispositivo(empresa, 'n-matheus ', eu, '2026-10-24T01:01:00Z'),
    do_colega: await dispositivo(empresa, 'N-MATHEUS', colega, '2026-10-20T00:00:00Z'),
    de_outra_empresa: await dispositivo(outra, 'OUTRO', eu, '2026-10-24T00:00:00Z')
  }
  await pg.exec(
    readFileSync(
      join(__dirname, '../../../supabase/migrations/014_computadores_unicos.sql'),
      'utf8'
    )
  )
  return { pg, empresa, ids }
}

it('lista cada computador uma vez, com o identificador visto por último', async () => {
  const { pg, empresa, ids } = await preparar()
  await pg.exec(`SET test.empresa='${empresa}'`)
  const { rows } = await pg.query<{ id: string; nome: string }>(
    'SELECT id,nome FROM public.gdo_computadores_v4()'
  )
  const escolhidos = new Set(rows.map((r) => r.id))
  expect(escolhidos).toEqual(new Set([ids.d_atual, ids.n_atual, ids.do_colega]))
  expect(rows).toHaveLength(3)
})

it('não mostra computadores de outra empresa nem identificadores antigos', async () => {
  const { pg, empresa, ids } = await preparar()
  await pg.exec(`SET test.empresa='${empresa}'`)
  const { rows } = await pg.query<{ id: string }>('SELECT id FROM public.gdo_computadores_v4()')
  const lista = rows.map((r) => r.id)
  for (const antigo of [ids.d_antigo, ids.n_velho, ids.n_meio, ids.de_outra_empresa])
    expect(lista).not.toContain(antigo)
})

it('a migração pode ser executada de novo', async () => {
  const { pg, empresa } = await preparar()
  await pg.exec(
    readFileSync(
      join(__dirname, '../../../supabase/migrations/014_computadores_unicos.sql'),
      'utf8'
    )
  )
  await pg.exec(`SET test.empresa='${empresa}'`)
  const { rows } = await pg.query('SELECT id FROM public.gdo_computadores_v4()')
  expect(rows).toHaveLength(3)
})
