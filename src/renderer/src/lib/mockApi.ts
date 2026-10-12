// Mock em memória da AppApi, usado apenas quando a aplicação roda FORA do Electron
// (ex.: preview no navegador durante o desenvolvimento). No app real, window.api existe.
import type { AppApi, ResultadoNumeracao } from '@shared/api'
import { normalizarPreferencias } from '@shared/historico-preferencias'
import type {
  BancoDados,
  Cliente,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao,
  Orcamento,
  Relatorio
} from '@shared/types'
import { calcularTotaisRelatorio } from '@shared/relatorio'
import { resumirOrcamento, resumirRelatorio } from '@shared/historico'

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
      {
        id: uid(),
        nome: 'TMG',
        tratamento: 'A',
        contato: '',
        observacao: '',
        ativo: true,
        criadoEm: new Date().toISOString()
      }
    ],
    servicos: [
      {
        id: uid(),
        nome: 'Cerca de Arame Liso',
        descricaoPadrao: 'Construção de cerca de arame liso.',
        unidade: 'metro linear',
        precoReferencia: 8.5
      },
      {
        id: uid(),
        nome: 'Poda de Grama',
        descricaoPadrao: 'Corte e manutenção de gramados.',
        unidade: 'm²',
        precoReferencia: 2
      },
      {
        id: uid(),
        nome: 'Reformas Simples',
        descricaoPadrao: 'Manutenção e reparos pontuais.',
        unidade: 'serviço',
        precoReferencia: null
      }
    ],
    observacoesPadrao: [
      {
        id: uid(),
        texto:
          'Neste valor estão inclusas a mão de obra e as tributações necessárias. Os materiais são por conta da contratante.',
        padrao: true,
        aplicacao: 'orcamento'
      },
      {
        id: uid(),
        texto:
          'Caso a proposta seja aprovada, favor informar sobre o início do serviço com 15 dias úteis de antecedência.',
        padrao: true,
        aplicacao: 'orcamento'
      }
    ],
    pagamentosPadrao: [
      {
        id: uid(),
        texto: 'Via transferência bancária no Banco do Brasil, agência: 0221-6, conta: 59088-6.',
        padrao: true,
        aplicacao: 'orcamento'
      }
    ],
    orcamentos: [],
    relatorios: [],
    seqOrcamento: 0,
    seqRelatorio: 0,
    configIA: {
      modo: 'desligada',
      urlOllama: 'http://localhost:11434',
      modeloOllama: 'llama3.2:3b'
    }
  }
}

export function criarMockApi(): AppApi {
  const db = estadoInicial()
  let proximoRecibo = 1
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

  // Espelho simplificado das regras de numeração do main (ver repositories.ts).
  const ocupado = (n: number, ignorarId?: string): Orcamento | undefined =>
    db.orcamentos.find((o) => o.numero === n && o.id !== ignorarId)
  const ocupadoRelatorio = (n: number, ignorarId?: string): Relatorio | undefined =>
    (db.relatorios ?? []).find((r) => r.numero === n && r.id !== ignorarId)
  const proximoLivre = (de: number): number => {
    let n = Math.max(1, de)
    while (ocupado(n)) n++
    return n
  }
  const validar = (n: number, ignorarId?: string): ResultadoNumeracao | null => {
    if (!Number.isInteger(n) || n < 1 || n > 999999) {
      return {
        ok: false,
        erro: 'O número deve ser um inteiro entre 1 e 999999.'
      }
    }
    const dono = ocupado(n, ignorarId)
    if (!dono) return null
    const livre = proximoLivre(n + 1)
    return {
      ok: false,
      erro: `O número ${n} já é do orçamento de ${dono.destinatario.replace(/,$/, '')}. O próximo número livre é ${livre}.`,
      proximoLivre: livre
    }
  }

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
    eventos: { observarDados: () => () => {} },
    rascunhos: {
      list: async () => [],
      get: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      create: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      save: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      comparar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      aplicar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      copiar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      remove: async () => {}
    },
    colaboracao: {
      membros: async () => [],
      vincularMembro: async () => {
        throw new Error('Disponível no aplicativo conectado à nuvem.')
      },
      ativarMembro: async () => {
        throw new Error('Disponível no aplicativo conectado à nuvem.')
      },
      edicao: async () => null
    },
    preferencias: {
      historico: async (tipo) => {
        return normalizarPreferencias(
          tipo,
          JSON.parse(localStorage.getItem(`historico:${tipo}`) || 'null')
        )
      },
      salvarHistorico: async (tipo, dados) => {
        localStorage.setItem(`historico:${tipo}`, JSON.stringify(dados))
      }
    },
    reordenarCadastro: async (tipo, ids) => {
      const lista =
        tipo === 'servicos'
          ? db.servicos
          : tipo === 'observacoes'
            ? db.observacoesPadrao
            : db.pagamentosPadrao
      const ordenada = ids.map((id) => lista.find((i) => i.id === id)!).filter(Boolean)
      if (tipo === 'servicos') db.servicos = ordenada as ServicoCatalogo[]
      else if (tipo === 'observacoes') db.observacoesPadrao = ordenada as ObservacaoPadrao[]
      else db.pagamentosPadrao = ordenada as FormaPagamentoPadrao[]
    },
    recibos: {
      numeracao: async () => ({
        proximoNumero: proximoRecibo,
        maiorEmUso: 0,
        menorLivre: 1,
        totalDocumentos: 0
      }),
      definirProximoNumero: async (n) => {
        if (!Number.isInteger(n) || n < 1 || n > 999999)
          return { ok: false, erro: 'O número deve ser um inteiro entre 1 e 999999.' }
        proximoRecibo = n
        return { ok: true }
      },
      remove: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      list: async () => [],
      get: async () => null,
      create: async () => {
        throw new Error('Use o aplicativo desktop para salvar recibos.')
      },
      update: async () => null,
      confirmar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      cancelar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      }
    },
    versoes: {
      html: async () => '',
      nomear: async () => {},
      list: async () => [],
      restaurar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      exportar: async () => ({ caminho: null })
    },
    nuvem: {
      copiarInstalacao: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      config: async () => ({ url: '', chavePublica: '', email: '' }),
      status: async () => ({
        configurada: false,
        autenticada: false,
        computador: 'prévia',
        pendentes: 0,
        conflitos: [],
        ultimaSincronizacao: null,
        erro: null,
        bytesBanco: 0,
        reservas: { orcamento: 0, relatorio: 0, recibo: 0 }
      }),
      conectar: async () => {
        throw new Error('Configure a nuvem no aplicativo desktop.')
      },
      sincronizar: async () => {
        throw new Error('Disponível no aplicativo desktop.')
      },
      dispositivos: async () => [],
      transferir: async () => {},
      sair: async () => {},
      aceitarRemoto: async () => {}
    },
    aplicativo: {
      versao: async () => '1.3.0-dev',
      alteracoesPendentes: async () => undefined
    },
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
      list: async () => clone(db.orcamentos.map(resumirOrcamento)),
      get: async (id) => {
        const o = db.orcamentos.find((x) => x.id === id)
        return o ? clone(o) : null
      },
      proximoNumero: async () => proximoLivre(db.seqOrcamento + 1),
      create: async (dto) => {
        const pedido = (dto as { numero?: number }).numero
        const numero = pedido && !ocupado(pedido) ? pedido : proximoLivre(db.seqOrcamento + 1)
        db.seqOrcamento = Math.max(numero, db.seqOrcamento)
        const o: Orcamento = {
          ...(dto as object as Orcamento),
          id: uid(),
          numero,
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
        const alvo = db.orcamentos.find((x) => x.id === id)
        db.orcamentos = db.orcamentos.filter((x) => x.id !== id)
        if (alvo && alvo.numero === db.seqOrcamento) {
          db.seqOrcamento = Math.max(0, alvo.numero - 1)
        }
      },
      duplicate: async (id) => {
        const o = db.orcamentos.find((x) => x.id === id)
        if (!o) return null
        const numero = proximoLivre(db.seqOrcamento + 1)
        db.seqOrcamento = Math.max(numero, db.seqOrcamento)
        const c: Orcamento = { ...clone(o), id: uid(), numero, status: 'rascunho' }
        db.orcamentos.push(c)
        return clone(c)
      },
      numeracao: async () => ({
        proximoNumero: proximoLivre(db.seqOrcamento + 1),
        maiorEmUso: db.orcamentos.reduce((m, o) => Math.max(m, o.numero), 0),
        menorLivre: proximoLivre(1),
        totalDocumentos: db.orcamentos.length
      }),
      definirProximoNumero: async (n) => {
        const erro = validar(n)
        if (erro) return erro
        db.seqOrcamento = n - 1
        return { ok: true }
      },
      alterarNumero: async (id, n) => {
        const o = db.orcamentos.find((x) => x.id === id)
        if (!o) return { ok: false, erro: 'Orçamento não encontrado.' }
        if (o.numero === n) return { ok: true, orcamento: clone(o) }
        const erro = validar(n, id)
        if (erro) return erro
        o.numero = n
        db.seqOrcamento = Math.max(n, db.seqOrcamento)
        return { ok: true, orcamento: clone(o) }
      }
    },
    relatorios: {
      list: async () => clone((db.relatorios ?? []).map(resumirRelatorio)),
      get: async (id) => clone((db.relatorios ?? []).find((x) => x.id === id) ?? null),
      proximoNumero: async () => {
        let n = (db.seqRelatorio ?? 0) + 1
        while (ocupadoRelatorio(n)) n++
        return n
      },
      create: async (dto) => {
        let numero = dto.numero ?? (db.seqRelatorio ?? 0) + 1
        while (ocupadoRelatorio(numero)) numero++
        db.seqRelatorio = Math.max(db.seqRelatorio ?? 0, numero)
        const r: Relatorio = {
          ...(dto as Relatorio),
          id: uid(),
          numero,
          totais: calcularTotaisRelatorio(dto.itensServico, dto.adiantamentos, dto.reembolsos),
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        }
        ;(db.relatorios ??= []).push(r)
        return clone(r)
      },
      update: async (id, patch) => {
        const r = (db.relatorios ?? []).find((x) => x.id === id)
        if (!r) return null
        Object.assign(r, patch, { id, atualizadoEm: new Date().toISOString() })
        r.totais = calcularTotaisRelatorio(r.itensServico, r.adiantamentos, r.reembolsos)
        return clone(r)
      },
      remove: async (id) => {
        const alvo = (db.relatorios ?? []).find((x) => x.id === id)
        db.relatorios = (db.relatorios ?? []).filter((x) => x.id !== id)
        if (alvo && alvo.numero === db.seqRelatorio) db.seqRelatorio = Math.max(0, alvo.numero - 1)
      },
      numeracao: async () => {
        const lista = db.relatorios ?? []
        let proximo = (db.seqRelatorio ?? 0) + 1
        while (ocupadoRelatorio(proximo)) proximo++
        let menor = 1
        while (ocupadoRelatorio(menor)) menor++
        return {
          proximoNumero: proximo,
          maiorEmUso: lista.reduce((m, r) => Math.max(m, r.numero), 0),
          menorLivre: menor,
          totalDocumentos: lista.length
        }
      },
      definirProximoNumero: async (numero) => {
        if (!Number.isInteger(numero) || numero < 1 || numero > 999999)
          return { ok: false, erro: 'O número deve ser um inteiro entre 1 e 999999.' }
        const conflito = ocupadoRelatorio(numero)
        if (conflito)
          return { ok: false, erro: `O número ${numero} já está em uso por outro relatório.` }
        db.seqRelatorio = numero - 1
        return { ok: true }
      },
      alterarNumero: async (id, numero) => {
        const r = (db.relatorios ?? []).find((x) => x.id === id)
        if (!r) return { ok: false, erro: 'Relatório não encontrado.' }
        if (!Number.isInteger(numero) || numero < 1 || numero > 999999)
          return { ok: false, erro: 'O número deve ser um inteiro entre 1 e 999999.' }
        const conflito = ocupadoRelatorio(numero, id)
        if (conflito)
          return { ok: false, erro: `O número ${numero} já está em uso por outro relatório.` }
        r.numero = numero
        db.seqRelatorio = Math.max(db.seqRelatorio ?? 0, numero)
        return { ok: true, relatorio: clone(r) }
      },
      criarDeOrcamento: async (id) => {
        const o = db.orcamentos.find((x) => x.id === id)
        if (!o) return null
        const numero = (db.seqRelatorio ?? 0) + 1
        db.seqRelatorio = numero
        const r: Relatorio = {
          id: uid(),
          numero,
          data: new Date().toISOString().slice(0, 10),
          clienteId: o.clienteId,
          destinatario: o.destinatario,
          formato: o.formato,
          titulo: 'Relatório de Serviço',
          introducao: o.introducao,
          itensServico: clone(o.itensServico),
          adiantamentos: [],
          reembolsos: [],
          observacoes: [],
          pagamentos: [],
          anexos: [],
          status: 'rascunho',
          origemOrcamento: { id: o.id, numero: o.numero, cliente: o.destinatario },
          totais: calcularTotaisRelatorio(o.itensServico, [], []),
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        }
        ;(db.relatorios ??= []).push(r)
        return clone(r)
      }
    },
    anexos: {
      // Fora do Electron não há BLOB: a miniatura já embutida no anexo basta.
      imagem: async () => null
    },
    anexosRelatorio: { imagem: async () => null },
    ia: {
      revisarTexto: async () => {
        throw new Error('Use o aplicativo desktop para a revisão local.')
      },
      cancelarRevisao: async () => {},
      get: async () => clone(db.configIA),
      save: async (patch) => {
        db.configIA = { ...db.configIA, ...patch }
        return clone(db.configIA)
      },
      status: async () => ({
        modo: db.configIA.modo,
        disponivel: false,
        detalhe: 'Sem IA local no preview fora do Electron.'
      }),
      sugerirObservacao: async () => {
        throw new Error('Sugestão por IA indisponível no preview fora do Electron.')
      }
    },
    logo: {
      selecionar: async () => null
    },
    documentos: {
      gerarReciboPdf: async () => ({ caminho: null }),
      gerarReciboDocx: async () => ({ caminho: null }),
      gerarPdf: async () => ({ caminho: null }),
      gerarDocx: async () => ({ caminho: null }),
      gerarRelatorioPdf: async () => ({ caminho: null }),
      gerarRelatorioDocx: async () => ({ caminho: null })
    },
    dados: {
      exportar: async () => ({ caminho: null }),
      importar: async () => null
    }
  }
}
