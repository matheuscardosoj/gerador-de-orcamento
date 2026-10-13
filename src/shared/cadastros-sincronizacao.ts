/** Cadastros compartilhados; documentos e operações financeiras têm contratos próprios. */
export const TABELAS_CADASTRO = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'configuracoes',
  'imagens'
] as const

export type TabelaCadastro = (typeof TABELAS_CADASTRO)[number]
export type LinhaCadastro = Record<string, unknown>
export type PayloadCadastroSalvo = {
  tabela: TabelaCadastro
  id: string
  row: LinhaCadastro
}
export type PayloadCadastroExcluido = {
  tabela: TabelaCadastro
  id: string
  row?: never
}
export type PayloadCadastro = PayloadCadastroSalvo | PayloadCadastroExcluido

function objeto(valor: unknown): valor is Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false
  const prototipo = Object.getPrototypeOf(valor)
  return prototipo === Object.prototype || prototipo === null
}

export function eTabelaCadastro(tabela: unknown): tabela is TabelaCadastro {
  return typeof tabela === 'string' && TABELAS_CADASTRO.some((nome) => nome === tabela)
}

function validarIdentificacao(tabela: unknown, id: unknown): asserts tabela is TabelaCadastro {
  if (!eTabelaCadastro(tabela))
    throw new Error('Este tipo de registro não pode usar a sincronização de cadastros.')
  if (typeof id !== 'string' || !id.trim() || id.trim() !== id)
    throw new Error('O cadastro não tem uma identificação válida para sincronizar.')
}

/** Exclusão é a ausência de row, nunca um objeto vazio ou um valor falso. */
export function criarPayloadCadastroExcluido(
  tabela: TabelaCadastro,
  id: string
): PayloadCadastroExcluido {
  validarIdentificacao(tabela, id)
  return { tabela, id }
}

/** A linha SQLite é preservada; esta validação não converte campos nem snapshots. */
export function criarPayloadCadastroSalvo(
  tabela: TabelaCadastro,
  id: string,
  row: LinhaCadastro
): PayloadCadastroSalvo {
  validarIdentificacao(tabela, id)
  const chave = tabela === 'configuracoes' ? 'chave' : tabela === 'imagens' ? 'hash' : 'id'
  if (!objeto(row) || typeof row[chave] !== 'string' || row[chave] !== id)
    throw new Error(
      'A identificação do cadastro não corresponde ao registro que será sincronizado.'
    )
  if (tabela === 'clientes' && typeof row.dados_json === 'string') {
    let dados: unknown
    try {
      dados = JSON.parse(row.dados_json)
    } catch {
      throw new Error(
        'Os dados deste cliente não estão em um formato válido. Abra o cadastro, confira os campos e salve novamente.'
      )
    }
    if (!objeto(dados))
      throw new Error(
        'Os dados deste cliente não estão em um formato válido. Abra o cadastro, confira os campos e salve novamente.'
      )
    const campos = {
      id: 'id',
      nome: 'nome',
      tratamento: 'tratamento',
      contato: 'contato',
      observacao: 'observacao',
      criadoEm: 'criado_em'
    }
    if (
      Object.entries(campos).some(
        ([json, coluna]) =>
          Object.hasOwn(dados, json) && (dados[json] ?? '') !== (row[coluna] ?? '')
      )
    )
      throw new Error(
        'As informações deste cliente estão inconsistentes. Abra o cadastro, confira os campos e salve novamente. A alteração pendente foi preservada.'
      )
  }
  return { tabela, id, row }
}

/**
 * Contrato canônico. Aceita row:null somente como exclusão legada dos seis cadastros.
 * Valores desconhecidos de row são rejeitados; jamais viram uma exclusão por coerção.
 */
export function normalizarPayloadCadastro(payload: unknown): PayloadCadastro {
  if (!objeto(payload)) throw new Error('O registro de cadastro não tem um formato válido.')
  validarIdentificacao(payload.tabela, payload.id)
  if (Object.keys(payload).some((chave) => !['tabela', 'id', 'row'].includes(chave)))
    throw new Error('O registro contém informações incompatíveis com a sincronização de cadastros.')
  const tabela = payload.tabela
  const id = payload.id as string
  if (!Object.hasOwn(payload, 'row') || payload.row === null)
    return criarPayloadCadastroExcluido(tabela, id)
  if (!objeto(payload.row))
    throw new Error('O cadastro não contém um registro válido para sincronizar.')
  return criarPayloadCadastroSalvo(tabela, id, payload.row)
}

/**
 * Adaptador apenas do payload da fila. ID da operação, revisão base e demais metadados
 * ficam no envelope original. Outros domínios permanecem inalterados, inclusive row:null.
 */
export function adaptarExclusaoCadastroLegada(payload: unknown): unknown {
  if (!objeto(payload) || !eTabelaCadastro(payload.tabela)) return payload
  return normalizarPayloadCadastro(payload)
}
