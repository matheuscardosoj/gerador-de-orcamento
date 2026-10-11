import type { Documento } from './types'
import { formatMoeda } from './format'

const rotulos: Record<string, string> = {
  numero: 'Número',
  data: 'Data',
  destinatario: 'Destinatário',
  titulo: 'Título',
  descricao: 'Descrição',
  introducao: 'Introdução',
  status: 'Estado',
  formato: 'Formato',
  valorTotal: 'Valor total',
  valorUnitario: 'Valor unitário',
  valor: 'Valor',
  local: 'Local',
  formaPagamento: 'Forma de pagamento',
  quitacao: 'Quitação',
  observacao: 'Observação',
  observacaoInterna: 'Anotação interna',
  prazoDias: 'Prazo em dias',
  clienteSnapshot: 'Dados do cliente',
  empresaSnapshot: 'Dados da empresa',
  camposCliente: 'Dados exibidos do cliente',
  nome: 'Nome',
  razaoSocial: 'Razão social',
  nomeFantasia: 'Nome fantasia',
  tipoPessoa: 'Tipo de pessoa',
  documento: 'CPF/CNPJ',
  telefone: 'Telefone',
  telefones: 'Telefones',
  email: 'E-mail',
  endereco: 'Endereço',
  logradouro: 'Logradouro',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  cep: 'CEP',
  pessoaContato: 'Pessoa de contato',
  contato: 'Contato',
  tratamento: 'Tratamento',
  cnpj: 'CNPJ',
  site: 'Site',
  textoAssinatura: 'Texto da assinatura',
  corFaixaRodape: 'Cor do rodapé',
  nomeExibicao: 'Nome exibido',
  logoHash: 'Logo',
  ativo: 'Ativo',
  itensServico: 'Serviços',
  quantidade: 'Quantidade',
  unidade: 'Unidade',
  materiais: 'Materiais',
  especificacao: 'Especificação',
  observacoes: 'Observações',
  pagamentos: 'Condições de pagamento',
  adiantamentos: 'Adiantamentos',
  reembolsos: 'Reembolsos',
  totais: 'Resumo financeiro',
  servicos: 'Serviços',
  saldo: 'Saldo',
  valorFinal: 'Valor final',
  tipoSaldo: 'Tipo de saldo',
  origemOrcamento: 'Proposta de origem',
  cliente: 'Cliente',
  origemTipo: 'Tipo de origem',
  anexos: 'Fotos',
  imagemHash: 'Imagem',
  mime: 'Formato da imagem',
  largura: 'Largura',
  altura: 'Altura',
  referenciaTipo: 'Referência',
  calculo: 'Cálculo',
  entrada: 'Parâmetros utilizados',
  resultado: 'Resultado',
  dias: 'Dias',
  maoDeObra: 'Mão de obra',
  alimentacoes: 'Alimentação',
  ferramentas: 'Ferramentas',
  combustiveis: 'Combustível',
  estadias: 'Estadia',
  avulsos: 'Custos avulsos',
  margemLucroPercent: 'Acréscimo de lucro (%)',
  emitirNota: 'Emissão de nota',
  aliquotaNotaPercent: 'Alíquota da nota (%)',
  modoImposto: 'Modo do imposto',
  parametros: 'Encargos',
  aplicarAcrescimo: 'Aplicar acréscimo de lucro',
  modo: 'Aplicação do custo',
  tipo: 'Tipo',
  base: 'Base de pagamento',
  qtdFuncionarios: 'Funcionários',
  clt: 'Carteira assinada',
  salarioCarteira: 'Salário na carteira',
  houveContratacao: 'Contratação neste serviço',
  demitidoAoFim: 'Rescisão ao fim',
  qtdPessoas: 'Pessoas',
  valorRefeicao: 'Valor da refeição',
  distanciaKm: 'Distância (km)',
  consumoKmL: 'Consumo (km/l)',
  precoLitro: 'Preço do litro',
  valorPorPessoa: 'Valor por pessoa',
  valorMensal: 'Valor mensal',
  qtdMeses: 'Meses',
  percentualFerias: 'Férias (%)',
  percentualDecimoTerceiro: '13º salário (%)',
  percentualFgts: 'FGTS (%)',
  percentualInss: 'INSS (%)',
  percentualMultaRescisao: 'Multa rescisória (%)',
  custoContratacao: 'Custo de contratação',
  diasBaseMes: 'Dias por mês',
  breakdown: 'Composição do custo',
  chave: 'Categoria',
  detalhe: 'Detalhe',
  custoComAcrescimo: 'Custo com acréscimo',
  custoRepassado: 'Custo repassado',
  custoTotal: 'Custo total',
  valorMargem: 'Valor do acréscimo',
  precoComMargem: 'Preço com acréscimo',
  impostoNota: 'Imposto da nota',
  precoFinal: 'Preço final'
}
const ignorados = new Set([
  'id',
  'clienteId',
  'servicoId',
  'origemPadraoId',
  'origemId',
  'adiantamentoId',
  'referenciaId',
  'itemServicoId',
  'computadorResponsavel',
  'criadoEm',
  'atualizadoEm',
  'versao',
  'logoDataUrl',
  'imagemDataUrl',
  'miniaturaDataUrl'
])
const valores: Record<string, string> = {
  pf: 'Pessoa física',
  pj: 'Pessoa jurídica',
  rascunho: 'Rascunho',
  pendente: 'Pagamento pendente',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  emitido: 'Emitido',
  pago: 'Pago',
  parcial: 'Parcial',
  total: 'Total',
  gross_up: 'Preservar valor líquido',
  simples: 'Acréscimo simples',
  carta: 'Carta',
  tabela: 'Tabela',
  diario: 'Por dia',
  cheio: 'Valor fechado',
  diaria: 'Diária',
  mensal: 'Mensal',
  valor_cheio: 'Valor fechado',
  receber: 'A receber',
  devolver: 'A devolver',
  por_pessoa: 'Por pessoa',
  aluguel: 'Aluguel',
  manutencao: 'Manutenção',
  insumo: 'Insumo',
  orcamento: 'Proposta',
  relatorio: 'Relatório',
  nome: 'Nome fantasia',
  razaoSocial: 'Razão social',
  documento: 'CPF/CNPJ',
  endereco: 'Endereço',
  telefone: 'Telefone',
  email: 'E-mail',
  pessoaContato: 'Pessoa de contato'
}
function campos(documento: Documento): Map<string, string> {
  const resultado = new Map<string, string>()
  function visitar(valor: unknown, caminho: string[], chave: string): void {
    if (valor == null || valor === '' || ignorados.has(chave)) return
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => visitar(item, [...caminho, `Item ${i + 1}`], chave))
      return
    }
    if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor))
        visitar(v, [...caminho, rotulos[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2')], k)
      return
    }
    const texto =
      typeof valor === 'boolean'
        ? valor
          ? 'Sim'
          : 'Não'
        : typeof valor === 'number' && /^(valor|preco|custo|saldo|imposto|salario)/i.test(chave)
          ? formatMoeda(valor)
          : [
                'status',
                'formato',
                'quitacao',
                'modoImposto',
                'modo',
                'base',
                'tipo',
                'tipoSaldo',
                'tipoPessoa',
                'origemTipo',
                'nomeExibicao',
                'camposCliente'
              ].includes(chave)
            ? (valores[String(valor)] ?? String(valor))
            : String(valor)
    resultado.set(caminho.join(' / '), texto)
  }
  visitar(documento, [], '')
  return resultado
}
export interface DiferencaDocumento {
  campo: string
  anterior: string
  atual: string
}
/** Compara conteúdo, cálculos, apresentação e referências às fotos; exclui dados técnicos. */
export function compararDocumentos(anterior: Documento, atual: Documento): DiferencaDocumento[] {
  const antes = campos(anterior),
    depois = campos(atual)
  return [...new Set([...antes.keys(), ...depois.keys()])]
    .filter((k) => antes.get(k) !== depois.get(k))
    .map((campo) => ({
      campo,
      anterior: antes.get(campo) ?? 'Não informado',
      atual: depois.get(campo) ?? 'Não informado'
    }))
}
