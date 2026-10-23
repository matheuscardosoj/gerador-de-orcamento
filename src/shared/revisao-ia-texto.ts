// Camada determinística em volta da resposta do modelo de IA: não depende do modelo, então
// o resultado é previsível e testável. O modelo embutido é pequeno (1,5 bilhão de parâmetros):
// às vezes devolve o texto sem mudar nada, cola rótulos ("Observação: …") ou troca quem é a
// contratante e a empresa. Aqui o texto é limpo, validado e corrigido de forma segura.

export type CampoRevisao =
  | 'descricaoServico'
  | 'introducao'
  | 'observacao'
  | 'pagamento'
  | 'anotacao'
  | 'descricaoRecibo'
  | 'observacaoRecibo'

/** Descrição em linguagem natural do campo, usada no prompt (nunca o identificador interno). */
export const DESCRICAO_CAMPO: Record<CampoRevisao, string> = {
  descricaoServico: 'a descrição de um serviço dentro de um orçamento',
  introducao: 'o texto de apresentação no início de uma proposta ao cliente',
  observacao: 'uma observação ou condição de um orçamento',
  pagamento: 'a forma de pagamento de um orçamento',
  anotacao: 'uma anotação interna sobre um documento',
  descricaoRecibo: 'a descrição do serviço ou a referência de um recibo',
  observacaoRecibo: 'uma observação de um recibo'
}

const semAcentos = (texto: string): string => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Minúsculas e sem acentos: forma de comparação. */
export const forma = (texto: string): string => semAcentos(texto).toLowerCase()

// ------------------------------------------------------------------ Rótulos vazados

const ROTULO_INICIAL = /^\s*([^\n:]{1,40}):[ \t]+(?=\S)/u

/**
 * O modelo costuma abrir a resposta com um rótulo ("Texto revisado:", "Observação:",
 * "Descr. Recibo:"), com negrito ou com cercas de código. O rótulo só é removido quando o
 * texto original não começa com ele (um "Valor: R$ 100" digitado pela pessoa é preservado).
 */
export function limparRotulos(resposta: string, original: string): string {
  let texto = resposta
    .replace(/^```[a-z]*\n?|\n?```$/gi, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .trim()
  // O modelo às vezes repete a instrução do prompt ("O texto abaixo é …") antes do texto.
  if (!/^\s*(o texto abaixo|revise-o)/i.test(original))
    texto = texto
      .replace(/^\s*O texto abaixo é[\s\S]*?sem rótulos\.\s*/i, '')
      .replace(/^\s*Revise-o e devolva[^\n.]*\.\s*/i, '')
      .trim()
  const rotulo = ROTULO_INICIAL.exec(texto)
  if (rotulo) {
    const prefixo = forma(rotulo[1])
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    const palavras = prefixo.split(' ').filter(Boolean).length
    const origem = forma(original)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    // Rótulos são curtos, sem números; se o original já abre com ele, é conteúdo da pessoa.
    if (palavras <= 5 && !/\d/.test(prefixo) && !origem.startsWith(prefixo))
      texto = texto.slice(rotulo[0].length).trimStart()
  }
  // Linha de apresentação sozinha ("Segue o texto revisado:") antes do conteúdo.
  const linhas = texto.split('\n')
  if (linhas.length > 1 && /:\s*$/.test(linhas[0]) && !/:\s*$/.test(original.split('\n')[0]))
    texto = linhas.slice(1).join('\n').trim()
  return texto.replace(/^["“”']+|["“”']+$/g, '').trim()
}

// ------------------------------------------------------------------ Trava de papéis

const PAPEIS: Array<[chave: string, padrao: RegExp]> = [
  ['contratante', /\bcontratantes?\b/],
  ['contratada', /\bcontratadas?\b/],
  ['contratado', /\bcontratados?\b/],
  ['cliente', /\bclientes?\b/],
  ['empresa', /\bempresas?\b/],
  ['prestador', /\bprestadore?s?\b/],
  ['prestadora', /\bprestadoras?\b/],
  ['proprietario', /\bproprietari[oa]s?\b/]
]

/** Verbos e pronomes em primeira pessoa que mudariam quem fala no texto. */
const PRIMEIRA_PESSOA = new Set([
  'eu',
  'meu',
  'minha',
  'meus',
  'minhas',
  'paguei',
  'recebi',
  'fiz',
  'realizei',
  'executei',
  'entreguei',
  'comprei',
  'vendi',
  'instalei',
  'contratei'
])

const papeisDe = (texto: string): Set<string> => {
  const t = forma(texto)
  return new Set(PAPEIS.filter(([, padrao]) => padrao.test(t)).map(([chave]) => chave))
}

const primeiraPessoaDe = (texto: string): Set<string> =>
  new Set((forma(texto).match(/[a-z]+/g) ?? []).filter((p) => PRIMEIRA_PESSOA.has(p)))

/**
 * A revisão não pode trocar quem é cada parte ("contratante" por "empresa") nem passar o
 * texto para a primeira pessoa. Devolve o motivo da recusa ou `null` se estiver tudo certo.
 */
export function violacaoDePapeis(original: string, sugestao: string): string | null {
  const a = papeisDe(original)
  const b = papeisDe(sugestao)
  const trocados = [...a, ...b].filter((p) => a.has(p) !== b.has(p))
  if (trocados.length)
    return 'A sugestão trocou quem é a contratante, o cliente ou a empresa e foi recusada.'
  const antes = primeiraPessoaDe(original)
  if ([...primeiraPessoaDe(sugestao)].some((p) => !antes.has(p)))
    return 'A sugestão passou o texto para a primeira pessoa e foi recusada.'
  return null
}

// ------------------------------------------------------------------ Correções seguras

/**
 * Só palavras que, sem acento, não existem em português ou são inequívocas neste contexto
 * (esta/está, ha/há, publico/público e semelhantes ficam de fora de propósito).
 */
const ACENTOS: Record<string, string> = {
  arvore: 'árvore',
  arvores: 'árvores',
  residuo: 'resíduo',
  residuos: 'resíduos',
  remocao: 'remoção',
  instalacao: 'instalação',
  instalacoes: 'instalações',
  manutencao: 'manutenção',
  execucao: 'execução',
  substituicao: 'substituição',
  construcao: 'construção',
  demolicao: 'demolição',
  escavacao: 'escavação',
  aplicacao: 'aplicação',
  alimentacao: 'alimentação',
  iluminacao: 'iluminação',
  fundacao: 'fundação',
  previsao: 'previsão',
  conclusao: 'conclusão',
  cartao: 'cartão',
  servico: 'serviço',
  servicos: 'serviços',
  orcamento: 'orçamento',
  orcamentos: 'orçamentos',
  preco: 'preço',
  precos: 'preços',
  numero: 'número',
  numeros: 'números',
  padrao: 'padrão',
  area: 'área',
  areas: 'áreas',
  combustivel: 'combustível',
  rocada: 'roçada',
  rocadas: 'roçadas',
  sitio: 'sítio',
  mao: 'mão',
  nao: 'não',
  sao: 'são',
  tambem: 'também',
  alem: 'além',
  apos: 'após',
  entao: 'então',
  porem: 'porém',
  voce: 'você',
  voces: 'vocês',
  ate: 'até',
  util: 'útil',
  uteis: 'úteis',
  responsavel: 'responsável',
  responsaveis: 'responsáveis',
  obrigatorio: 'obrigatório',
  necessario: 'necessário',
  necessaria: 'necessária',
  disponivel: 'disponível',
  possivel: 'possível',
  tecnico: 'técnico',
  tecnica: 'técnica',
  eletrica: 'elétrica',
  eletrico: 'elétrico',
  hidraulica: 'hidráulica',
  hidraulico: 'hidráulico',
  ceramica: 'cerâmica',
  agua: 'água',
  codigo: 'código',
  periodo: 'período',
  proprietario: 'proprietário',
  proprietaria: 'proprietária',
  peca: 'peça',
  pecas: 'peças',
  maquina: 'máquina',
  maquinas: 'máquinas',
  veiculo: 'veículo',
  veiculos: 'veículos',
  caminhao: 'caminhão',
  pix: 'Pix'
}

// Fora de e-mails, endereços e caminhos: sem letra/número/@ / _ \ . antes e sem letra, @ / _ \
// ou ".letra" depois ("servico.com" e "ate@x.com" não são texto corrido).
const PADRAO_ACENTOS = new RegExp(
  `(?<![\\p{L}\\p{N}@/_\\\\.])(${Object.keys(ACENTOS).join('|')})(?![\\p{L}\\p{N}@/_\\\\]|\\.\\p{L})`,
  'giu'
)

function acentuar(texto: string): string {
  return texto
    .replace(PADRAO_ACENTOS, (palavra) => {
      const certa = ACENTOS[palavra.toLowerCase()]
      if (palavra.length > 1 && palavra === palavra.toUpperCase() && palavra !== 'Pix')
        return certa.toUpperCase()
      return palavra[0] === palavra[0].toUpperCase() && palavra[0] !== palavra[0].toLowerCase()
        ? certa[0].toUpperCase() + certa.slice(1)
        : certa
    })
    .replace(/(?<![\p{L}\p{N}])a vista(?![\p{L}\p{N}])/giu, (m) =>
      m[0] === 'A' ? 'À vista' : 'à vista'
    )
}

function espacar(texto: string): string {
  return texto
    .split('\n')
    .map((linha) =>
      linha
        .replace(/[ \t]+/g, ' ')
        .replace(/ +([,;:.!?])/g, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/(?<=[\p{L}\p{N}])([,;])(?=\p{L})/gu, '$1 ')
        .replace(/(?<=\p{L}):(?=\p{L})/gu, ': ')
        .replace(/(?<=\p{Ll}{2})([.!?])(?=\p{Lu})/gu, '$1 ')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

const ABREVIACOES = new Set(['etc', 'aprox', 'obs', 'tel', 'cnpj', 'ltda', 'sr', 'sra', 'dr'])
const MARCADOR_LISTA = /^(\s*(?:[-*•]|\d+[.)])\s+)/u

const maiuscula = (c: string): string => c.toLocaleUpperCase('pt-BR')

function capitalizar(texto: string): string {
  const linhas = texto.split('\n')
  let anteriorTerminaFrase = true
  const saida = linhas.map((linha) => {
    const marcador = MARCADOR_LISTA.exec(linha)?.[1] ?? ''
    let corpo = linha.slice(marcador.length)
    const abreFrase = anteriorTerminaFrase || marcador !== ''
    // Só letras: "3 árvores…" e "R$ 100" não ganham maiúscula no meio.
    if (abreFrase && /^\p{Ll}/u.test(corpo)) corpo = maiuscula(corpo[0]) + corpo.slice(1)
    // Depois de ponto final, "ok. próximo" vira "ok. Próximo"; abreviações ficam como estão.
    corpo = corpo.replace(
      /(\p{L}{3,})([.!?])(\s+)(\p{Ll})/gu,
      (m, palavra: string, fim: string, espaco: string, letra: string) =>
        ABREVIACOES.has(forma(palavra)) ? m : `${palavra}${fim}${espaco}${maiuscula(letra)}`
    )
    anteriorTerminaFrase = linha.trim() === '' || /[.!?:;]\s*$/.test(linha)
    return marcador + corpo
  })
  return saida.join('\n')
}

function pontuarFim(texto: string): string {
  const linhas = texto.split('\n')
  let i = linhas.length - 1
  while (i >= 0 && linhas[i].trim() === '') i--
  if (i < 0) return texto
  const ultima = linhas[i].trimEnd()
  const palavras = ultima.replace(MARCADOR_LISTA, '').split(/\s+/).filter(Boolean)
  const ultimoTermo = palavras[palavras.length - 1] ?? ''
  const terminaEmPontuacao = /[.!?…:;,]$/.test(ultima)
  const apenasNumero = palavras.length <= 3 && /^[\d.,%/:-]+$/.test(ultimoTermo)
  if (
    palavras.length >= 2 &&
    !terminaEmPontuacao &&
    !apenasNumero &&
    /[\p{L}\p{N})%]$/u.test(ultima)
  )
    linhas[i] = `${ultima}.`
  return linhas.join('\n')
}

/**
 * Correções que não dependem do modelo: espaços e pontuação, acentos de palavras comuns,
 * maiúscula no início das frases e ponto final. Nunca altera números, nomes nem condições.
 */
export function corrigirTexto(texto: string, campo: CampoRevisao): string {
  let resultado = capitalizar(acentuar(espacar(texto)))
  // Anotação interna é uma frase de lista, sem ponto obrigatório.
  if (campo !== 'anotacao') resultado = pontuarFim(resultado)
  return resultado.trim()
}

// ------------------------------------------------------------------ Pipeline

export type OrigemSugestao = 'modelo' | 'automatica' | 'inalterada'

export interface SugestaoPreparada {
  texto: string
  /** modelo: a IA contribuiu; automatica: só correções determinísticas; inalterada: nada a mudar. */
  origem: OrigemSugestao
}

/**
 * Transforma a resposta bruta do modelo na sugestão final. Se o modelo devolver o mesmo texto
 * ou trocar os papéis, cai para as correções determinísticas do original.
 */
export function prepararSugestao(
  original: string,
  resposta: string,
  campo: CampoRevisao
): SugestaoPreparada {
  const base = original.trim()
  const automatica = corrigirTexto(base, campo)
  const limpa = limparRotulos(resposta, base)
  const motivo = limpa ? violacaoDePapeis(base, limpa) : null
  if (!limpa || motivo) {
    if (automatica !== base) return { texto: automatica, origem: 'automatica' }
    if (motivo) throw new Error(`${motivo} Tente novamente ou edite o texto manualmente.`)
    return { texto: base, origem: 'inalterada' }
  }
  const candidata = corrigirTexto(limpa, campo)
  if (candidata === base) return { texto: base, origem: 'inalterada' }
  // Se a IA só repetiu o texto, a melhoria vem das correções automáticas do original.
  return { texto: candidata, origem: forma(limpa) === forma(base) ? 'automatica' : 'modelo' }
}
