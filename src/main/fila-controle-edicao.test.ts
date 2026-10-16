import { expect, it, vi } from 'vitest'
import { FilaControleEdicao } from './fila-controle-edicao'
function barreira() {
  let liberar!: () => void
  const espera = new Promise<void>((r) => {
    liberar = r
  })
  return { espera, liberar }
}
it('coalesce leituras contíguas, mas não atravessa uma transferência', async () => {
  const fila = new FilaControleEdicao(),
    b = barreira(),
    ordem: string[] = []
  const a = fila.executar('empresa/doc', true, async () => {
    ordem.push('leitura antiga')
    await b.espera
    return 1
  })
  const repetida = fila.executar('empresa/doc', true, async () => 999)
  expect(repetida).toBe(a)
  const transferencia = fila.executar('empresa/doc', false, async () => {
    ordem.push('transferência')
    return 2
  })
  const atual = fila.executar('empresa/doc', true, async () => {
    ordem.push('leitura nova')
    return 3
  })
  await vi.waitFor(() => expect(ordem).toEqual(['leitura antiga']))
  b.liberar()
  expect(await Promise.all([a, repetida, transferencia, atual])).toEqual([1, 1, 2, 3])
  expect(ordem).toEqual(['leitura antiga', 'transferência', 'leitura nova'])
})
it('uma falha não bloqueia novas operações nem outros documentos ou empresas', async () => {
  const fila = new FilaControleEdicao(),
    b = barreira()
  const lento = fila.executar('empresa-a/doc', false, async () => {
    await b.espera
    throw new Error('rede')
  })
  const falha = expect(lento).rejects.toThrow('rede')
  expect(await fila.executar('empresa-b/doc', false, async () => 'outra empresa')).toBe(
    'outra empresa'
  )
  expect(await fila.executar('empresa-a/outro', false, async () => 'outro documento')).toBe(
    'outro documento'
  )
  const depois = fila.executar('empresa-a/doc', false, async () => 42)
  b.liberar()
  await falha
  expect(await depois).toBe(42)
})
it.each([3, 10, 50])(
  'ordena solicitações de %i computadores sem perder operações',
  async (quantidade) => {
    const fila = new FilaControleEdicao(),
      aplicadas: number[] = []
    await Promise.all(
      Array.from({ length: quantidade }, (_, i) =>
        fila.executar('mesmo documento', false, async () => {
          aplicadas.push(i)
        })
      )
    )
    expect(aplicadas).toEqual(Array.from({ length: quantidade }, (_, i) => i))
  }
)
