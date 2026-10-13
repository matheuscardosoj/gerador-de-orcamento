import { all, get, run, texto } from './db/sqlite'
import { nuvemConfigurada } from './versoes'
import { randomBytes } from 'crypto'
import type { TipoDocumento } from '@shared/types'
import type { InfoNumeracao, ResultadoNumeracao } from '@shared/api'

export function tabelaNumerosUsados(): 'numeros_usados' | 'numeros_atribuidos' {
  return get("SELECT valor FROM configuracoes WHERE chave='numeracaoSequencial'")?.valor === 'true'
    ? 'numeros_atribuidos'
    : 'numeros_usados'
}
function sequencial(): boolean {
  const l = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  return !!l && JSON.parse(texto(l.valor)).protocolo >= 3
}
export function numeroHistoricoReconhecido(
  tipo: TipoDocumento,
  id: string,
  anterior: number,
  atual: number
): boolean {
  const l = get("SELECT valor FROM configuracoes WHERE chave='mapaNumeracaoCache'")
  const mapa = l ? JSON.parse(texto(l.valor)) : []
  return mapa.some(
    (m: { tipo: string; documento_id: string; anterior: number; novo: number }) =>
      m.tipo === tipo && m.documento_id === id && m.anterior === anterior && m.novo === atual
  )
}

/** Ajusta somente a referência estruturada de relatórios novos, ainda sem
 * número definitivo. Não altera textos, valores nem versões publicadas. */
function confirmarOrigemProvisoria(id: string, n: number): void {
  const derivados = all(
    'SELECT id FROM relatorios WHERE origem_orcamento_id=? AND origem_orcamento_numero<=0 AND numero<=0',
    [id]
  )
  for (const rel of derivados) {
    run('UPDATE relatorios SET origem_orcamento_numero=? WHERE id=?', [n, rel.id])
    for (const v of all(
      "SELECT id,documento FROM versoes WHERE tipo='relatorio' AND documento_id=? AND json_extract(documento,'$.numero')<=0",
      [rel.id]
    )) {
      const d = JSON.parse(texto(v.documento))
      if (d.origemOrcamento?.id === id && d.origemOrcamento.numero <= 0) {
        d.origemOrcamento.numero = n
        run('UPDATE versoes SET documento=? WHERE id=?', [JSON.stringify(d), v.id])
      }
    }
    for (const f of all(
      "SELECT id,payload FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'",
      [`relatorio:${texto(rel.id)}`]
    )) {
      const p = JSON.parse(texto(f.payload))
      const pai = p.rows?.relatorios?.[0]
      if (pai?.origem_orcamento_id === id && pai.origem_orcamento_numero <= 0)
        pai.origem_orcamento_numero = n
      for (const v of p.rows?.versoes ?? []) {
        const d = JSON.parse(v.documento)
        if (d.numero <= 0 && d.origemOrcamento?.id === id && d.origemOrcamento.numero <= 0) {
          d.origemOrcamento.numero = n
          v.documento = JSON.stringify(d)
        }
      }
      run("UPDATE fila_nuvem SET payload=? WHERE id=? AND estado<>'preservada'", [
        JSON.stringify(p),
        f.id
      ])
    }
  }
}

/** Confirma números atribuídos pelo servidor; versões provisórias ainda não
 * publicadas são normalizadas para a mesma representação aceita na nuvem. */
export function confirmarNumero(tipo: TipoDocumento, id: string, n: number): void {
  if (!Number.isSafeInteger(n) || n < 1 || n > 999999) throw new Error('Número remoto inválido.')
  const tabela = { orcamento: 'orcamentos', relatorio: 'relatorios', recibo: 'recibos' }[tipo]
  const atual = get(`SELECT numero FROM ${tabela} WHERE id=?`, [id])
  if (!atual || Number(atual.numero) === n) return
  const provisoria = Number(atual.numero) <= 0
  if (provisoria && tipo === 'orcamento') confirmarOrigemProvisoria(id, n)
  run(`UPDATE ${tabela} SET numero=? WHERE id=?`, [n, id])
  if (tipo === 'recibo') {
    const l = get('SELECT dados FROM recibos WHERE id=?', [id])!
    run('UPDATE recibos SET dados=? WHERE id=?', [
      JSON.stringify({ ...JSON.parse(texto(l.dados)), numero: n }),
      id
    ])
  }
  if (provisoria) {
    for (const l of all('SELECT id,documento FROM versoes WHERE tipo=? AND documento_id=?', [
      tipo,
      id
    ])) {
      const d = JSON.parse(texto(l.documento))
      if (d.numero <= 0)
        run('UPDATE versoes SET documento=? WHERE id=?', [
          JSON.stringify({ ...d, numero: n }),
          l.id
        ])
    }
  }
  for (const l of all(
    "SELECT id,payload FROM fila_nuvem WHERE entidade=? AND estado<>'preservada'",
    [`${tipo}:${id}`]
  )) {
    const p = JSON.parse(texto(l.payload))
    if (p.rows?.[tabela]?.[0]) p.rows[tabela][0].numero = n
    if (tipo === 'recibo' && p.rows?.recibos?.[0]) {
      const d = JSON.parse(p.rows.recibos[0].dados)
      p.rows.recibos[0].dados = JSON.stringify({ ...d, numero: n })
    }
    for (const v of p.rows?.versoes ?? []) {
      const d = JSON.parse(v.documento)
      if (d.numero <= 0) v.documento = JSON.stringify({ ...d, numero: n })
    }
    run("UPDATE fila_nuvem SET payload=? WHERE id=? AND estado<>'preservada'", [
      JSON.stringify(p),
      l.id
    ])
  }
  run(`INSERT OR IGNORE INTO ${tabelaNumerosUsados()} VALUES (?,?)`, [tipo, n])
  const chave = { orcamento: 'seqOrcamento', relatorio: 'seqRelatorio', recibo: 'seqRecibo' }[tipo]
  const anterior = get('SELECT valor FROM configuracoes WHERE chave=?', [chave])
  run(
    'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
    [chave, JSON.stringify(Math.max(Number(anterior?.valor ?? 0), n))]
  )
  const cache = get('SELECT valor FROM configuracoes WHERE chave=?', [`numeracaoNuvem:${tipo}`])
  if (cache) {
    const d = JSON.parse(texto(cache.valor))
    d.proximoNumero = Math.max(d.proximoNumero, n + 1)
    d.minimo = d.proximoNumero
    d.ultimoNumero = Math.max(d.ultimoNumero ?? 0, n)
    run('UPDATE configuracoes SET valor=? WHERE chave=?', [
      JSON.stringify(d),
      `numeracaoNuvem:${tipo}`
    ])
  }
}

export function validarTrocaNumero(
  tipo: TipoDocumento,
  id: string,
  estado: string,
  n: number
): ResultadoNumeracao | null {
  if (
    estado !== 'rascunho' ||
    get('SELECT 1 FROM numeros_emitidos WHERE tipo=? AND documento_id=?', [tipo, id])
  )
    return {
      ok: false,
      erro: 'O número de um documento emitido está protegido. Crie um novo rascunho para usar outro número.'
    }
  if (!nuvemConfigurada()) return null
  const linha = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  if (!linha || JSON.parse(texto(linha.valor)).protocolo < 2)
    return {
      ok: false,
      erro: 'Atualize a configuração de colaboração da nuvem para corrigir números de rascunhos.'
    }
  if (!Number.isSafeInteger(n) || n < 1 || n > 999999)
    return { ok: false, erro: 'Informe um número inteiro entre 1 e 999999.' }
  if (sequencial()) {
    const cache = get('SELECT valor FROM configuracoes WHERE chave=?', [`numeracaoNuvem:${tipo}`])
    const minimo = cache ? JSON.parse(texto(cache.valor)).minimo : null
    if (!minimo || n < minimo)
      return {
        ok: false,
        erro: 'Sincronize e escolha um número a partir do próximo previsto. Números atribuídos ou abandonados não podem ser reutilizados.'
      }
    return null
  }
  if (!get('SELECT 1 FROM reservas WHERE tipo=? AND numero=? AND usado=0', [tipo, n]))
    return {
      ok: false,
      erro: 'Escolha um número disponível nas reservas deste computador. Números usados ou de outros computadores não podem ser reutilizados.'
    }
  return null
}
export function consumirTrocaNumero(tipo: TipoDocumento, n: number): void {
  if (nuvemConfigurada() && !sequencial())
    run('UPDATE reservas SET usado=1 WHERE tipo=? AND numero=?', [tipo, n])
}
export function registrarNumeroEmitido(tipo: TipoDocumento, id: string, n: number): void {
  if (n <= 0) throw new Error('Reserve um número oficial antes de emitir.')
  run('INSERT OR IGNORE INTO numeros_emitidos VALUES (?,?,?,?)', [
    tipo,
    id,
    n,
    new Date().toISOString()
  ])
}

export function numeracaoNuvem(tipo: TipoDocumento, local: InfoNumeracao): InfoNumeracao {
  if (!nuvemConfigurada()) return local
  if (sequencial()) {
    const l = get('SELECT valor FROM configuracoes WHERE chave=?', [`numeracaoNuvem:${tipo}`])
    const cache = l ? JSON.parse(texto(l.valor)) : null
    return {
      ...local,
      proximoNumero: cache?.proximoNumero ?? local.maiorEmUso + 1,
      menorLivre: cache?.proximoNumero ?? local.maiorEmUso + 1,
      atribuicaoServidor: true,
      ultimoNumero: cache?.ultimoNumero ?? local.maiorEmUso
    }
  }
  const proximo = numeroNuvem(tipo, () => 0)
  return { ...local, proximoNumero: proximo, menorLivre: proximo, usaReservas: true }
}
export function numeroNuvem(tipo: TipoDocumento, local: () => number, consumir = false): number {
  if (!nuvemConfigurada()) return local()
  if (sequencial()) return consumir ? -(randomBytes(6).readUIntBE(0, 6) || 1) : 0
  const reserva = get(
    'SELECT numero FROM reservas WHERE tipo=? AND usado=0 ORDER BY numero LIMIT 1',
    [tipo]
  )
  if (reserva) {
    if (consumir)
      run('UPDATE reservas SET usado=1 WHERE tipo=? AND numero=?', [tipo, reserva.numero])
    return Number(reserva.numero)
  }
  if (!consumir) return 0
  // Identificador temporário amplo evita que dois computadores offline criem
  // o mesmo número negativo. A numeração oficial usa apenas reservas positivas.
  return -(randomBytes(6).readUIntBE(0, 6) || 1)
}
