// Conferência de tipos na borda do IPC para cadastros que gravavam o objeto como chegava.
import type { ErroValidacao } from './validacao'

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function exigirTextos(
  dados: Record<string, unknown>,
  campos: string[],
  obrigatorios: boolean
): ErroValidacao[] {
  const erros: ErroValidacao[] = []
  for (const campo of campos) {
    const valor = dados[campo]
    if (valor === undefined && !obrigatorios) continue
    if (typeof valor !== 'string')
      erros.push({ campo, mensagem: `O campo ${campo} deve ser um texto.` })
  }
  return erros
}

const CAMPOS_TEXTO_EMPRESA = [
  'nome',
  'razaoSocial',
  'endereco',
  'telefones',
  'email',
  'site',
  'cnpj',
  'textoAssinatura',
  'corFaixaRodape',
  'nomeExibicao'
]

/** Alterações parciais da empresa: só objetos, com os campos de texto realmente textuais. */
export function validarEmpresaParcial(patch: unknown): ErroValidacao[] {
  if (!objeto(patch)) return [{ campo: 'empresa', mensagem: 'Dados da empresa inválidos.' }]
  const erros = exigirTextos(patch, CAMPOS_TEXTO_EMPRESA, false)
  if (patch.logoDataUrl != null && typeof patch.logoDataUrl !== 'string')
    erros.push({ campo: 'logoDataUrl', mensagem: 'A logo deve ser uma imagem válida.' })
  return erros
}

/** Serviço do catálogo: completo na criação, parcial na edição. */
export function validarServicoCatalogo(dados: unknown, parcial: boolean): ErroValidacao[] {
  if (!objeto(dados)) return [{ campo: 'servico', mensagem: 'Dados do serviço inválidos.' }]
  const erros = exigirTextos(dados, ['nome', 'descricaoPadrao', 'unidade'], !parcial)
  const preco = dados.precoReferencia
  const presente = preco !== undefined
  if (
    (presente || !parcial) &&
    preco !== null &&
    (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0)
  )
    erros.push({
      campo: 'precoReferencia',
      mensagem: 'O preço de referência deve ser um número maior ou igual a zero.'
    })
  return erros
}
