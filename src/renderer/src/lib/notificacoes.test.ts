import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  notificar,
  concluirNotificacao,
  notificacoesAtivas,
  definirContextoNotificacoes,
  dispensarNotificacao,
  atualizarAcaoNotificacao
} from './notificacoes'

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  definirContextoNotificacoes('teste-' + Math.random())
})
afterEach(() => vi.unstubAllGlobals())

it('deduplica e atualiza um aviso sem mudar a identidade', () => {
  notificar('Sem acesso à nuvem.', 'aviso', { chave: 'conexao' })
  const id = notificacoesAtivas()[0].id
  for (let n = 0; n < 20; n++) notificar('Sem acesso à nuvem.', 'aviso', { chave: 'conexao' })
  expect(notificacoesAtivas()).toHaveLength(1)
  notificar('Conexão restabelecida.', 'sucesso', { chave: 'conexao' })
  expect(notificacoesAtivas()[0]).toMatchObject({
    id,
    mensagem: 'Conexão restabelecida.',
    persistente: false
  })
  concluirNotificacao('conexao')
  expect(notificacoesAtivas()).toHaveLength(0)
})
it('preserva erros e remove avisos ao trocar a empresa', () => {
  notificar('Falha ao salvar.', 'erro')
  expect(notificacoesAtivas()[0].persistente).toBe(true)
  definirContextoNotificacoes('outra empresa')
  expect(notificacoesAtivas()).toHaveLength(0)
})
it('atualiza a ação e permite fechar um aviso com seu identificador', () => {
  notificar('Pedido de edição.', 'info', {
    chave: 'pedido',
    acao: { rotulo: 'Abrir', executar: () => {} }
  })
  atualizarAcaoNotificacao('pedido', true)
  expect(notificacoesAtivas()[0].acao?.desabilitada).toBe(true)
  dispensarNotificacao(notificacoesAtivas()[0].id)
  expect(notificacoesAtivas()).toHaveLength(0)
})
