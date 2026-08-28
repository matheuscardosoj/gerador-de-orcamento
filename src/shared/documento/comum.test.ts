import { describe, expect, it } from 'vitest'
import { destinatarioComTratamento, destinatarioNoDocumento, nomeBaseDocumento, normalizarDestinatario } from './comum'

describe('apresentação comum de documentos', () => {
  it('guarda destinatário sem vírgula e apresenta exatamente uma', () => {
    expect(normalizarDestinatario(' Joãozin,  ')).toBe('Joãozin')
    expect(destinatarioNoDocumento('Joãozin,,')).toBe('Joãozin,')
  })
  it('monta nome seguro a partir da data do documento', () => {
    expect(nomeBaseDocumento('relatorio', 'João/zin', '2026-03-24')).toBe('Relatório de Serviço - Joãozin - 24.03.2026')
  })
  it('usa tratamento apenas na apresentação do documento', () => {
    expect(destinatarioComTratamento('Ao Sr.', 'Joãozin,')).toBe('Ao Sr. Joãozin')
    expect(nomeBaseDocumento('orcamento', 'Joãozin', '2026-03-24')).not.toContain('Ao Sr.')
  })
})
