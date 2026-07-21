import { randomUUID } from 'crypto'
import { LOGO_VS_DATAURL } from './logo-embutida'
import type {
  BancoDados,
  EmpresaConfig,
  ParametrosFinanceiros,
  ServicoCatalogo,
  ObservacaoPadrao,
  FormaPagamentoPadrao
} from '@shared/types'

const empresa: EmpresaConfig = {
  nome: 'VS PRESTADORA DE SERVIÇOS',
  razaoSocial: 'V S DE JESUS',
  endereco: 'Rua do Ipê Roxo, QD 46, LT 1083, Gameleira 1, Rio Verde - GO, CEP 75.906-775',
  telefones: '(64) 3623-2113 / (64) 99234-1244',
  email: 'vsprestadoradeservicos@outlook.com',
  site: 'https://www.vsprestadora.com.br',
  cnpj: '04.871.989/0001-60',
  logoDataUrl: LOGO_VS_DATAURL,
  textoAssinatura: 'V S DE JESUS',
  corFaixaRodape: '#0f6d6b'
}

// Percentuais e custos padrão (aproximações de mercado, TODOS editáveis nas Configurações).
const parametros: ParametrosFinanceiros = {
  percentualFerias: 11.11,
  percentualDecimoTerceiro: 8.33,
  percentualFgts: 8,
  percentualInss: 20,
  percentualMultaRescisao: 8,
  custoContratacao: 150,
  diasBaseMes: 30,
  aliquotaNotaPadrao: 6,
  margemLucroPadrao: 30,
  custoPorKmPadrao: 2.5,
  valorRefeicaoPadrao: 20,
  modoImpostoPadrao: 'gross_up'
}

// 11 serviços do site vsprestadora.com.br. Preços de referência aproximados
// (baseados na tabela de 2023 encontrada nos arquivos) — o usuário deve atualizar.
const servicosBase: Array<Omit<ServicoCatalogo, 'id'>> = [
  {
    nome: 'Instalação de Tela JavaPorco',
    descricaoPadrao:
      'Instalação de tela tipo JavaPorco para proteção de áreas rurais, industriais e empresariais, com materiais de alta resistência.',
    unidade: 'metro linear',
    precoReferencia: null
  },
  {
    nome: 'Construção de Alambrado',
    descricaoPadrao:
      'Construção de alambrado para cercamento de terrenos, empresas e propriedades, com alinhamento, resistência e acabamento profissional.',
    unidade: 'metro linear',
    precoReferencia: null
  },
  {
    nome: 'Cerca de Arame Liso',
    descricaoPadrao:
      'Construção de cerca de arame liso para delimitar áreas amplas, com foco em segurança e longa vida útil.',
    unidade: 'metro linear',
    precoReferencia: 8.5
  },
  {
    nome: 'Cerca de Arame Farpado',
    descricaoPadrao:
      'Construção de cerca de arame farpado para delimitar áreas e reforçar a proteção do imóvel.',
    unidade: 'metro linear',
    precoReferencia: 8.5
  },
  {
    nome: 'Instalação de Cerca Elétrica',
    descricaoPadrao:
      'Instalação de cerca elétrica para contenção de bovinos, equinos e outros animais, em cerca existente ou em nova construção.',
    unidade: 'metro linear',
    precoReferencia: 3
  },
  {
    nome: 'Construção de Fossa Séptica',
    descricaoPadrao:
      'Execução de sistema de fossa séptica para tratamento de efluentes em uso rural, urbano e industrial, conforme norma técnica.',
    unidade: 'unidade',
    precoReferencia: null
  },
  {
    nome: 'Construção de Calçadas',
    descricaoPadrao:
      'Execução de calçadas com nivelamento correto e acabamento para uso frequente e durabilidade.',
    unidade: 'm²',
    precoReferencia: null
  },
  {
    nome: 'Reformas Simples',
    descricaoPadrao:
      'Manutenção e reparos pontuais: telhados, calhas e reparos gerais, com atendimento ágil.',
    unidade: 'serviço',
    precoReferencia: null
  },
  {
    nome: 'Pintura Rústica',
    descricaoPadrao:
      'Acabamento em pintura rústica para estruturas externas, combinando proteção contra intempéries e acabamento visual reforçado.',
    unidade: 'm²',
    precoReferencia: null
  },
  {
    nome: 'Poda e Corte de Árvores',
    descricaoPadrao:
      'Poda, derrubada e corte de árvores de diferentes portes, com equipamentos adequados e foco em segurança.',
    unidade: 'unidade',
    precoReferencia: null
  },
  {
    nome: 'Poda de Grama',
    descricaoPadrao:
      'Corte e manutenção de gramados residenciais, empresariais e rurais, com recolhimento de resíduos e acabamento uniforme.',
    unidade: 'm²',
    precoReferencia: null
  }
]

// Observações padrão (transcrições reais das propostas, generalizadas).
const observacoesBase: Array<Omit<ObservacaoPadrao, 'id'>> = [
  {
    texto:
      'O valor da proposta considera as quantidades informadas no escopo; caso a quantidade de serviço seja maior ou menor que a prevista, o valor será ajustado.',
    padrao: true
  },
  {
    texto:
      'Neste valor estão inclusas a mão de obra e as tributações necessárias. Os materiais são por conta da contratante.',
    padrao: true
  },
  {
    texto:
      'Caso a proposta seja aprovada, favor informar sobre o início do serviço com 15 dias úteis de antecedência.',
    padrao: true
  },
  {
    texto:
      'Caso o terreno apresente pedras, haverá acréscimo no valor por metro referente a toda a extensão que contém as pedras.',
    padrao: false
  }
]

// Formas de pagamento padrão (dados reais transcritos).
const pagamentosBase: Array<Omit<FormaPagamentoPadrao, 'id'>> = [
  {
    texto:
      'Via transferência bancária no Banco do Brasil para conta corrente em nome da V S DE JESUS, agência: 0221-6, conta: 59088-6.',
    padrao: true
  },
  {
    texto: 'Via Pix para a chave: 64992341244 (Valdemiro Souza de Jesus).',
    padrao: false
  }
]

export function bancoInicial(): BancoDados {
  const servicos = servicosBase.map((s) => ({ id: randomUUID(), ...s }))
  const observacoesPadrao = observacoesBase.map((o) => ({ id: randomUUID(), ...o }))
  const pagamentosPadrao = pagamentosBase.map((p) => ({ id: randomUUID(), ...p }))

  return {
    empresa,
    parametros,
    clientes: [],
    servicos,
    observacoesPadrao,
    pagamentosPadrao,
    orcamentos: [],
    contadorOrcamento: 0
  }
}
