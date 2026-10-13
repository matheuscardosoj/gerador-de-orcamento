import { describe, expect, it } from 'vitest'
import {
  adaptarExclusaoCadastroLegada,
  criarPayloadCadastroExcluido,
  criarPayloadCadastroSalvo,
  normalizarPayloadCadastro,
  TABELAS_CADASTRO
} from './cadastros-sincronizacao'

describe('contrato canônico de cadastros sincronizados', () => {
  it('recusa dados duplicados contraditórios sem corrigir silenciosamente o cliente', () => {
    const row = {
      id: 'cliente',
      nome: 'Nome atual',
      dados_json: '{"id":"cliente","nome":"Nome antigo"}'
    }
    expect(() => criarPayloadCadastroSalvo('clientes', 'cliente', row)).toThrow('inconsistentes')
    expect(row.dados_json).toContain('Nome antigo')
    expect(
      criarPayloadCadastroSalvo('clientes', 'cliente', {
        ...row,
        dados_json: '{"id":"cliente","nome":"Nome atual"}'
      })
    ).toHaveProperty('row.nome', 'Nome atual')
  })
  it('produz exclusão mínima sem row:null', () => {
    for (const tabela of TABELAS_CADASTRO) {
      const payload = criarPayloadCadastroExcluido(tabela, 'registro-1')
      expect(payload).toEqual({ tabela, id: 'registro-1' })
      expect(Object.hasOwn(payload, 'row')).toBe(false)
    }
  })

  it('adapta a exclusão legada somente no payload e de forma idempotente', () => {
    const original = {
      id: 'id-da-operacao',
      entidade: 'clientes:cliente-1',
      base: 8,
      criadoEm: '2026-10-12T12:00:00Z',
      payload: { tabela: 'clientes', id: 'cliente-1', row: null }
    }
    const adaptada = { ...original, payload: adaptarExclusaoCadastroLegada(original.payload) }
    expect(adaptada).toEqual({
      ...original,
      payload: { tabela: 'clientes', id: 'cliente-1' }
    })
    expect(original.payload).toHaveProperty('row', null)
    expect(adaptarExclusaoCadastroLegada(adaptada.payload)).toEqual(adaptada.payload)
  })

  it('preserva documento, pagamento e domínio desconhecido sem adaptar row:null', () => {
    for (const tabela of [
      'orcamentos',
      'relatorios',
      'recibos',
      'recebimentos',
      'versoes',
      'desconhecido'
    ]) {
      const payload = { tabela, id: 'registro-1', row: null }
      expect(adaptarExclusaoCadastroLegada(payload)).toBe(payload)
      expect(() => normalizarPayloadCadastro(payload)).toThrow('tipo de registro')
    }
    const documento = { tipo: 'recibo', id: 'recibo-1', rows: { recibos: [] }, excluido: true }
    expect(adaptarExclusaoCadastroLegada(documento)).toBe(documento)
  })

  it('mantém a linha de salvamento sem alterar valores ou campos desconhecidos', () => {
    const row = {
      id: 'cliente-1',
      nome: 'Cliente',
      ativo: 0,
      dados_json: '{"tipoPessoa":"pj"}',
      extra: null
    }
    const payload = criarPayloadCadastroSalvo('clientes', 'cliente-1', row)
    expect(normalizarPayloadCadastro(payload)).toEqual(payload)
    expect(normalizarPayloadCadastro(payload).row).toBe(row)
    expect(row).toEqual({
      id: 'cliente-1',
      nome: 'Cliente',
      ativo: 0,
      dados_json: '{"tipoPessoa":"pj"}',
      extra: null
    })
  })

  it('confere as chaves próprias de configuração e imagem', () => {
    expect(
      criarPayloadCadastroSalvo('configuracoes', 'empresa', { chave: 'empresa', valor: '{}' }).id
    ).toBe('empresa')
    expect(
      criarPayloadCadastroSalvo('imagens', 'hash-imagem', { hash: 'hash-imagem', base64: 'base64' })
        .id
    ).toBe('hash-imagem')
    expect(() => criarPayloadCadastroSalvo('configuracoes', 'empresa', { id: 'empresa' })).toThrow(
      'identificação'
    )
    expect(() =>
      criarPayloadCadastroSalvo('imagens', 'hash-imagem', { hash: 'outro-hash' })
    ).toThrow('identificação')
  })

  it('rejeita identificação ausente e incoerente sem corrigir silenciosamente', () => {
    for (const id of ['', ' ', ' cliente-1 ', null, 123]) {
      expect(() => normalizarPayloadCadastro({ tabela: 'clientes', id, row: null })).toThrow(
        'identificação'
      )
    }
    expect(() =>
      normalizarPayloadCadastro({ tabela: 'clientes', id: 'a', row: { id: 'b' } })
    ).toThrow('identificação')
    expect(() => normalizarPayloadCadastro({ tabela: 'clientes', id: 'a', row: {} })).toThrow(
      'identificação'
    )
  })

  it('não converte valores falsos, strings, arrays ou row:undefined em exclusão', () => {
    for (const row of [false, 0, '', 'null', [], undefined]) {
      expect(() => normalizarPayloadCadastro({ tabela: 'clientes', id: 'a', row })).toThrow(
        'registro válido'
      )
    }
    expect(normalizarPayloadCadastro({ tabela: 'clientes', id: 'a' })).toEqual({
      tabela: 'clientes',
      id: 'a'
    })
  })

  it('não usa o adaptador para apagar metadados de outro contrato', () => {
    const payload = { tabela: 'clientes', id: 'cliente-1', row: null, rows: { recebimentos: [] } }
    expect(() => adaptarExclusaoCadastroLegada(payload)).toThrow('incompatíveis')
    expect(payload.rows.recebimentos).toEqual([])
  })
})
