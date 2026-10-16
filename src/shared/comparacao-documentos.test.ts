import { it, expect } from 'vitest'
import { compararDocumentos } from './comparacao-documentos'
import type { Documento } from './types'
it('mostra alterações de cadastro congelado, apresentação, cálculo e imagens sem expor Base64', () => {
  const antigo = {
    id: 'p',
    destinatario: 'Cliente',
    itensServico: [
      {
        id: 's',
        calculo: { entrada: { avulsos: [{ id: 'c', aplicarAcrescimo: true, valor: 1600 }] } }
      }
    ],
    camposCliente: ['documento'],
    clienteSnapshot: { nome: 'Cliente', telefone: '111' },
    empresaSnapshot: { nome: 'Empresa', logoDataUrl: 'dados enormes' },
    anexos: [{ id: 'a', imagemHash: 'foto-antiga' }]
  } as unknown as Documento
  const atual = structuredClone(antigo)
  const dados = atual as unknown as {
    itensServico: Array<{ calculo: { entrada: { avulsos: Array<{ aplicarAcrescimo: boolean }> } } }>
    clienteSnapshot: { telefone: string }
    camposCliente: string[]
    anexos: Array<{ imagemHash: string }>
  }
  dados.itensServico[0].calculo.entrada.avulsos[0].aplicarAcrescimo = false
  dados.clienteSnapshot.telefone = '222'
  dados.camposCliente.push('telefone')
  dados.anexos[0].imagemHash = 'foto-nova'
  const diferencas = compararDocumentos(antigo, atual)
  expect(diferencas).toHaveLength(4)
  expect(
    diferencas.some(
      (d) => d.campo.includes('Aplicar lucro') && d.anterior === 'Sim' && d.atual === 'Não'
    )
  ).toBe(true)
  expect(diferencas.some((d) => d.campo.includes('Telefone') && d.atual === '222')).toBe(true)
  expect(JSON.stringify(diferencas)).not.toContain('dados enormes')
  expect(compararDocumentos(antigo, { ...antigo, atualizadoEm: 'novo', versao: 99 })).toEqual([])
})
