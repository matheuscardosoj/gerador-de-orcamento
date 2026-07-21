import { randomUUID } from 'crypto'
import { getDb, mutate } from './db/store'
import type {
  EmpresaConfig,
  ParametrosFinanceiros,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento
} from '@shared/types'

const nowIso = (): string => new Date().toISOString()

// ---------------------------------------------------------------- Empresa
export const empresaRepo = {
  get: (): EmpresaConfig => getDb().empresa,
  save: (patch: Partial<EmpresaConfig>): EmpresaConfig =>
    mutate((db) => {
      db.empresa = { ...db.empresa, ...patch }
      return db.empresa
    })
}

// ------------------------------------------------------------- Parâmetros
export const parametrosRepo = {
  get: (): ParametrosFinanceiros => getDb().parametros,
  save: (patch: Partial<ParametrosFinanceiros>): ParametrosFinanceiros =>
    mutate((db) => {
      db.parametros = { ...db.parametros, ...patch }
      return db.parametros
    })
}

// ---------------------------------------------------------------- Clientes
export const clientesRepo = {
  list: (): Cliente[] => [...getDb().clientes].sort((a, b) => a.nome.localeCompare(b.nome)),
  create: (dto: Omit<Cliente, 'id' | 'criadoEm'>): Cliente =>
    mutate((db) => {
      const cliente: Cliente = { id: randomUUID(), criadoEm: nowIso(), ...dto }
      db.clientes.push(cliente)
      return cliente
    }),
  update: (id: string, patch: Partial<Cliente>): Cliente | null =>
    mutate((db) => {
      const c = db.clientes.find((x) => x.id === id)
      if (!c) return null
      Object.assign(c, patch, { id: c.id })
      return c
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.clientes = db.clientes.filter((x) => x.id !== id)
    })
}

// -------------------------------------------------------- Catálogo serviços
export const servicosRepo = {
  list: (): ServicoCatalogo[] =>
    [...getDb().servicos].sort((a, b) => a.nome.localeCompare(b.nome)),
  create: (dto: Omit<ServicoCatalogo, 'id'>): ServicoCatalogo =>
    mutate((db) => {
      const s: ServicoCatalogo = { id: randomUUID(), ...dto }
      db.servicos.push(s)
      return s
    }),
  update: (id: string, patch: Partial<ServicoCatalogo>): ServicoCatalogo | null =>
    mutate((db) => {
      const s = db.servicos.find((x) => x.id === id)
      if (!s) return null
      Object.assign(s, patch, { id: s.id })
      return s
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.servicos = db.servicos.filter((x) => x.id !== id)
    })
}

// ------------------------------------------------------ Observações padrão
export const observacoesRepo = {
  list: (): ObservacaoPadrao[] => getDb().observacoesPadrao,
  create: (dto: Omit<ObservacaoPadrao, 'id'>): ObservacaoPadrao =>
    mutate((db) => {
      const o: ObservacaoPadrao = { id: randomUUID(), ...dto }
      db.observacoesPadrao.push(o)
      return o
    }),
  update: (id: string, patch: Partial<ObservacaoPadrao>): ObservacaoPadrao | null =>
    mutate((db) => {
      const o = db.observacoesPadrao.find((x) => x.id === id)
      if (!o) return null
      Object.assign(o, patch, { id: o.id })
      return o
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.observacoesPadrao = db.observacoesPadrao.filter((x) => x.id !== id)
    })
}

// -------------------------------------------------- Formas de pagamento padrão
export const pagamentosRepo = {
  list: (): FormaPagamentoPadrao[] => getDb().pagamentosPadrao,
  create: (dto: Omit<FormaPagamentoPadrao, 'id'>): FormaPagamentoPadrao =>
    mutate((db) => {
      const p: FormaPagamentoPadrao = { id: randomUUID(), ...dto }
      db.pagamentosPadrao.push(p)
      return p
    }),
  update: (id: string, patch: Partial<FormaPagamentoPadrao>): FormaPagamentoPadrao | null =>
    mutate((db) => {
      const p = db.pagamentosPadrao.find((x) => x.id === id)
      if (!p) return null
      Object.assign(p, patch, { id: p.id })
      return p
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.pagamentosPadrao = db.pagamentosPadrao.filter((x) => x.id !== id)
    })
}

// -------------------------------------------------------------- Orçamentos
function gerarNumero(seq: number): string {
  const ano = new Date().getFullYear()
  return `${String(seq).padStart(4, '0')}/${ano}`
}

export const orcamentosRepo = {
  list: (): Orcamento[] =>
    [...getDb().orcamentos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
  get: (id: string): Orcamento | null => getDb().orcamentos.find((x) => x.id === id) ?? null,
  proximoNumero: (): string => gerarNumero(getDb().contadorOrcamento + 1),
  create: (dto: Omit<Orcamento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'>): Orcamento =>
    mutate((db) => {
      db.contadorOrcamento += 1
      const orc: Orcamento = {
        id: randomUUID(),
        numero: gerarNumero(db.contadorOrcamento),
        criadoEm: nowIso(),
        atualizadoEm: nowIso(),
        ...dto
      }
      db.orcamentos.push(orc)
      return orc
    }),
  update: (id: string, patch: Partial<Orcamento>): Orcamento | null =>
    mutate((db) => {
      const o = db.orcamentos.find((x) => x.id === id)
      if (!o) return null
      Object.assign(o, patch, { id: o.id, atualizadoEm: nowIso() })
      return o
    }),
  remove: (id: string): void =>
    mutate((db) => {
      db.orcamentos = db.orcamentos.filter((x) => x.id !== id)
    }),
  duplicate: (id: string): Orcamento | null =>
    mutate((db) => {
      const original = db.orcamentos.find((x) => x.id === id)
      if (!original) return null
      db.contadorOrcamento += 1
      const copia: Orcamento = {
        ...structuredClone(original),
        id: randomUUID(),
        numero: gerarNumero(db.contadorOrcamento),
        status: 'rascunho',
        criadoEm: nowIso(),
        atualizadoEm: nowIso()
      }
      db.orcamentos.push(copia)
      return copia
    })
}
