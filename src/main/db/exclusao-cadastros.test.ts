import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { createHash, randomUUID } from 'crypto'
import { readFileSync } from 'fs'

const pg = new PGlite(),
  empresa = randomUUID(),
  computador = randomUUID()
const criado = '2026-10-12T00:00:00.000Z'
const cliente = (id: string) => ({
  id,
  nome: 'Cliente de teste',
  tratamento: '',
  contato: null,
  observacao: null,
  ativo: 1,
  criado_em: criado,
  dados_json: JSON.stringify({
    id,
    nome: 'Cliente de teste',
    ativo: true,
    tipoPessoa: 'pf',
    codigo: 1
  })
})
const aplicar = async (
  tabela: string,
  id: string,
  payload: unknown,
  base = 0,
  operacao = randomUUID()
) => {
  try {
    return (
      await pg.query<{ r: { ok: boolean; resultados: Array<{ revisao: number }> } }>(
        'SELECT gdo_batch_v3($1,$2) r',
        [JSON.stringify([{ id: operacao, entidade: `${tabela}:${id}`, base, payload }]), computador]
      )
    ).rows[0].r
  } catch (e) {
    throw new Error(`${tabela}:${id}: ${String(e)}`)
  }
}

beforeAll(async () => {
  await pg.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await pg.query('INSERT INTO auth.users VALUES ($1,$2)', [empresa, 'exclusao@example.com'])
  await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [empresa])
  await pg.exec(readFileSync('supabase/schema-colaboracao.sql', 'utf8'))
  await pg.exec(readFileSync('supabase/migrations/003_exclusao_cadastros.sql', 'utf8'))
  await pg.exec('SET ROLE authenticated')
  await pg.query('SELECT gdo_contexto_v3(true)')
  await pg.query('SELECT gdo_dispositivo_v3($1,$2)', [computador, 'Computador de teste'])
}, 30000)
afterAll(async () => {
  await pg.close()
})

it('aceita exclusão com row nulo ou ausente nas seis coleções compartilhadas', async () => {
  const bytes = Buffer.from('imagem de teste'),
    hash = createHash('sha256').update(bytes).digest('hex')
  const registros: Array<[string, string, Record<string, unknown>]> = [
    ['clientes', 'cliente-excluir', cliente('cliente-excluir')],
    [
      'servicos',
      'servico-excluir',
      {
        id: 'servico-excluir',
        nome: 'Serviço',
        descricao_padrao: '',
        unidade: '',
        preco_referencia: null,
        ordem: 0,
        codigo: 1
      }
    ],
    ...['observacoes_padrao', 'pagamentos_padrao'].map(
      (tabela): [string, string, Record<string, unknown>] => [
        tabela,
        tabela,
        { id: tabela, texto: 'Texto', padrao: 0, ordem: 0, aplicacao: 'todos' }
      ]
    ),
    ['configuracoes', 'camposClientePadrao', { chave: 'camposClientePadrao', valor: '[]' }],
    [
      'imagens',
      hash,
      {
        hash,
        mime: 'image/jpeg',
        base64: bytes.toString('base64'),
        miniatura_base64: null,
        bytes: bytes.length,
        largura: 1,
        altura: 1
      }
    ]
  ]
  for (const [tabela, id, row] of registros) {
    for (const nulo of [true, false]) {
      const base = nulo ? 0 : 2
      expect((await aplicar(tabela, id, { tabela, id, row }, base)).ok).toBe(true)
      const payload = nulo ? { tabela, id, row: null } : { tabela, id }
      expect((await aplicar(tabela, id, payload, base + 1)).ok).toBe(true)
      const remoto = (
        await pg.query<{ r: { payload: unknown; revisao: number } }>(
          "SELECT e AS r FROM gdo_alteracoes_v3(0,100) e WHERE e->>'entidade'=$1",
          [`${tabela}:${id}`]
        )
      ).rows[0].r
      expect(remoto).toMatchObject({ payload: { tabela, id }, revisao: base + 2 })
      expect(remoto.payload).not.toHaveProperty('row')
    }
  }
})

it('atribui códigos únicos pelo servidor quando dois computadores enviam o mesmo código local', async () => {
  const proximo = (
    await pg.query<{ n: number }>(
      "SELECT coalesce(max(codigo),0)+1 n FROM codigos_cadastros WHERE tipo='cliente'"
    )
  ).rows[0].n
  const linha = (id: string, nome: string) => {
    const c = cliente(id)
    c.nome = nome
    c.dados_json = JSON.stringify({ ...JSON.parse(c.dados_json), nome, codigo: 1 })
    return c
  }
  await aplicar('clientes', 'codigo-a', {
    tabela: 'clientes',
    id: 'codigo-a',
    row: linha('codigo-a', 'A')
  })
  await aplicar('clientes', 'codigo-b', {
    tabela: 'clientes',
    id: 'codigo-b',
    row: linha('codigo-b', 'B')
  })
  expect(
    (
      await pg.query(
        "SELECT codigo FROM clientes WHERE id IN ('codigo-a','codigo-b') ORDER BY codigo"
      )
    ).rows
  ).toEqual([{ codigo: proximo }, { codigo: proximo + 1 }])
  expect(
    (
      await pg.query(
        "SELECT tipo,codigo,cadastro_id FROM codigos_cadastros WHERE cadastro_id IN ('codigo-a','codigo-b') ORDER BY codigo"
      )
    ).rows
  ).toEqual([
    { tipo: 'cliente', codigo: proximo, cadastro_id: 'codigo-a' },
    { tipo: 'cliente', codigo: proximo + 1, cadastro_id: 'codigo-b' }
  ])
})

it('reenvia a mesma exclusão sem consumir outra revisão', async () => {
  const id = 'cliente-reenvio',
    tabela = 'clientes'
  await aplicar(tabela, id, { tabela, id, row: cliente(id) })
  const operacao = randomUUID(),
    payload = { tabela, id, row: null }
  const primeira = await aplicar(tabela, id, payload, 1, operacao)
  const repetida = await aplicar(tabela, id, payload, 1, operacao)
  expect(primeira).toEqual(repetida)
  expect(repetida.resultados).toMatchObject([{ revisao: 2 }])
})

it('preserva a rejeição de campos desconhecidos e a linha anterior na falha', async () => {
  const id = 'cliente-campo-desconhecido',
    tabela = 'clientes'
  await aplicar(tabela, id, { tabela, id, row: cliente(id) })
  await expect(
    aplicar(tabela, id, { tabela, id, row: null, campoFuturo: 'Não ignorar' }, 1)
  ).rejects.toThrow('Campos incompatíveis')
  expect((await pg.query('SELECT nome FROM clientes WHERE id=$1', [id])).rows).toEqual([
    { nome: 'Cliente de teste' }
  ])
  const desconhecida = { tabela: 'colecao_futura', id: 'x', row: null }
  await pg.exec('RESET ROLE')
  try {
    const normalizada = (
      await pg.query<{ r: unknown }>('SELECT sincronizacao.semantico($1::jsonb) r', [
        JSON.stringify(desconhecida)
      ])
    ).rows[0].r
    expect(normalizada).toEqual(desconhecida)
  } finally {
    await pg.exec('SET ROLE authenticated')
  }
})

it('impede excluir cliente vinculado a recibo e conserva o snapshot antigo', async () => {
  const id = 'cliente-vinculado',
    reciboId = 'recibo-vinculado',
    snapshot = { id, nome: 'Nome preservado no recibo' }
  await aplicar('clientes', id, { tabela: 'clientes', id, row: cliente(id) })
  const documento = {
    id: reciboId,
    numero: -1,
    data: '2026-10-12',
    clienteId: id,
    clienteSnapshot: snapshot,
    destinatario: snapshot.nome,
    descricao: 'Serviço',
    valor: 100,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'rascunho',
    quitacao: 'parcial',
    observacao: '',
    criadoEm: criado,
    atualizadoEm: criado
  }
  const payload = {
    tipo: 'recibo',
    id: reciboId,
    responsavel: computador,
    excluido: false,
    rows: {
      recibos: [{ id: reciboId, numero: -1, dados: JSON.stringify(documento) }],
      documento_meta: [
        {
          tipo: 'recibo',
          documento_id: reciboId,
          dados: JSON.stringify({ computadorResponsavel: computador, clienteSnapshot: snapshot })
        }
      ],
      versoes: [
        {
          id: 'versao-recibo-vinculado',
          tipo: 'recibo',
          documento_id: reciboId,
          numero: 1,
          anterior_id: null,
          criado_em: criado,
          computador: 'Computador de teste',
          descricao: 'Original',
          documento: JSON.stringify(documento)
        }
      ],
      recebimentos: []
    }
  }
  expect((await aplicar('recibo', reciboId, payload)).ok).toBe(true)
  const antes = (await pg.query('SELECT documento FROM versoes_documentos')).rows
  await expect(aplicar('clientes', id, { tabela: 'clientes', id, row: null }, 1)).rejects.toThrow(
    'foreign key constraint'
  )
  expect((await pg.query('SELECT nome FROM clientes WHERE id=$1', [id])).rows).toHaveLength(1)
  expect((await pg.query('SELECT documento FROM versoes_documentos')).rows).toEqual(antes)
})
