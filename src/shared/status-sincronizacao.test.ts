import { describe, expect, it } from 'vitest'
import { resumirSincronizacao } from './status-sincronizacao'
import type { StatusNuvem } from './evolucao'

const conectado: StatusNuvem = {
  configurada: true,
  autenticada: true,
  computador: 'pc',
  pendentes: 0,
  conflitos: [],
  ultimaSincronizacao: '2026-10-13T10:00:00Z',
  erro: null,
  bytesBanco: 0,
  reservas: { orcamento: 0, relatorio: 0, recibo: 0 },
  protocolo: 3,
  tempoReal: 'conectado'
}

describe('Resumo de sincronização para o usuário', () => {
  it('operações preservadas não mudam a condição de sincronizado', () => {
    expect(resumirSincronizacao({ ...conectado, pendenciasPreservadas: 37 })).toEqual(
      resumirSincronizacao(conectado)
    )
  })
  it('não informa sincronizado quando a sessão não está autenticada', () => {
    expect(resumirSincronizacao({ ...conectado, autenticada: false }).titulo).toBe(
      'Entre novamente na conta'
    )
  })
  it('não confunde falha de envio com falta de internet', () => {
    expect(resumirSincronizacao({ ...conectado, erro: 'Falha de validação' }).titulo).toBe(
      'Sincronização interrompida'
    )
    expect(
      resumirSincronizacao({
        ...conectado,
        falhas: [{ id: '1', entidade: 'clientes:1', detalhe: 'Confira o cliente' }]
      }).titulo
    ).toBe('Uma alteração precisa de atenção')
  })
  it('distingue indisponibilidade do tempo real de pendências locais', () => {
    const resumo = resumirSincronizacao({ ...conectado, tempoReal: 'indisponivel' })
    expect(resumo.tom).toBe('aviso')
    expect(resumo.descricao).toContain('Não há alterações locais aguardando envio')
  })
  it('só informa atualização concluída depois da primeira sincronização', () => {
    expect(resumirSincronizacao({ ...conectado, ultimaSincronizacao: null }).titulo).toBe(
      'Preparando a primeira sincronização'
    )
  })
  it('apresenta quantidade com concordância', () => {
    expect(resumirSincronizacao({ ...conectado, pendentes: 1 }).titulo).toBe(
      '1 alteração aguardando envio'
    )
    expect(resumirSincronizacao({ ...conectado, pendentes: 2 }).titulo).toBe(
      '2 alterações aguardando envio'
    )
  })
})
