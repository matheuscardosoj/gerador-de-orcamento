import { expect, it } from 'vitest'
import { validarRespostaIA } from './revisao-ia'
it('recusa alteração, invenção ou exclusão de dados numéricos', () => {
  const original = 'Cortar 3 árvores por R$ 1.600,00 em 11/10/2026.'
  expect(() =>
    validarRespostaIA(original, 'Corte de 3 árvores, por R$ 1.600,00, em 11/10/2026.')
  ).not.toThrow()
  for (const s of [
    'Cortar 4 árvores por R$ 1.600,00 em 11/10/2026.',
    'Cortar 3 árvores.',
    'Cortar 3 árvores por R$ 1.600,00 em 11/10/2026, com prazo de 2 dias.'
  ])
    expect(() => validarRespostaIA(original, s)).toThrow('recusada')
})
it('resumo pode omitir dados, mas não inventar nem repetir números', () => {
  expect(() =>
    validarRespostaIA('Cliente 3 árvores, R$ 1.600,00.', 'Corte de 3 árvores.', true)
  ).not.toThrow()
  expect(() => validarRespostaIA('3 árvores.', '3 árvores em 3 dias.', true)).toThrow('recusada')
})
