// Schema do banco, versionado por `PRAGMA user_version`.
// Cada entrada de MIGRACOES é aplicada uma única vez, em ordem — para evoluir o
// schema, ACRESCENTE uma nova função ao fim do array (nunca edite as anteriores).
import type { Database } from 'node-sqlite3-wasm'

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

const MIGRACOES: Array<(d: Database) => void> = [v1]

export function aplicarMigracoes(d: Database): void {
  const linha = d.get('PRAGMA user_version') as { user_version?: number } | null
  const versao = Number(linha?.user_version ?? 0)
  for (let i = versao; i < MIGRACOES.length; i++) {
    MIGRACOES[i](d)
    d.run(`PRAGMA user_version = ${i + 1}`)
  }
}
