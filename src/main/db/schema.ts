// Schema do banco, versionado por `PRAGMA user_version`.
// Cada entrada de MIGRACOES é aplicada uma única vez, em ordem — para evoluir o
// schema, ACRESCENTE uma nova função ao fim do array (nunca edite as anteriores).
import type { Database } from 'node-sqlite3-wasm'
import { createHash } from 'crypto'
import { normalizarTipoCliente } from '@shared/clientes'

// Singletons (empresa, parâmetros, configuração de IA, contador de numeração)
// vivem em `configuracoes` como JSON: são lidos e gravados sempre inteiros e
// ganham campos com frequência — colunas exigiriam uma migração a cada campo novo.
const v1 = (d: Database): void => {
  d.exec(`
    CREATE TABLE configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tratamento TEXT NOT NULL DEFAULT '',
      contato TEXT,
      observacao TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE servicos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao_padrao TEXT NOT NULL DEFAULT '',
      unidade TEXT NOT NULL DEFAULT '',
      preco_referencia REAL
    );

    CREATE TABLE observacoes_padrao (
      id TEXT PRIMARY KEY,
      texto TEXT NOT NULL,
      padrao INTEGER NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE pagamentos_padrao (
      id TEXT PRIMARY KEY,
      texto TEXT NOT NULL,
      padrao INTEGER NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE orcamentos (
      id TEXT PRIMARY KEY,
      numero INTEGER NOT NULL UNIQUE,
      data TEXT NOT NULL,
      cliente_id TEXT REFERENCES clientes(id) ON DELETE SET NULL,
      destinatario TEXT NOT NULL DEFAULT '',
      formato TEXT NOT NULL DEFAULT 'carta',
      titulo TEXT NOT NULL DEFAULT '',
      introducao TEXT,
      prazo_dias INTEGER,
      observacao_interna TEXT,
      valor_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'rascunho',
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE itens_servico (
      id TEXT NOT NULL,
      orcamento_id TEXT NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      servico_id TEXT,
      descricao TEXT NOT NULL DEFAULT '',
      unidade TEXT NOT NULL DEFAULT '',
      quantidade REAL NOT NULL DEFAULT 0,
      valor_unitario REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,
      calculo_json TEXT,
      -- O id do item só precisa ser único DENTRO do orçamento: orçamentos
      -- duplicados no formato antigo repetiam os ids dos filhos.
      PRIMARY KEY (orcamento_id, id)
    );

    CREATE TABLE materiais (
      id TEXT NOT NULL,
      orcamento_id TEXT NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      quantidade REAL NOT NULL DEFAULT 0,
      unidade TEXT NOT NULL DEFAULT '',
      especificacao TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (orcamento_id, id)
    );

    CREATE TABLE orcamento_textos (
      id TEXT NOT NULL,
      orcamento_id TEXT NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      texto TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (orcamento_id, id)
    );

    CREATE TABLE anexos (
      id TEXT PRIMARY KEY,
      orcamento_id TEXT NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      item_servico_id TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      titulo TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT 'image/jpeg',
      largura INTEGER NOT NULL DEFAULT 0,
      altura INTEGER NOT NULL DEFAULT 0,
      imagem BLOB,
      miniatura BLOB
    );

    -- itens_servico, materiais e orcamento_textos já são indexados pela própria
    -- chave primária composta, que começa por orcamento_id.
    CREATE INDEX idx_anexos_orcamento ON anexos(orcamento_id);
    CREATE INDEX idx_orcamentos_criado ON orcamentos(criado_em);
  `)
}

const v2 = (d: Database): void => {
  d.exec(`
    ALTER TABLE observacoes_padrao ADD COLUMN aplicacao TEXT NOT NULL DEFAULT 'orcamento';
    ALTER TABLE pagamentos_padrao ADD COLUMN aplicacao TEXT NOT NULL DEFAULT 'orcamento';
    ALTER TABLE orcamento_textos ADD COLUMN origem_padrao_id TEXT;

    CREATE TABLE relatorios (
      id TEXT PRIMARY KEY,
      numero INTEGER NOT NULL UNIQUE,
      data TEXT NOT NULL,
      cliente_id TEXT REFERENCES clientes(id) ON DELETE SET NULL,
      destinatario TEXT NOT NULL DEFAULT '',
      formato TEXT NOT NULL DEFAULT 'carta',
      titulo TEXT NOT NULL DEFAULT 'Relatório de Serviço',
      introducao TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho',
      origem_orcamento_id TEXT,
      origem_orcamento_numero INTEGER,
      origem_orcamento_cliente TEXT,
      total_servicos REAL NOT NULL DEFAULT 0,
      total_adiantamentos REAL NOT NULL DEFAULT 0,
      total_reembolsos REAL NOT NULL DEFAULT 0,
      saldo REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE relatorio_itens_servico (
      id TEXT NOT NULL,
      relatorio_id TEXT NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      servico_id TEXT,
      descricao TEXT NOT NULL DEFAULT '',
      unidade TEXT NOT NULL DEFAULT '',
      quantidade REAL NOT NULL DEFAULT 0,
      valor_unitario REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,
      calculo_json TEXT,
      PRIMARY KEY (relatorio_id, id)
    );

    CREATE TABLE relatorio_lancamentos (
      id TEXT NOT NULL,
      relatorio_id TEXT NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      descricao TEXT NOT NULL DEFAULT '',
      valor REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (relatorio_id, id)
    );

    CREATE TABLE relatorio_textos (
      id TEXT NOT NULL,
      relatorio_id TEXT NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      texto TEXT NOT NULL DEFAULT '',
      origem_padrao_id TEXT,
      PRIMARY KEY (relatorio_id, id)
    );

    CREATE TABLE relatorio_anexos (
      id TEXT PRIMARY KEY,
      relatorio_id TEXT NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
      referencia_tipo TEXT NOT NULL DEFAULT 'solto',
      referencia_id TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      titulo TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT 'image/jpeg',
      largura INTEGER NOT NULL DEFAULT 0,
      altura INTEGER NOT NULL DEFAULT 0,
      imagem BLOB,
      miniatura BLOB
    );

    CREATE INDEX idx_relatorios_criado ON relatorios(criado_em);
    CREATE INDEX idx_relatorio_anexos_relatorio ON relatorio_anexos(relatorio_id);
  `)
}

/** Clientes já usados não são apagados: podem apenas sair das sugestões. */
const v3 = (d: Database): void => {
  d.exec(`ALTER TABLE clientes ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;`)
}

/** Evita duplicação quando o mesmo backup é mesclado mais de uma vez. */
const v4 = (d: Database): void => {
  d.exec(`
    CREATE TABLE importacoes_documentos (
      tipo TEXT NOT NULL,
      origem_id TEXT NOT NULL,
      documento_id TEXT NOT NULL,
      PRIMARY KEY (tipo, origem_id)
    );
  `)
}

/** Anotação interna dos relatórios, independente do conteúdo exportado. */
const v5 = (d: Database): void => {
  d.exec(`ALTER TABLE relatorios ADD COLUMN observacao_interna TEXT;`)
}

/** Datas de bancos antigos eram gravadas como ISO completo; documentos usam data civil. */
const v6 = (d: Database): void => {
  d.exec(`
    UPDATE orcamentos
       SET data = substr(data, 1, 10)
     WHERE data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*';

    UPDATE relatorios
       SET data = substr(data, 1, 10)
     WHERE data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*';
  `)
}

const v7 = (d: Database): void => {
  d.exec(`
    ALTER TABLE clientes ADD COLUMN dados_json TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE imagens (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, base64 TEXT NOT NULL, miniatura_base64 TEXT, bytes INTEGER NOT NULL, largura INTEGER NOT NULL, altura INTEGER NOT NULL);
    CREATE TABLE documento_meta (tipo TEXT NOT NULL, documento_id TEXT NOT NULL, dados TEXT NOT NULL, PRIMARY KEY(tipo,documento_id));
    CREATE TABLE versoes (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, documento_id TEXT NOT NULL, numero INTEGER NOT NULL, anterior_id TEXT, criado_em TEXT NOT NULL, computador TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '', documento TEXT NOT NULL, UNIQUE(tipo,documento_id,numero));
    CREATE TABLE recibos (id TEXT PRIMARY KEY, numero INTEGER NOT NULL UNIQUE, dados TEXT NOT NULL);
    CREATE TABLE recebimentos (id TEXT PRIMARY KEY, recibo_id TEXT NOT NULL UNIQUE, relatorio_id TEXT, adiantamento_id TEXT, valor REAL NOT NULL, estornado INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX idx_recebimento_adiantamento ON recebimentos(relatorio_id,adiantamento_id) WHERE adiantamento_id IS NOT NULL AND estornado = 0;
    CREATE TABLE numeros_usados (tipo TEXT NOT NULL, numero INTEGER NOT NULL, PRIMARY KEY(tipo,numero));
    INSERT INTO numeros_usados SELECT 'orcamento',numero FROM orcamentos;
    INSERT INTO numeros_usados SELECT 'relatorio',numero FROM relatorios;
    CREATE TABLE reservas (tipo TEXT NOT NULL, numero INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tipo,numero));
    CREATE TABLE sincronizacao (entidade TEXT PRIMARY KEY, revisao INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE fila_nuvem (id TEXT PRIMARY KEY, entidade TEXT NOT NULL, base INTEGER NOT NULL, payload TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE TABLE conflitos_nuvem (id TEXT PRIMARY KEY, entidade TEXT NOT NULL, detalhe TEXT NOT NULL, remoto TEXT NOT NULL);
  `)
  for (const tabela of ['anexos', 'relatorio_anexos']) {
    for (const linha of d.all(`SELECT * FROM ${tabela}`) as Array<Record<string, unknown>>) {
      if (!linha.imagem) continue
      const bytes = Buffer.from(linha.imagem as Uint8Array)
      const hash = createHash('sha256').update(bytes).digest('hex')
      d.run('INSERT OR IGNORE INTO imagens VALUES (?,?,?,?,?,?,?)', [
        hash,
        linha.mime,
        bytes.toString('base64'),
        linha.miniatura ? Buffer.from(linha.miniatura as Uint8Array).toString('base64') : null,
        bytes.length,
        linha.largura,
        linha.altura
      ] as never)
      d.run(`UPDATE ${tabela} SET imagem = ?, miniatura = NULL WHERE id = ?`, [
        hash,
        linha.id
      ] as never)
    }
  }
}
const v8 = (d: Database): void => {
  d.exec('ALTER TABLE servicos ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0')
  const servicos = d.all('SELECT id FROM servicos ORDER BY nome COLLATE NOCASE,id') as Array<{
    id: string
  }>
  servicos.forEach((s, ordem) => d.run('UPDATE servicos SET ordem=? WHERE id=?', [ordem, s.id]))
  for (const c of d.all('SELECT id,dados_json FROM clientes') as Array<{
    id: string
    dados_json: string
  }>) {
    const dados = JSON.parse(c.dados_json || '{}')
    dados.tipoPessoa = normalizarTipoCliente(dados)
    d.run('UPDATE clientes SET dados_json=? WHERE id=?', [JSON.stringify(dados), c.id])
  }
}
const v9 = (d: Database): void => {
  d.exec(`
    ALTER TABLE fila_nuvem ADD COLUMN geracao INTEGER;
    ALTER TABLE fila_nuvem ADD COLUMN grupo TEXT NOT NULL DEFAULT '';
    CREATE TABLE identificadores_documento (
      tipo TEXT NOT NULL, documento_id TEXT NOT NULL, id_interno INTEGER,
      usuario_criador TEXT, alterado_por TEXT,
      PRIMARY KEY(tipo,documento_id), UNIQUE(tipo,id_interno)
    );
    CREATE TABLE numeros_emitidos (tipo TEXT NOT NULL,documento_id TEXT NOT NULL,numero INTEGER NOT NULL,criado_em TEXT NOT NULL,PRIMARY KEY(tipo,documento_id));
    CREATE TABLE bases_documento (
      tipo TEXT NOT NULL,documento_id TEXT NOT NULL,revisao INTEGER NOT NULL,documento TEXT NOT NULL,
      PRIMARY KEY(tipo,documento_id)
    );
    CREATE TABLE edicoes_documento (
      tipo TEXT NOT NULL, documento_id TEXT NOT NULL, usuario TEXT NOT NULL,
      computador TEXT NOT NULL, geracao INTEGER NOT NULL, expira_em TEXT,
      offline INTEGER NOT NULL DEFAULT 0, base_revisao INTEGER NOT NULL,
      PRIMARY KEY(tipo,documento_id)
    );
    CREATE TABLE rascunhos_compartilhados (
      id TEXT PRIMARY KEY, tipo TEXT NOT NULL, documento_id TEXT NOT NULL,
      usuario TEXT, computador TEXT NOT NULL, base_revisao INTEGER NOT NULL,
      base TEXT NOT NULL, documento TEXT NOT NULL, criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE auditoria_colaboracao (
      id TEXT PRIMARY KEY, criado_em TEXT NOT NULL, usuario TEXT,
      computador TEXT, acao TEXT NOT NULL, entidade TEXT, dados TEXT NOT NULL
    );
  `)
  const migradoEm = new Date().toISOString()
  for (const [tipo, tabela] of [
    ['orcamento', 'orcamentos'],
    ['relatorio', 'relatorios']
  ] as const) {
    const colunas = d.all(`PRAGMA table_info(${tabela})`) as Array<{ name: string }>
    if (!colunas.some((c) => c.name === 'status') || !colunas.some((c) => c.name === 'numero'))
      continue
    for (const doc of d.all(`SELECT id,numero FROM ${tabela} WHERE status<>'rascunho'`) as Array<{
      id: string
      numero: number
    }>)
      d.run('INSERT INTO numeros_emitidos VALUES (?,?,?,?)', [tipo, doc.id, doc.numero, migradoEm])
  }
  d.run(
    "INSERT INTO numeros_emitidos SELECT 'recibo',id,numero,? FROM recibos WHERE json_extract(dados,'$.status') IN ('recebido','cancelado')",
    [migradoEm]
  )
  for (const l of d.all(
    "SELECT chave,valor FROM configuracoes WHERE chave LIKE 'historico:%'"
  ) as Array<{ chave: string; valor: string }>) {
    const p = JSON.parse(l.valor)
    if (Array.isArray(p.colunas))
      p.colunas = [
        'ordem',
        'idInterno',
        ...p.colunas.filter((c: string) => !['ordem', 'idInterno'].includes(c))
      ]
    d.run('UPDATE configuracoes SET valor=? WHERE chave=?', [JSON.stringify(p), l.chave])
  }
}
const v10 = (d: Database): void => {
  d.exec(`
    CREATE TABLE numeros_atribuidos (tipo TEXT NOT NULL,numero INTEGER NOT NULL,PRIMARY KEY(tipo,numero));
    CREATE TABLE autoria_documentos (tipo TEXT NOT NULL,documento_id TEXT NOT NULL,usuario_criador TEXT,alterado_por TEXT,PRIMARY KEY(tipo,documento_id));
    INSERT INTO autoria_documentos SELECT tipo,documento_id,usuario_criador,alterado_por FROM identificadores_documento;
    DROP TABLE identificadores_documento;
    UPDATE reservas SET usado=1;
  `)
  for (const l of d.all(
    "SELECT chave,valor FROM configuracoes WHERE chave LIKE 'historico:%'"
  ) as Array<{ chave: string; valor: string }>) {
    const p = JSON.parse(l.valor)
    if (Array.isArray(p.colunas))
      p.colunas = p.colunas.filter((c: string) => !['ordem', 'idInterno'].includes(c))
    if (['ordem', 'idInterno'].includes(p.campo)) p.campo = 'numero'
    d.run('UPDATE configuracoes SET valor=? WHERE chave=?', [JSON.stringify(p), l.chave])
  }
}
const v11 = (d: Database): void => {
  d.exec(
    "ALTER TABLE fila_nuvem ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','preservada','conflito','falha')); ALTER TABLE fila_nuvem ADD COLUMN erro TEXT;"
  )
  const l = d.get("SELECT valor FROM configuracoes WHERE chave='operacoesAnterioresSuspensas'") as {
    valor: string
  } | null
  if (l)
    for (const id of JSON.parse(l.valor) as string[])
      d.run("UPDATE fila_nuvem SET estado='preservada' WHERE id=?", [id])
  d.exec(
    "UPDATE fila_nuvem SET estado='conflito' WHERE estado<>'preservada' AND id IN (SELECT id FROM conflitos_nuvem); DELETE FROM configuracoes WHERE chave='operacoesAnterioresSuspensas'; CREATE INDEX fila_estado_grupo ON fila_nuvem(estado,grupo);"
  )
}
const v12 = (d: Database): void => {
  d.exec(`
    ALTER TABLE servicos ADD COLUMN codigo INTEGER;
    CREATE TABLE codigos_cadastros (
      tipo TEXT NOT NULL CHECK(tipo IN ('cliente','servico')),
      codigo INTEGER NOT NULL CHECK(codigo > 0),
      id TEXT NOT NULL,
      PRIMARY KEY(tipo,codigo)
    );
  `)
  const clientes = d.all(
    'SELECT id,criado_em,nome,dados_json FROM clientes ORDER BY criado_em,nome COLLATE NOCASE,id'
  ) as Array<{ id: string; criado_em: string; nome: string; dados_json: string }>
  clientes.forEach((c, i) => {
    const dados = JSON.parse(c.dados_json || '{}') as Record<string, unknown>
    const codigo = i + 1
    dados.codigo = codigo
    d.run('UPDATE clientes SET dados_json=? WHERE id=?', [JSON.stringify(dados), c.id])
    d.run('INSERT OR IGNORE INTO codigos_cadastros VALUES (?,?,?)', ['cliente', codigo, c.id])
  })
  const servicos = d.all('SELECT id FROM servicos ORDER BY ordem,nome COLLATE NOCASE,id') as Array<{
    id: string
  }>
  servicos.forEach((s, i) => {
    d.run('UPDATE servicos SET codigo=? WHERE id=?', [i + 1, s.id])
    d.run('INSERT OR IGNORE INTO codigos_cadastros VALUES (?,?,?)', ['servico', i + 1, s.id])
  })
}
const v13 = (d: Database): void => {
  d.exec(`CREATE TABLE rascunhos_cadastros (
    tipo TEXT NOT NULL CHECK(tipo IN ('cliente','servico','observacoes','pagamentos')),
    id_origem TEXT NOT NULL,
    dados_json TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    PRIMARY KEY(tipo,id_origem)
  );`)
}
const v14 = (d: Database): void => {
  d.exec(`CREATE TABLE rascunhos_envios (
    rascunho_id TEXT NOT NULL REFERENCES rascunhos_compartilhados(id) ON DELETE CASCADE,
    operacao_id TEXT NOT NULL,
    confirmada INTEGER NOT NULL DEFAULT 0 CHECK(confirmada IN (0,1)),
    PRIMARY KEY(rascunho_id,operacao_id)
  ); CREATE INDEX rascunhos_envios_operacao ON rascunhos_envios(operacao_id);`)
}
export const VERSAO_BANCO = 14
const MIGRACOES: Array<(d: Database) => void> = [
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10,
  v11,
  v12,
  v13,
  v14
]

export function aplicarMigracoes(d: Database, ate = MIGRACOES.length): void {
  const linha = d.get('PRAGMA user_version') as { user_version?: number } | null
  const versao = Number(linha?.user_version ?? 0)
  if (versao > ate)
    throw new Error(
      'Esta base foi aberta por uma versão mais recente do aplicativo. Abra a versão atualizada para continuar.'
    )
  for (let i = versao; i < ate; i++) {
    d.run('BEGIN')
    try {
      MIGRACOES[i](d)
      d.run(`PRAGMA user_version = ${i + 1}`)
      d.run('COMMIT')
    } catch (e) {
      d.run('ROLLBACK')
      throw e
    }
  }
}
