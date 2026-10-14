// Contrato explícito entre as tabelas de domínio PostgreSQL e as linhas SQLite.
// O SQL gerado é autocontido e pode ser executado no SQL Editor do Supabase.
import { readFileSync, writeFileSync } from 'node:fs'
const campos = (texto) =>
  texto.split(',').map((s) => {
    const [nome, tipo = 'text'] = s.trim().split(':')
    return { nome, tipo }
  })
const tabelas = [
  [
    'servicos',
    'servicos',
    'id,nome,descricao_padrao,unidade,preco_referencia:numeric,ordem:integer,codigo:bigint',
    ['id']
  ],
  [
    'observacoes_padrao',
    'observacoes_padrao',
    'id,texto,padrao:integer,ordem:integer,aplicacao',
    ['id']
  ],
  [
    'pagamentos_padrao',
    'formas_pagamento_padrao',
    'id,texto,padrao:integer,ordem:integer,aplicacao',
    ['id']
  ],
  ['configuracoes', 'configuracoes_empresa', 'chave,valor:jsonb', ['chave']],
  [
    'imagens',
    'imagens',
    'hash,mime,base64,miniatura_base64,bytes:integer,largura:integer,altura:integer',
    ['hash']
  ],
  [
    'orcamentos',
    'orcamentos',
    'id,numero:integer,data,cliente_id,destinatario,formato,titulo,introducao,prazo_dias:integer,observacao_interna,valor_total:numeric,status,criado_em,atualizado_em',
    ['id']
  ],
  [
    'itens_servico',
    'itens_orcamento',
    'id,orcamento_id,ordem:integer,servico_id,descricao,unidade,quantidade:numeric,valor_unitario:numeric,valor_total:numeric,calculo_json:jsonb',
    ['orcamento_id', 'id']
  ],
  [
    'materiais',
    'materiais_orcamento',
    'id,orcamento_id,ordem:integer,quantidade:numeric,unidade,especificacao',
    ['orcamento_id', 'id']
  ],
  [
    'orcamento_textos',
    'textos_orcamento',
    'id,orcamento_id,tipo,ordem:integer,texto,origem_padrao_id',
    ['orcamento_id', 'id']
  ],
  [
    'anexos',
    'anexos_orcamento',
    'id,orcamento_id,item_servico_id,ordem:integer,titulo,descricao,mime,largura:integer,altura:integer,imagem,miniatura',
    ['orcamento_id', 'id']
  ],
  [
    'relatorios',
    'relatorios',
    'id,numero:integer,data,cliente_id,destinatario,formato,titulo,introducao,status,origem_orcamento_id,origem_orcamento_numero:integer,origem_orcamento_cliente,total_servicos:numeric,total_adiantamentos:numeric,total_reembolsos:numeric,saldo:numeric,criado_em,atualizado_em,observacao_interna',
    ['id']
  ],
  [
    'relatorio_itens_servico',
    'itens_relatorio',
    'id,relatorio_id,ordem:integer,servico_id,descricao,unidade,quantidade:numeric,valor_unitario:numeric,valor_total:numeric,calculo_json:jsonb',
    ['relatorio_id', 'id']
  ],
  [
    'relatorio_lancamentos',
    'lancamentos_relatorio',
    'id,relatorio_id,tipo,ordem:integer,descricao,valor:numeric',
    ['relatorio_id', 'id']
  ],
  [
    'relatorio_textos',
    'textos_relatorio',
    'id,relatorio_id,tipo,ordem:integer,texto,origem_padrao_id',
    ['relatorio_id', 'id']
  ],
  [
    'relatorio_anexos',
    'anexos_relatorio',
    'id,relatorio_id,referencia_tipo,referencia_id,ordem:integer,titulo,descricao,mime,largura:integer,altura:integer,imagem,miniatura',
    ['relatorio_id', 'id']
  ],
  [
    'versoes',
    'versoes_documentos',
    'id,tipo,documento_id,numero:integer,anterior_id,criado_em,computador,descricao,documento:jsonb',
    ['id']
  ],
  [
    'recebimentos',
    'recebimentos',
    'id,recibo_id,relatorio_id,adiantamento_id,valor:numeric,estornado:integer',
    ['id']
  ]
].map(([wire, nome, spec, chaves]) => ({ wire, nome, campos: campos(spec), chaves }))
const cliente = {
  id: ['id', 'text'],
  nome: ['nome', 'text'],
  tratamento: ['tratamento', 'text'],
  contato: ['contato', 'text'],
  observacao: ['observacao', 'text'],
  ativo: ['ativo:boolean', 'integer'],
  criadoEm: ['criado_em', 'text'],
  tipoPessoa: ['tipo_pessoa', 'text'],
  documento: ['cpf_cnpj', 'text'],
  telefone: ['telefone', 'text'],
  email: ['email', 'text'],
  endereco: ['endereco', 'jsonb'],
  nomeFantasia: ['nome_fantasia', 'text'],
  pessoaContato: ['pessoa_contato', 'text'],
  codigo: ['codigo', 'bigint']
}
const recibo = {
  id: ['id', 'text'],
  numero: ['numero', 'bigint'],
  data: ['data', 'text'],
  clienteId: ['cliente_id', 'text'],
  destinatario: ['destinatario', 'text'],
  descricao: ['descricao', 'text'],
  valor: ['valor', 'numeric'],
  local: ['local_pagamento', 'text'],
  formaPagamento: ['forma_pagamento', 'text'],
  status: ['status', 'text'],
  quitacao: ['quitacao', 'text'],
  origemTipo: ['origem_tipo', 'text'],
  origemId: ['origem_id', 'text'],
  adiantamentoId: ['adiantamento_id', 'text'],
  observacao: ['observacao', 'text'],
  criadoEm: ['criado_em', 'text'],
  atualizadoEm: ['atualizado_em', 'text']
}
const jsonMapping = (obj) =>
  JSON.stringify(Object.fromEntries(Object.entries(obj).map(([key, [col]]) => [key, col])))
const sqlTexto = (s) => `'${s.replaceAll("'", "''")}'`
const expressao = (f, obj) =>
  f.tipo === 'jsonb'
    ? `(${obj}->>${sqlTexto(f.nome)})::jsonb`
    : `(${obj}->>${sqlTexto(f.nome)})::${f.tipo}`
const insert = (nome, cs, chaves) =>
  `INSERT INTO public.${nome} (${cs.join(',')}) VALUES (${cs.map((_, i) => `v${i}`).join(',')}) ON CONFLICT (${['empresa_id', ...chaves].join(',')}) DO UPDATE SET ${cs
    .filter((c) => c !== 'empresa_id' && !chaves.includes(c))
    .map((c) => `${c}=excluded.${c}`)
    .join(',')}`
let ddl = '',
  casosEntrada = '',
  casosSaida = ''
for (const t of tabelas) {
  for (const f of t.campos) {
    if (f.nome === 'data') f.tipo = 'date'
    if ((f.nome === 'numero' && t.wire !== 'versoes') || f.nome === 'origem_orcamento_numero')
      f.tipo = 'bigint'
  }
  ddl += `CREATE TABLE IF NOT EXISTS public.${t.nome} (empresa_id uuid NOT NULL REFERENCES auth.users(id), ${t.campos.map((f) => `${f.nome} ${f.tipo}${t.chaves.includes(f.nome) ? ' NOT NULL' : ''}`).join(', ')}, PRIMARY KEY (empresa_id,${t.chaves.join(',')}));\n`
  const cols = ['empresa_id', ...t.campos.map((f) => f.nome)],
    vals = ['p_empresa', ...t.campos.map((f) => expressao(f, 'p_row'))]
  casosEntrada += `WHEN ${sqlTexto(t.wire)} THEN ${insert(t.nome, cols, t.chaves).replace(/v(\d+)/g, (_, i) => vals[Number(i)])};\n`
  const wire = t.campos
    .map(
      (f) =>
        `${sqlTexto(f.nome)},${f.tipo === 'jsonb' ? `CASE WHEN r.${f.nome} IS NULL THEN NULL ELSE r.${f.nome}::text END` : `r.${f.nome}`}`
    )
    .join(',')
  casosSaida += `WHEN ${sqlTexto(t.wire)} THEN SELECT coalesce(jsonb_agg(jsonb_build_object(${wire}) ORDER BY ${t.chaves.map((k) => `r.${k}`).join(',')}),'[]'::jsonb) INTO resultado FROM public.${t.nome} r WHERE r.empresa_id=p_empresa AND ${t.wire === 'versoes' ? 'r.tipo=p_tipo AND r.documento_id=p_id' : t.wire === 'recebimentos' ? 'r.recibo_id=p_id' : t.campos.some((f) => f.nome === 'orcamento_id') ? 'r.orcamento_id=p_id' : t.campos.some((f) => f.nome === 'relatorio_id') ? 'r.relatorio_id=p_id' : `r.${t.chaves[0]}=p_id`};\n`
}
function especial(nome, map, base, baseKeys, jsonCol) {
  const complementos = Object.entries(map).filter(
    ([, [n]]) => !base.some((f) => f.nome === n.split(':')[0])
  )
  const keys = Object.keys(map),
    cols = [
      'empresa_id',
      ...base.map((f) => f.nome),
      ...complementos.map(([, v]) => v[0]),
      'campos_presentes',
      'dados_adicionais'
    ]
  ddl += `CREATE TABLE IF NOT EXISTS public.${nome} (empresa_id uuid NOT NULL REFERENCES auth.users(id),${base.map((f) => `${f.nome} ${f.tipo}${baseKeys.includes(f.nome) ? ' NOT NULL' : ''}`).join(',')},${complementos.map(([, [n, t]]) => `${n} ${n === 'data' ? 'date' : t}`).join(',')},campos_presentes text[] NOT NULL, dados_adicionais jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(empresa_id,${baseKeys.join(',')}));\n`
  const vals = [
    'p_empresa',
    ...base.map((f) => expressao(f, 'p_row')),
    ...complementos.map(([key, [n, tipo]]) =>
      tipo === 'jsonb'
        ? `d->${sqlTexto(key)}`
        : `(d->>${sqlTexto(key)})::${n === 'data' ? 'date' : tipo}`
    ),
    `ARRAY(SELECT jsonb_object_keys(d) INTERSECT SELECT unnest(ARRAY[${keys.map(sqlTexto).join(',')}]::text[]))`,
    `d - ARRAY[${keys.map(sqlTexto).join(',')}]::text[]`
  ]
  casosEntrada += `WHEN ${sqlTexto(nome)} THEN d:=(p_row->>${sqlTexto(jsonCol)})::jsonb; IF jsonb_typeof(d)<>'object' THEN RAISE EXCEPTION 'Conteúdo inválido em ${nome}'; END IF; ${insert(nome, cols, baseKeys).replace(/v(\d+)/g, (_, i) => vals[Number(i)])};\n`
  const wireBase = base.map((f) => `${sqlTexto(f.nome)},r.${f.nome}`).join(',')
  const jsonOut = `sincronizacao.recompor_json(to_jsonb(r), ${sqlTexto(jsonMapping(map))}::jsonb,r.campos_presentes,r.dados_adicionais)::text`
  casosSaida += `WHEN ${sqlTexto(nome)} THEN SELECT coalesce(jsonb_agg(jsonb_build_object(${wireBase},${sqlTexto(jsonCol)},${jsonOut})),'[]'::jsonb) INTO resultado FROM public.${nome} r WHERE r.empresa_id=p_empresa AND r.id=p_id;\n`
}
especial(
  'clientes',
  cliente,
  campos('id,nome,tratamento,contato,observacao,ativo:integer,criado_em'),
  ['id'],
  'dados_json'
)
especial('recibos', recibo, campos('id,numero:bigint'), ['id'], 'dados')
const nomes = [
  ...tabelas.map((t) => t.nome),
  'clientes',
  'recibos',
  'documentos',
  'imagens_versoes',
  'codigos_cadastros'
]
const sql = readFileSync('supabase/relacional-base.sql', 'utf8')
  .replace('__TABELAS__', ddl)
  .replace('__ENTRADA__', casosEntrada)
  .replace('__SAIDA__', casosSaida)
  .replaceAll('__NOMES__', nomes.map(sqlTexto).join(','))
writeFileSync(
  'supabase/schema.sql',
  `-- Gerado por scripts/gerar-schema-nuvem.mjs. Edite o contrato ou relacional-base.sql.\n${sql}`
)
console.log(`Esquema gerado: ${nomes.length} tabelas de domínio.`)
const colaboracao = readFileSync('supabase/colaboracao.sql', 'utf8')
const legado = `-- Protocolo 2: fixture de regressão.\n${sql.replace(/COMMIT;\s*$/, '')}\n${colaboracao}\nCOMMIT;\n`
writeFileSync('supabase/migrations/002_colaboracao_v2.sql', legado)
const extrair = (fonte, nome) => {
  const inicio = fonte.indexOf(`CREATE OR REPLACE FUNCTION ${nome}(`)
  const fim = fonte.indexOf('END $$;', inicio)
  if (inicio < 0 || fim < 0) throw new Error(`Contrato SQL ausente: ${nome}`)
  return fonte.slice(inicio, fim + 7)
}
let validador = extrair(colaboracao, 'public.gdo_batch_v2')
  .replace('public.gdo_batch_v2', 'sincronizacao.batch_colaboracao_v3')
  .replace("set_config('gdo.protocolo','2'", "set_config('gdo.protocolo','3'")
  .replaceAll('identificadores_documento', 'autoria_documentos')
validador = validador.replace(
  / {8}INSERT INTO sincronizacao.contadores_internos[\s\S]*?INSERT INTO autoria_documentos VALUES\(e,t,id_doc,n,auth.uid\(\),auth.uid\(\)\);/,
  '        INSERT INTO autoria_documentos VALUES(e,t,id_doc,auth.uid(),auth.uid());'
)
if (validador.includes('contadores_internos'))
  throw new Error('Validador ainda contém contador interno')
let apply = extrair(sql, 'public.gdo_apply').replaceAll('auth.uid()', 'public.gdo_empresa()')
apply = apply.replace(
  "IF dono IS NOT NULL AND dono<>p_dispositivo THEN RAISE EXCEPTION 'Documento pertence a outro computador'; END IF;",
  ''
)
apply = apply.replace(
  /IF n>0 THEN UPDATE reservas_numeros[\s\S]*?END IF; END IF;/,
  "IF n<=0 OR NOT EXISTS(SELECT 1 FROM numeros_documentos WHERE empresa_id=u AND tipo=t AND numero=n AND documento_id=doc) THEN RAISE EXCEPTION 'Número definitivo inválido'; END IF;"
)
if (apply.includes('UPDATE reservas_numeros')) throw new Error('Apply ainda usa reservas')
apply = apply.replace(
  'BEGIN\n',
  "BEGIN\n  IF current_setting('gdo.protocolo',true) IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'Atualize o aplicativo para o protocolo 3'; END IF;\n"
)
const sequencial = readFileSync('supabase/numeracao-sequencial.sql', 'utf8')
  .replace('__VALIDADOR_V3__', () => validador)
  .replace('__APPLY_V3__', () => apply)
writeFileSync(
  'supabase/schema-colaboracao.sql',
  `-- Instalação/migração 1.5, protocolo 3. Execute inteiro.\n${sql.replace(/COMMIT;\s*$/, '')}\n${colaboracao}\n${sequencial}\nCOMMIT;\n`
)
