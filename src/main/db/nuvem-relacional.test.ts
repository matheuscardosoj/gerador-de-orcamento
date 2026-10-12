import { beforeAll, afterAll, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { randomUUID, createHash } from 'crypto'

let pg: PGlite
const empresa = randomUUID(),
  outra = randomUUID(),
  pc = randomUUID()
const cliente = 'cliente',
  proposta = 'proposta',
  relatorio = 'relatorio',
  recibo = 'recibo'
const data = '2026-10-12',
  criado = '2026-10-12T00:00:00.000Z'
const metadados = (tipo: string, id: string) => [
  {
    tipo,
    documento_id: id,
    dados: JSON.stringify({
      computadorResponsavel: pc,
      clienteSnapshot: { id: cliente, nome: 'Nome congelado' }
    })
  }
]
const registroCliente = (id = cliente, nome = 'Nome atual') => ({
  tabela: 'clientes',
  id,
  row: {
    id,
    nome,
    tratamento: '',
    contato: null,
    observacao: null,
    ativo: 1,
    criado_em: criado,
    dados_json: JSON.stringify({
      id,
      nome,
      ativo: true,
      tipoPessoa: 'pj',
      documento: '',
      telefone: '',
      email: 'empresa@example.com',
      endereco: { cidade: 'Rio Verde', uf: 'GO' },
      extraFuturo: { valor: 2 }
    })
  }
})
const servico = {
  id: 's',
  ordem: 0,
  servico_id: null,
  descricao: 'Serviço',
  unidade: 'serviço',
  quantidade: 1,
  valor_unitario: 1000,
  valor_total: 1000,
  calculo_json: null
}
const payloadProposta = (id = proposta, numero = 1): Record<string, unknown> => ({
  tipo: 'orcamento',
  id,
  responsavel: pc,
  excluido: false,
  rows: {
    orcamentos: [
      {
        id,
        numero,
        data,
        cliente_id: cliente,
        destinatario: 'Nome congelado',
        formato: 'carta',
        titulo: 'Proposta',
        introducao: null,
        prazo_dias: null,
        observacao_interna: null,
        valor_total: 1000,
        status: 'rascunho',
        criado_em: criado,
        atualizado_em: criado
      }
    ],
    itens_servico: [{ ...servico, orcamento_id: id }],
    materiais: [],
    orcamento_textos: [],
    anexos: [],
    documento_meta: metadados('orcamento', id),
    versoes: []
  }
})
const payloadRelatorio = (): Record<string, unknown> => ({
  tipo: 'relatorio',
  id: relatorio,
  responsavel: pc,
  excluido: false,
  rows: {
    relatorios: [
      {
        id: relatorio,
        numero: 1,
        data,
        cliente_id: cliente,
        destinatario: '',
        formato: 'carta',
        titulo: 'Relatório',
        introducao: null,
        status: 'emitido',
        origem_orcamento_id: proposta,
        origem_orcamento_numero: 1,
        origem_orcamento_cliente: 'Nome congelado',
        total_servicos: 1000,
        total_adiantamentos: 200,
        total_reembolsos: 0,
        saldo: 800,
        criado_em: criado,
        atualizado_em: criado,
        observacao_interna: null
      }
    ],
    relatorio_itens_servico: [{ ...servico, relatorio_id: relatorio }],
    relatorio_lancamentos: [
      {
        id: 'pagamento',
        relatorio_id: relatorio,
        tipo: 'adiantamento',
        ordem: 0,
        descricao: 'Adiantamento',
        valor: 200
      }
    ],
    relatorio_textos: [],
    relatorio_anexos: [],
    documento_meta: metadados('relatorio', relatorio),
    versoes: []
  }
})
const payloadRecibo = (): Record<string, unknown> => ({
  tipo: 'recibo',
  id: recibo,
  responsavel: pc,
  excluido: false,
  rows: {
    recibos: [
      {
        id: recibo,
        numero: 1,
        dados: JSON.stringify({
          id: recibo,
          numero: 1,
          data,
          clienteId: cliente,
          destinatario: 'Nome congelado',
          descricao: 'Serviço',
          valor: 200,
          local: 'Rio Verde',
          formaPagamento: 'Pix',
          status: 'recebido',
          quitacao: 'parcial',
          origemTipo: 'relatorio',
          origemId: relatorio,
          adiantamentoId: 'pagamento',
          observacao: '',
          criadoEm: criado,
          atualizadoEm: criado
        })
      }
    ],
    documento_meta: metadados('recibo', recibo),
    versoes: [],
    recebimentos: [
      {
        id: 'recebimento',
        recibo_id: recibo,
        relatorio_id: relatorio,
        adiantamento_id: 'pagamento',
        valor: 200,
        estornado: 0
      }
    ]
  }
})
const aplicar = async (entidade: string, payload: unknown, base = 1) =>
  pg.query<Record<string, unknown>>('SELECT gdo_apply($1,$2,$3,$4,$5) r', [
    randomUUID(),
    entidade,
    base,
    JSON.stringify(payload),
    pc
  ])
beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await pg.query<Record<string, unknown>>('INSERT INTO auth.users VALUES ($1),($2)', [
    empresa,
    outra
  ])
  await pg.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    empresa
  ])
  await pg.exec(readFileSync('supabase/migrations/001_nuvem_legada.sql', 'utf8'))
  await pg.query<Record<string, unknown>>('SELECT gdo_device($1,$2)', [pc, 'Computador'])
  await pg.query<Record<string, unknown>>('SELECT gdo_bootstrap_numbers($1,$2)', [
    pc,
    JSON.stringify([
      { tipo: 'orcamento', numero: 1 },
      { tipo: 'relatorio', numero: 1 },
      { tipo: 'recibo', numero: 1 }
    ])
  ])
  for (const [entidade, payload] of [
    [`clientes:${cliente}`, registroCliente()],
    [`orcamento:${proposta}`, payloadProposta()],
    [`relatorio:${relatorio}`, payloadRelatorio()],
    [`recibo:${recibo}`, payloadRecibo()]
  ])
    await aplicar(String(entidade), payload, 0)
  await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))
}, 30000)
afterAll(async () => {
  await pg.close()
})

it('migra cadastros e pagamentos para campos nativos mantendo snapshots e complementos', async () => {
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT nome,tipo_pessoa,cpf_cnpj,email FROM clientes'
      )
    ).rows[0]
  ).toEqual({
    nome: 'Nome atual',
    tipo_pessoa: 'pj',
    cpf_cnpj: '',
    email: 'empresa@example.com'
  })
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT valor,status,forma_pagamento,cliente_id FROM recibos'
      )
    ).rows[0]
  ).toEqual({
    valor: '200',
    status: 'recebido',
    forma_pagamento: 'Pix',
    cliente_id: cliente
  })
  const snapshot = (
    await pg.query<Record<string, unknown>>(
      "SELECT dados->'clienteSnapshot' snapshot FROM documentos WHERE tipo='orcamento'"
    )
  ).rows[0].snapshot
  expect(snapshot).toEqual({ id: cliente, nome: 'Nome congelado' })
  expect(
    (
      await pg.query<Record<string, unknown>>(
        "SELECT (payload->'row'->>'dados_json')::jsonb->'extraFuturo' extra FROM gdo_entities WHERE entidade=$1",
        [`clientes:${cliente}`]
      )
    ).rows[0].extra
  ).toEqual({ valor: 2 })
  expect(
    (
      await pg.query<Record<string, unknown>>(
        "SELECT to_regclass('sincronizacao.legado_em_migracao') legado"
      )
    ).rows[0].legado
  ).toBeNull()
})
it('preserva a compatibilidade e as revisões ao reexecutar o script', async () => {
  const antes = (
    await pg.query<Record<string, unknown>>(
      'SELECT entidade,revisao,sequencia FROM gdo_entities ORDER BY entidade'
    )
  ).rows
  await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT entidade,revisao,sequencia FROM gdo_entities ORDER BY entidade'
      )
    ).rows
  ).toEqual(antes)
})
it('aceita rascunho offline com identificador negativo amplo sem consumir número oficial', async () => {
  const negativo = -123456789012
  await aplicar('orcamento:offline', payloadProposta('offline', negativo), 0)
  expect(
    (await pg.query<Record<string, unknown>>("SELECT numero FROM orcamentos WHERE id='offline'"))
      .rows[0].numero
  ).toBe(negativo)
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT count(*) n FROM reservas_numeros WHERE tipo=$1',
        ['orcamento']
      )
    ).rows[0].n
  ).toBe(1)
})
it('rejeita cliente de outra empresa e mantém a revisão e o documento anteriores', async () => {
  await pg.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    outra
  ])
  await pg.query<Record<string, unknown>>('SELECT gdo_device($1,$2)', [
    pc,
    'Computador da outra empresa'
  ])
  await aplicar('clientes:outro', registroCliente('outro', 'Outro cliente'), 0)
  await pg.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    empresa
  ])
  const p = payloadProposta() as { rows: { orcamentos: Array<{ cliente_id: string }> } }
  p.rows.orcamentos[0].cliente_id = 'outro'
  await expect(aplicar(`orcamento:${proposta}`, p)).rejects.toThrow('fk_orcamento_cliente')
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT revisao FROM gdo_entities WHERE entidade=$1',
        [`orcamento:${proposta}`]
      )
    ).rows[0].revisao
  ).toBe(1)
})
it('bloqueia diferença entre recibo, pagamento e adiantamento sem gravação parcial', async () => {
  const p = payloadRecibo() as { rows: { recebimentos: Array<{ valor: number }> } }
  p.rows.recebimentos[0].valor = 201
  await expect(aplicar(`recibo:${recibo}`, p)).rejects.toThrow('confirmados juntos')
  expect(
    (await pg.query<Record<string, unknown>>('SELECT valor FROM recebimentos')).rows[0].valor
  ).toBe('200')
  const r = payloadRelatorio() as { rows: { relatorios: Array<{ saldo: number }> } }
  r.rows.relatorios[0].saldo = 999
  await expect(aplicar(`relatorio:${relatorio}`, r)).rejects.toThrow('divergentes')
  expect(
    (await pg.query<Record<string, unknown>>('SELECT saldo FROM relatorios')).rows[0].saldo
  ).toBe('800')
})
it('isola também a leitura das tabelas e da consulta de transporte', async () => {
  await pg.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    outra
  ])
  await pg.exec('SET ROLE authenticated')
  try {
    expect((await pg.query<Record<string, unknown>>('SELECT id FROM clientes')).rows).toEqual([
      { id: 'outro' }
    ])
    for (const t of [
      'orcamentos',
      'relatorios',
      'recibos',
      'recebimentos',
      'documentos',
      'versoes_documentos',
      'imagens'
    ])
      expect((await pg.query<Record<string, unknown>>(`SELECT * FROM ${t}`)).rows).toHaveLength(0)
    expect(
      (await pg.query<Record<string, unknown>>('SELECT entidade FROM gdo_entities')).rows
    ).toEqual([{ entidade: 'clientes:outro' }])
  } finally {
    await pg.exec('RESET ROLE')
    await pg.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      empresa
    ])
  }
})
it('revoga a escrita direta em tabelas e funções internas', async () => {
  await pg.exec('SET ROLE authenticated')
  try {
    await expect(pg.query<Record<string, unknown>>('DELETE FROM recibos')).rejects.toThrow(
      'permission denied'
    )
    await expect(
      pg.query<Record<string, unknown>>('SELECT sincronizacao.materializar($1,$2,$3)', [
        empresa,
        'clientes:x',
        '{}'
      ])
    ).rejects.toThrow('permission denied')
  } finally {
    await pg.exec('RESET ROLE')
  }
})
it('recusa campos desconhecidos sem perder informação de uma versão futura', async () => {
  const p = payloadProposta() as { rows: { orcamentos: Array<Record<string, unknown>> } }
  p.rows.orcamentos[0].campoNovo = 'Preservar'
  await expect(aplicar(`orcamento:${proposta}`, p)).rejects.toThrow('Campos incompatíveis')
  expect(
    (
      await pg.query<Record<string, unknown>>(
        'SELECT revisao FROM gdo_entities WHERE entidade=$1',
        [`orcamento:${proposta}`]
      )
    ).rows[0].revisao
  ).toBe(1)
})
it('reverte o esquema inteiro quando uma migração não consegue preservar um campo', async () => {
  const isolado = new PGlite()
  try {
    await isolado.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;`
    )
    await isolado.query<Record<string, unknown>>('INSERT INTO auth.users VALUES ($1)', [empresa])
    await isolado.exec(readFileSync('supabase/migrations/001_nuvem_legada.sql', 'utf8'))
    const payload = {
      tabela: 'servicos',
      id: 's',
      row: {
        id: 's',
        nome: 'Serviço',
        descricao_padrao: '',
        unidade: '',
        preco_referencia: null,
        ordem: 0,
        campoFuturo: 'Valor que não pode desaparecer'
      }
    }
    await isolado.query<Record<string, unknown>>('INSERT INTO gdo_entities VALUES ($1,$2,1,$3,1)', [
      empresa,
      'servicos:s',
      JSON.stringify(payload)
    ])
    await expect(isolado.exec(readFileSync('supabase/schema.sql', 'utf8'))).rejects.toThrow(
      'migração alteraria'
    )
    await isolado.exec('ROLLBACK')
    expect(
      (await isolado.query<Record<string, unknown>>('SELECT payload FROM gdo_entities')).rows[0]
        .payload
    ).toEqual(payload)
    expect(
      (await isolado.query<Record<string, unknown>>("SELECT to_regclass('public.clientes') tabela"))
        .rows[0].tabela
    ).toBeNull()
  } finally {
    await isolado.close()
  }
})
it('preserva versões imutáveis e impede apagar uma imagem usada pelo histórico', async () => {
  const imagemHash = createHash('sha256').update('X').digest('hex')
  await aplicar(
    `imagens:${imagemHash}`,
    {
      tabela: 'imagens',
      id: imagemHash,
      row: {
        hash: imagemHash,
        mime: 'image/jpeg',
        base64: 'WA==',
        miniatura_base64: null,
        bytes: 1,
        largura: 1,
        altura: 1
      }
    },
    0
  )
  const p = payloadProposta() as { rows: { versoes: Array<Record<string, unknown>> } }
  p.rows.versoes.push({
    id: 'v1',
    tipo: 'orcamento',
    documento_id: proposta,
    numero: 1,
    anterior_id: null,
    criado_em: criado,
    computador: 'Computador',
    descricao: 'Inicial',
    documento: JSON.stringify({
      id: proposta,
      numero: 1,
      versao: 1,
      clienteSnapshot: { nome: 'Nome congelado' },
      anexos: [{ id: 'a', imagemHash }]
    })
  })
  await aplicar(`orcamento:${proposta}`, p)
  expect(
    (await pg.query<Record<string, unknown>>('SELECT imagem_hash FROM imagens_versoes')).rows
  ).toEqual([{ imagem_hash: imagemHash }])
  const mudado = structuredClone(p)
  mudado.rows.versoes[0].descricao = 'Alteração indevida de uma versão existente'
  await expect(aplicar(`orcamento:${proposta}`, mudado, 2)).rejects.toThrow('não pode ser alterada')
  await expect(
    aplicar(`imagens:${imagemHash}`, { tabela: 'imagens', id: imagemHash })
  ).rejects.toThrow('fk_imagem_historica')
  expect(
    (await pg.query<Record<string, unknown>>('SELECT base64 FROM imagens')).rows[0].base64
  ).toBe('WA==')
})
it('executa gravações e validação financeira com o papel autenticado usado no Supabase real', async () => {
  await pg.exec('SET ROLE authenticated')
  try {
    await aplicar(`clientes:${cliente}`, registroCliente(cliente, 'Nome atualizado'))
    await aplicar(`recibo:${recibo}`, payloadRecibo())
    expect((await pg.query<{ nome: string }>('SELECT nome FROM clientes')).rows[0].nome).toBe(
      'Nome atualizado'
    )
    const errado = payloadRecibo() as { rows: { recebimentos: Array<{ valor: number }> } }
    errado.rows.recebimentos[0].valor = 201
    await expect(aplicar(`recibo:${recibo}`, errado, 2)).rejects.toThrow('confirmados juntos')
  } finally {
    await pg.exec('RESET ROLE')
  }
})
