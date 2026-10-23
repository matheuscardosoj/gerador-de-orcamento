// Observações e formas de pagamento padrão: duas tabelas com o mesmo CRUD.
import { randomUUID } from 'crypto'
import { all, get, run, bool, paraBool, numero, texto, type Linha } from '../db/sqlite'
import type { AplicacaoTextoPadrao, FormaPagamentoPadrao, ObservacaoPadrao } from '@shared/types'

function repoTextoPadrao<T extends ObservacaoPadrao | FormaPagamentoPadrao>(
  tabela: 'observacoes_padrao' | 'pagamentos_padrao'
): {
  list(): T[]
  get(id: string): T | null
  create(dto: Omit<T, 'id'> & { id?: string }): T
  update(id: string, patch: Partial<T>): T | null
  remove(id: string): void
} {
  const mapear = (l: Linha): T =>
    ({
      id: texto(l.id),
      texto: texto(l.texto),
      padrao: paraBool(l.padrao),
      aplicacao: (texto(l.aplicacao) || 'orcamento') as AplicacaoTextoPadrao
    }) as T

  return {
    list: () => all(`SELECT * FROM ${tabela} ORDER BY ordem, rowid`).map(mapear),
    get: (id) => {
      const l = get(`SELECT * FROM ${tabela} WHERE id = ?`, [id])
      return l ? mapear(l) : null
    },
    create: (dto) => {
      const item = { ...dto, id: dto.id ?? randomUUID() } as T
      const proxima = get(`SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM ${tabela}`)
      run(`INSERT INTO ${tabela} (id, texto, padrao, aplicacao, ordem) VALUES (?, ?, ?, ?, ?)`, [
        item.id,
        item.texto,
        bool(item.padrao),
        item.aplicacao ?? 'orcamento',
        numero(proxima?.proxima)
      ])
      return item
    },
    update: (id, patch) => {
      const atual = get(`SELECT * FROM ${tabela} WHERE id = ?`, [id])
      if (!atual) return null
      const novo = { ...mapear(atual), ...patch, id } as T
      run(`UPDATE ${tabela} SET texto = ?, padrao = ?, aplicacao = ? WHERE id = ?`, [
        novo.texto,
        bool(novo.padrao),
        novo.aplicacao,
        id
      ])
      return novo
    },
    remove: (id) => {
      run(`DELETE FROM ${tabela} WHERE id = ?`, [id])
    }
  }
}

export const observacoesRepo = repoTextoPadrao<ObservacaoPadrao>('observacoes_padrao')
export const pagamentosRepo = repoTextoPadrao<FormaPagamentoPadrao>('pagamentos_padrao')
