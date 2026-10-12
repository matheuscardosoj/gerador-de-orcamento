import { expect, it } from 'vitest'
import { conciliarDocumento, snapshotRascunho } from './conciliacao'
it('não mistura quantidade e preço de duas alterações financeiras concorrentes no mesmo serviço', () => {
  const item = {
    id: 's',
    descricao: 'Serviço',
    quantidade: 1,
    valorUnitario: 100,
    valorTotal: 100,
    calculo: null
  }
  const base = { itensServico: [item] },
    local = { itensServico: [{ ...item, quantidade: 2, valorTotal: 200 }] },
    remoto = {
      itensServico: [
        { ...item, valorUnitario: 150, valorTotal: 150, descricao: 'Descrição revisada' }
      ]
    }
  const disputa = conciliarDocumento(base, local, remoto)
  expect(disputa.conflitos).toMatchObject([{ caminho: 'itensServico.s.preco', financeiro: true }])
  const resolvido = conciliarDocumento(base, local, remoto, { 'itensServico.s.preco': 'local' })
  expect(resolvido.documento.itensServico[0]).toMatchObject({
    descricao: 'Descrição revisada',
    quantidade: 2,
    valorUnitario: 100,
    valorTotal: 200
  })
})
it('combina mudanças independentes e preserva identidade e número atuais', () => {
  const b = { id: 'a', numero: 4, descricao: 'Original', observacao: '', versao: 1 }
  const resultado = conciliarDocumento(
    b,
    { ...b, descricao: 'Local', numero: 99 },
    { ...b, observacao: 'Remota', versao: 2 }
  )
  expect(resultado.conflitos).toEqual([])
  expect(resultado.documento).toEqual({
    id: 'a',
    numero: 4,
    descricao: 'Local',
    observacao: 'Remota',
    versao: 2
  })
})
it('apresenta a disputa de valores e só aplica escolha explícita', () => {
  const b = { valor: 100, descricao: 'Serviço' },
    l = { ...b, valor: 120 },
    r = { ...b, valor: 130 }
  expect(conciliarDocumento(b, l, r).conflitos).toMatchObject([
    { caminho: 'valor', financeiro: true, base: 100, local: 120, remoto: 130 }
  ])
  expect(conciliarDocumento(b, l, r, { valor: 'local' })).toEqual({ documento: l, conflitos: [] })
})
it('combina campos de itens com IDs estáveis sem perder a reordenação', () => {
  const b = {
    itens: [
      { id: 'a', descricao: 'A', valor: 10 },
      { id: 'b', descricao: 'B', valor: 20 }
    ]
  }
  const l = { itens: [b.itens[1], { ...b.itens[0], descricao: 'A revisado' }] }
  const r = { itens: [b.itens[0], { ...b.itens[1], valor: 25 }] }
  expect(conciliarDocumento(b, l, r)).toEqual({
    documento: {
      itens: [
        { id: 'b', descricao: 'B', valor: 25 },
        { id: 'a', descricao: 'A revisado', valor: 10 }
      ]
    },
    conflitos: []
  })
})
it('não apaga silenciosamente um item modificado pelo outro usuário', () => {
  const b = { itens: [{ id: 'a', descricao: 'A' }] },
    l = { itens: [] },
    r = { itens: [{ id: 'a', descricao: 'A revisado' }] }
  const resultado = conciliarDocumento(b, l, r)
  expect(resultado.conflitos[0].caminho).toBe('itens.a')
  expect(resultado.documento.itens).toEqual(r.itens)
})
it('guarda referências de imagem sem duplicar os dados de imagem', () => {
  const b = {
    anexos: [
      {
        id: 'a',
        imagemHash: 'hash',
        imagemDataUrl: 'data:image/jpeg;base64,AAA',
        miniaturaDataUrl: 'BBB'
      }
    ],
    empresaSnapshot: { logoHash: 'logo', logoDataUrl: 'CCC' }
  }
  expect(snapshotRascunho(b)).toEqual({
    anexos: [{ id: 'a', imagemHash: 'hash' }],
    empresaSnapshot: { logoHash: 'logo' }
  })
})
