/** Comparação de três versões. Identidades das listas são estáveis; ordem é separada. */
export interface ConflitoCampo {
  caminho: string
  base: unknown
  local: unknown
  remoto: unknown
  financeiro: boolean
}
export interface ResultadoConciliacao<T> {
  documento: T
  conflitos: ConflitoCampo[]
}
const ignorados = new Set([
  'id',
  'numero',
  'idInterno',
  'criadoEm',
  'atualizadoEm',
  'versao',
  'usuarioCriador',
  'alteradoPor',
  'autorNome',
  'computadorResponsavel',
  'totais'
])
const financeiros = new Set([
  'preco',
  'valor',
  'valorTotal',
  'valorUnitario',
  'quantidade',
  'adiantamentos',
  'reembolsos',
  'status',
  'quitacao',
  'adiantamentoId'
])
function normalizar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizar)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalizar(x)])
    )
  return v
}
const igual = (a: unknown, b: unknown) =>
  JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
const objeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const listaIds = (v: unknown): v is Array<Record<string, unknown> & { id: string }> =>
  Array.isArray(v) &&
  v.every((x) => objeto(x) && typeof x.id === 'string') &&
  new Set(v.map((x) => x.id)).size === v.length

export function conciliarDocumento<T>(
  base: T,
  local: T,
  remoto: T,
  escolhas: Record<string, 'local' | 'remoto'> = {}
): ResultadoConciliacao<T> {
  const conflitos: ConflitoCampo[] = []
  function disputar(b: unknown, l: unknown, r: unknown, caminho: string): unknown {
    const escolha = escolhas[caminho]
    if (escolha) return escolha === 'local' ? l : r
    conflitos.push({
      caminho,
      base: b,
      local: l,
      remoto: r,
      financeiro: caminho.split('.').some((k) => financeiros.has(k))
    })
    return r
  }
  function unir(b: unknown, l: unknown, r: unknown, caminho: string): unknown {
    if (igual(l, b)) return r
    if (igual(r, b) || igual(l, r)) return l
    if (objeto(b) && objeto(l) && objeto(r)) {
      const resultado: Record<string, unknown> = {}
      const camposPreco = ['quantidade', 'valorUnitario', 'valorTotal', 'calculo']
      const preco = (v: Record<string, unknown>) =>
        Object.fromEntries(camposPreco.filter((k) => k in v).map((k) => [k, v[k]]))
      const disputaPreco =
        caminho.startsWith('itensServico.') &&
        'quantidade' in b &&
        !igual(preco(b), preco(l)) &&
        !igual(preco(b), preco(r)) &&
        !igual(preco(l), preco(r))
      for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
        if (disputaPreco && camposPreco.includes(k)) continue
        if (!caminho && ignorados.has(k)) {
          if (r[k] !== undefined) resultado[k] = r[k]
          continue
        }
        const v = unir(b[k], l[k], r[k], caminho ? `${caminho}.${k}` : k)
        if (v !== undefined) resultado[k] = v
      }
      if (disputaPreco)
        Object.assign(resultado, disputar(preco(b), preco(l), preco(r), `${caminho}.preco`))
      return resultado
    }
    if (listaIds(b) && listaIds(l) && listaIds(r)) {
      const ids = (v: typeof b) => v.map((x) => x.id)
      const ordem = unir(ids(b), ids(l), ids(r), `${caminho}.__ordem`) as string[]
      const todas = [...new Set([...ordem, ...ids(b), ...ids(l), ...ids(r)])]
      const itens = new Map<string, unknown>()
      for (const id of todas) {
        const v = unir(
          b.find((x) => x.id === id),
          l.find((x) => x.id === id),
          r.find((x) => x.id === id),
          `${caminho}.${id}`
        )
        if (v !== undefined) itens.set(id, v)
      }
      return todas.filter((id) => itens.has(id)).map((id) => itens.get(id))
    }
    return disputar(b, l, r, caminho)
  }
  // Metadados nunca são conciliados ou copiados de uma revisão obsoleta.
  const documento = unir(base, local, remoto, '') as T
  if (objeto(documento) && objeto(remoto))
    for (const k of ignorados) {
      if (k in remoto) (documento as Record<string, unknown>)[k] = remoto[k]
      else delete (documento as Record<string, unknown>)[k]
    }
  return { documento, conflitos }
}

/** Fotos continuam referenciadas por hash; rascunhos não duplicam o Base64. */
export function snapshotRascunho<T>(documento: T): T {
  function limpar(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(limpar)
    if (objeto(v))
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !['imagemDataUrl', 'miniaturaDataUrl', 'logoDataUrl'].includes(k))
          .map(([k, x]) => [k, limpar(x)])
      )
    return v
  }
  return limpar(documento) as T
}
