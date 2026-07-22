// Mock em memória da AppApi, usado apenas quando a aplicação roda FORA do Electron
// (ex.: preview no navegador durante o desenvolvimento). No app real, window.api existe.
import type { AppApi } from '@shared/api'
import type {
  BancoDados,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento
} from '@shared/types'

const uid = (): string => Math.random().toString(36).slice(2)

function estadoInicial(): BancoDados {
  return {
    empresa: {
      nome: 'VS PRESTADORA DE SERVIÇOS',
      razaoSocial: 'V S DE JESUS',
      endereco: 'Rua do Ipê Roxo, QD 46, LT 1083, Gameleira 1, Rio Verde - GO',
      telefones: '(64) 3623-2113 / (64) 99234-1244',
      email: 'vsprestadoradeservicos@outlook.com',
      site: 'https://www.vsprestadora.com.br',
      cnpj: '04.871.989/0001-60',
      logoDataUrl: null,
      textoAssinatura: 'V S DE JESUS',
      corFaixaRodape: '#0f6d6b',
      nomeExibicao: 'nome'
    },
    parametros: {
      percentualFerias: 11.11,
      percentualDecimoTerceiro: 8.33,
      percentualFgts: 8,
      percentualInss: 20,
      percentualMultaRescisao: 8,
      custoContratacao: 150,
      diasBaseMes: 30,
      aliquotaNotaPadrao: 6,
      margemLucroPadrao: 30,
      consumoVeiculoPadrao: 10,
      precoCombustivelPadrao: 6,
      valorRefeicaoPadrao: 20,
      modoImpostoPadrao: 'gross_up'
    },
    clientes: [
      { id: uid(), nome: 'TMG', tratamento: 'A', contato: '', observacao: '', criadoEm: new Date().toISOString() }
    ],
    servicos: [
      { id: uid(), nome: 'Cerca de Arame Liso', descricaoPadrao: 'Construção de cerca de arame liso.', unidade: 'metro linear', precoReferencia: 8.5 },
      { id: uid(), nome: 'Poda de Grama', descricaoPadrao: 'Corte e manutenção de gramados.', unidade: 'm²', precoReferencia: 2 },
      { id: uid(), nome: 'Reformas Simples', descricaoPadrao: 'Manutenção e reparos pontuais.', unidade: 'serviço', precoReferencia: null }
    ],
    observacoesPadrao: [
      { id: uid(), texto: 'Neste valor estão inclusas a mão de obra e as tributações necessárias. Os materiais são por conta da contratante.', padrao: true },
      { id: uid(), texto: 'Caso a proposta seja aprovada, favor informar sobre o início do serviço com 15 dias úteis de antecedência.', padrao: true }
    ],
    pagamentosPadrao: [
      { id: uid(), texto: 'Via transferência bancária no Banco do Brasil, agência: 0221-6, conta: 59088-6.', padrao: true }
    ],
    orcamentos: [],
    seqOrcamento: 0
  }
}

export function criarMockApi(): AppApi {
  const db = estadoInicial()
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

  function crud<T extends { id: string }>(colecao: () => T[], setColecao: (v: T[]) => void) {
    return {
      list: async () => clone(colecao()),
      create: async (dto: Omit<T, 'id'>) => {
        const item = { ...(dto as object), id: uid() } as T
        setColecao([...colecao(), item])
        return clone(item)
      },
      update: async (id: string, patch: Partial<T>) => {
        let alvo: T | null = null
        setColecao(
          colecao().map((x) => {
            if (x.id === id) {
              alvo = { ...x, ...patch, id }
              return alvo
            }
            return x
          })
        )
        return alvo ? clone(alvo) : null
      },
      remove: async (id: string) => {
        setColecao(colecao().filter((x) => x.id !== id))
      }
    }
  }

  return {
    empresa: {
      get: async () => clone(db.empresa),
      save: async (patch) => {
        db.empresa = { ...db.empresa, ...patch }
        return clone(db.empresa)
      }
    },
    parametros: {
      get: async () => clone(db.parametros),
      save: async (patch) => {
        db.parametros = { ...db.parametros, ...patch }
        return clone(db.parametros)
      }
    },
    clientes: crud<Cliente>(
      () => db.clientes,
      (v) => (db.clientes = v)
    ) as AppApi['clientes'],
    servicos: crud<ServicoCatalogo>(
      () => db.servicos,
      (v) => (db.servicos = v)
    ) as AppApi['servicos'],
    observacoes: crud<ObservacaoPadrao>(
      () => db.observacoesPadrao,
      (v) => (db.observacoesPadrao = v)
    ) as AppApi['observacoes'],
    pagamentos: crud<FormaPagamentoPadrao>(
      () => db.pagamentosPadrao,
      (v) => (db.pagamentosPadrao = v)
    ) as AppApi['pagamentos'],
    orcamentos: {
      list: async () => clone(db.orcamentos),
      get: async (id) => {
        const o = db.orcamentos.find((x) => x.id === id)
        return o ? clone(o) : null
      },
      proximoNumero: async () => db.seqOrcamento + 1,
      create: async (dto) => {
        db.seqOrcamento += 1
        const o: Orcamento = {
          ...(dto as object as Orcamento),
          id: uid(),
          numero: db.seqOrcamento,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        }
        db.orcamentos.push(o)
        return clone(o)
      },
      update: async (id, patch) => {
        const o = db.orcamentos.find((x) => x.id === id)
        if (!o) return null
        Object.assign(o, patch, { id, atualizadoEm: new Date().toISOString() })
        return clone(o)
      },
      remove: async (id) => {
        db.orcamentos = db.orcamentos.filter((x) => x.id !== id)
      },
      duplicate: async (id) => {
        const o = db.orcamentos.find((x) => x.id === id)
        if (!o) return null
        db.seqOrcamento += 1
        const c: Orcamento = {
          ...clone(o),
          id: uid(),
          numero: db.seqOrcamento,
          status: 'rascunho'
        }
        db.orcamentos.push(c)
        return clone(c)
      }
    },
    logo: {
      selecionar: async () => null
    },
    documentos: {
      gerarPdf: async () => ({ caminho: null }),
      gerarDocx: async () => ({ caminho: null })
    }
  }
}
