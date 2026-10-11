import { expect, it } from 'vitest'
import { aguardarComCancelamento, validarRespostaIA } from './revisao-ia'
it('cancela a espera de inicialização sem cancelar o servidor compartilhado', async () => {
  let liberar!: (n: number) => void
  const servidor = new Promise<number>((resolve) => {
    liberar = resolve
  })
  const a = new AbortController(),
    b = new AbortController()
  const primeira = aguardarComCancelamento(servidor, a.signal)
  const segunda = aguardarComCancelamento(servidor, b.signal)
  const rejeitada = expect(primeira).rejects.toThrow('cancelada')
  a.abort(new Error('Revisão cancelada.'))
  await rejeitada
  liberar(42)
  expect(await segunda).toBe(42)
})
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
