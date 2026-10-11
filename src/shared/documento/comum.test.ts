import { describe, expect, it } from 'vitest'
import {
  destinatarioComTratamento,
  destinatarioNoDocumento,
  nomeBaseDocumento,
  normalizarDestinatario,
  localEData
} from './comum'

describe('apresentação comum de documentos', () => {
  it('mostra somente a data quando a cidade não foi informada', () => {
    expect(localEData('', '2026-10-11')).toBe('11 de outubro de 2026')
    expect(localEData('Rua Exemplo, 10, Curitiba - PR', '2026-10-11')).toBe(
      'Curitiba, 11 de outubro de 2026'
    )
  })
  it('guarda destinatário sem vírgula e apresenta exatamente uma', () => {
    expect(normalizarDestinatario(' Joãozin,  ')).toBe('Joãozin')
    expect(destinatarioNoDocumento('Joãozin,,')).toBe('Joãozin,')
  })
  it('monta nome seguro a partir da data do documento', () => {
    expect(nomeBaseDocumento('relatorio', 'Relatório de Serviço', 'João/zin', '2026-03-24')).toBe(
      'Relatório de Serviço - 000000 - Joãozin - 2026-03-24 - v001'
    )
  })
  it('usa tratamento apenas na apresentação do documento', () => {
    expect(destinatarioComTratamento('Ao Sr.', 'Joãozin,')).toBe('Ao Sr. Joãozin')
    expect(nomeBaseDocumento('orcamento', 'Proposta especial: João', 'Joãozin', '2026-03-24')).toBe(
      'Proposta de Serviço - 000000 - Joãozin - 2026-03-24 - v001'
    )
    expect(nomeBaseDocumento('orcamento', '', 'Joãozin', '2026-03-24')).toBe(
      'Proposta de Serviço - 000000 - Joãozin - 2026-03-24 - v001'
    )
  })
})
