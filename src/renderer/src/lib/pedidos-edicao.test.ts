import { expect, it } from 'vitest'
import type { ControleEdicao, EstadoControleEdicao } from '@shared/evolucao'
import { pedidosAtuais, CicloPedidosEdicao } from './pedidos-edicao'
import { EstadosEdicao } from './estado-edicao'
const controle = (geracao: number, total = 3): ControleEdicao => ({
  tipo: 'orcamento',
  documentoId: 'doc',
  usuarioId: 'mesma-conta',
  usuarioNome: 'Mesmo nome',
  computador: 'pc-0',
  geracao,
  expiraEm: null,
  offline: false,
  revisao: 1,
  podeEditar: true,
  solicitacoes: Array.from({ length: total }, (_, i) => ({
    usuarioNome: 'Mesmo nome',
    computador: `pc-${i}`,
    criadoEm: 'mesmo instante'
  }))
})
it.each([3, 10, 50])(
  'mantém um aviso por solicitante para %i computadores com nomes e conta iguais',
  (total) => {
    const ciclo = new CicloPedidosEdicao(),
      c = controle(1, total)
    const chaves = pedidosAtuais('empresa', 'orcamento', 'doc', c)
    expect(chaves).toHaveLength(total - 1)
    expect(ciclo.reconciliar([...chaves, ...chaves]).novos).toHaveLength(total - 1)
    expect(ciclo.reconciliar(chaves)).toEqual({ novos: [], removidos: [] })
    expect(
      ciclo.reconciliar(pedidosAtuais('empresa', 'orcamento', 'doc', { ...c, podeEditar: false }))
        .removidos
    ).toHaveLength(total - 1)
  }
)
it('20 alternâncias removem pedidos antigos; cancelamento permite novo pedido e contextos são isolados', () => {
  const ciclo = new CicloPedidosEdicao()
  let anteriores: string[] = []
  for (let geracao = 1; geracao <= 20; geracao++) {
    const chaves = ['a', 'b'].flatMap((empresa) =>
      ['doc1', 'doc2'].flatMap((id) => pedidosAtuais(empresa, 'orcamento', id, controle(geracao)))
    )
    const delta = ciclo.reconciliar(chaves)
    expect(delta.novos).toHaveLength(8)
    expect(delta.removidos).toEqual(anteriores)
    expect(ciclo.reconciliar(chaves).novos).toEqual([])
    anteriores = chaves
  }
  expect(ciclo.reconciliar([]).removidos).toHaveLength(8)
  expect(ciclo.reconciliar(anteriores).novos).toHaveLength(8)
})
it('não deixa resposta atrasada restaurar responsável, pedidos ou documento removido', () => {
  const estados = new EstadosEdicao()
  const snapshot = (
    sequencia: number,
    c: ControleEdicao | null,
    sessao = 1
  ): EstadoControleEdicao => ({
    empresaId: 'a',
    sessao,
    sequencia,
    tipo: 'orcamento',
    documentoId: 'doc',
    controle: c
  })
  estados.aceitar(snapshot(2, controle(2)))
  expect(estados.aceitar(snapshot(1, controle(1)))?.controle?.geracao).toBe(2)
  estados.aceitar(snapshot(3, null))
  expect(estados.aceitar(snapshot(2, controle(2)))?.controle).toBeNull()
  estados.aceitar(snapshot(4, controle(1), 2))
  expect(estados.aceitar(snapshot(999, controle(99), 1))).toBeNull()
})
