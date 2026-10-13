import { randomUUID } from 'crypto'
import type {
  BancoDados,
  ConfigIA,
  EmpresaConfig,
  ParametrosFinanceiros,
  ObservacaoPadrao,
  FormaPagamentoPadrao
} from '@shared/types'

// Padrão: usa o modelo embutido no instalador. Fora do pacote (npm run dev sem
// ter rodado `npm run ia`) o main cai automaticamente no Ollama, se existir.
export const configIAPadrao: ConfigIA = {
  modo: 'embutida',
  urlOllama: 'http://localhost:11434',
  modeloOllama: 'llama3.2:3b'
}

// Instalações novas não herdam identidade, contatos ou contas de outra empresa.
const empresa: EmpresaConfig = {
  nome: '',
  razaoSocial: '',
  endereco: '',
  telefones: '',
  email: '',
  site: '',
  cnpj: '',
  logoDataUrl: null,
  textoAssinatura: '',
  corFaixaRodape: '#0f6d6b',
  nomeExibicao: 'nome'
}

// Valores iniciais editáveis; precisam ser conferidos para cada empresa e serviço.
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
  consumoVeiculoPadrao: 10,
  precoCombustivelPadrao: 6,
  valorRefeicaoPadrao: 20,
  modoImpostoPadrao: 'gross_up'
}

// Textos genéricos editáveis; não presumem prazos, materiais ou dados bancários.
const observacoesBase: Array<Omit<ObservacaoPadrao, 'id'>> = [
  {
    texto:
      'O valor considera o escopo e as quantidades informadas nesta proposta. Alterações serão acordadas entre as partes.',
    padrao: true,
    aplicacao: 'orcamento'
  }
]
const pagamentosBase: Array<Omit<FormaPagamentoPadrao, 'id'>> = [
  { texto: 'Pagamento conforme combinado entre as partes.', padrao: true, aplicacao: 'orcamento' }
]

/** Aplicado somente a bancos novos; não reescreve cadastros já existentes. */
export function bancoInicial(): BancoDados {
  const observacoesPadrao = observacoesBase.map((o) => ({ id: randomUUID(), ...o }))
  const pagamentosPadrao = pagamentosBase.map((p) => ({ id: randomUUID(), ...p }))

  return {
    empresa: { ...empresa },
    parametros: { ...parametros },
    clientes: [],
    servicos: [],
    observacoesPadrao,
    pagamentosPadrao,
    orcamentos: [],
    seqOrcamento: 0,
    configIA: { ...configIAPadrao }
  }
}
