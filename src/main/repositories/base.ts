// Utilitários comuns dos repositórios de SQLite.
import { all, get, run, numero, texto, textoOuNulo, type Linha } from '../db/sqlite'
import type { CalculoServico, ItemServico, ItemTexto } from '@shared/types'
import { imagemDataUrl } from '../imagens'
import { totalDosItens } from '@shared/format'

export const nowIso = (): string => new Date().toISOString()
/** O total gravado nunca vem do renderer: é sempre a soma dos itens do documento. */
export const comTotalDosItens = <
  T extends { itensServico: Array<{ valorTotal: number }>; valorTotal: number }
>(
  documento: T
): T => ({ ...documento, valorTotal: totalDosItens(documento.itensServico) })

export function lerConfig<T>(chave: string, padrao: T): T {
  const linha = get('SELECT valor FROM configuracoes WHERE chave = ?', [chave])
  if (!linha) return padrao
  try {
    return { ...padrao, ...(JSON.parse(String(linha.valor)) as object) } as T
  } catch {
    return padrao
  }
}

export function gravarConfig(chave: string, valor: unknown): void {
  run(
    `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [chave, JSON.stringify(valor)]
  )
}

/** Converte o BLOB do banco em data URL (usada pela miniatura e pelo modo ampliado). */
export function blobParaDataUrl(blob: unknown, mime: string): string | undefined {
  if (!blob) return undefined
  if (typeof blob === 'string') return imagemDataUrl(blob, mime === 'miniatura')
  const buf = Buffer.from(blob as Uint8Array)
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function paraItemServico(l: Linha): ItemServico {
  let calculo: CalculoServico | null = null
  if (l.calculo_json) {
    try {
      calculo = JSON.parse(String(l.calculo_json)) as CalculoServico
    } catch {
      calculo = null
    }
  }
  return {
    id: texto(l.id),
    servicoId: textoOuNulo(l.servico_id),
    descricao: texto(l.descricao),
    unidade: texto(l.unidade),
    quantidade: numero(l.quantidade),
    valorUnitario: numero(l.valor_unitario),
    valorTotal: numero(l.valor_total),
    calculo
  }
}

export const paraTexto = (l: Linha): ItemTexto => ({
  id: texto(l.id),
  texto: texto(l.texto),
  origemPadraoId: textoOuNulo(l.origem_padrao_id)
})

export function versoesResumo(tipo: string): Map<string, number> {
  return new Map(
    all(
      'SELECT documento_id,MAX(numero) AS versao FROM versoes WHERE tipo=? GROUP BY documento_id',
      [tipo]
    ).map((r) => [texto(r.documento_id), numero(r.versao)])
  )
}
