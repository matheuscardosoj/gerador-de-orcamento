import { useEffect } from 'react'
import { api } from '../lib/api'
import { concluirNotificacao, notificar } from '../lib/notificacoes'
import { useNav } from '../lib/nav'
import { useConta } from './ContaGate'

export function MonitorConexao(): null {
  const { navegar, executarComConfirmacao } = useNav()
  const { conta } = useConta()
  const empresa = conta.empresa?.id
  useEffect(() => {
    let ativo = true,
      consulta = 0,
      interrompida = false,
      avisouRetorno = false
    const conferir = (): void => {
      const atual = ++consulta
      void api.nuvem
        .status()
        .then(async (s) => {
          if (!ativo || atual !== consulta || !s.configurada) return
          if (s.falhaSincronizacao && !s.falhaSincronizacao.temporaria) {
            concluirNotificacao('conexao')
            concluirNotificacao('retorno-conexao')
            interrompida = false
            return
          }
          if (s.conexao === 'inacessivel' || s.falhaSincronizacao?.temporaria) {
            interrompida = true
            avisouRetorno = false
            notificar(
              'Não foi possível acessar o serviço. As alterações locais estão preservadas; a conexão e os envios serão retomados automaticamente.',
              'aviso',
              {
                chave: 'conexao',
                categoria: 'conectividade',
                origem: 'automatica',
                acao: {
                  rotulo: 'Tentar agora',
                  executar: async () => {
                    await api.nuvem.verificarConexao()
                    return false
                  }
                }
              }
            )
          } else if (s.conexao === 'acessivel') {
            concluirNotificacao('conexao')
            if (interrompida && (s.sincronizando || s.recuperandoConexao)) {
              notificar('Conexão restabelecida. Retomando sincronização…', 'info', {
                chave: 'retorno-conexao',
                persistente: true
              })
              return
            }
            concluirNotificacao('conexao')
            if (!interrompida || avisouRetorno) return
            avisouRetorno = true
            notificar(
              s.erro || s.pendentes
                ? 'Conexão restabelecida. Existem alterações que precisam de revisão em Nuvem.'
                : 'Conexão restabelecida. Sincronização concluída.',
              s.erro || s.pendentes ? 'aviso' : 'sucesso',
              { chave: 'retorno-conexao' }
            )
            const rascunhos = await api.rascunhos.list()
            if (!ativo || atual !== consulta) return
            const locais = rascunhos.filter((r) => r.estado === 'local' || r.estado === 'conflito')
            if (locais.length)
              notificar(
                'Há rascunhos guardados neste computador. Compare com a versão da empresa antes de aplicar.',
                'info',
                {
                  chave: 'rascunhos-recuperacao',
                  persistente: true,
                  acao: {
                    rotulo: 'Revisar rascunho',
                    executar: () => {
                      executarComConfirmacao(() => {
                        const r = locais[0]
                        window.sessionStorage.setItem(
                          'gdo:abrir-colaboracao-pendente',
                          JSON.stringify({ tipo: r.tipo, id: r.documentoId })
                        )
                        navegar(
                          r.tipo === 'relatorio'
                            ? { nome: 'editorRelatorio', relatorioId: r.documentoId }
                            : r.tipo === 'recibo'
                              ? { nome: 'recibos', reciboId: r.documentoId }
                              : { nome: 'editor', orcamentoId: r.documentoId }
                        )
                        concluirNotificacao('rascunhos-recuperacao')
                      })
                      return false
                    }
                  }
                }
              )
          }
        })
        .catch(() => undefined)
    }
    const sinal = (evento: Event): void => {
      void api.nuvem
        .verificarConexao(evento.type === 'offline' ? 'offline' : 'online')
        .catch(() => undefined)
    }
    window.addEventListener('online', sinal)
    window.addEventListener('offline', sinal)
    const remover = api.eventos.observarDados((e) => {
      if (e.status) conferir()
    })
    conferir()
    return () => {
      ativo = false
      remover()
      window.removeEventListener('online', sinal)
      window.removeEventListener('offline', sinal)
      for (const chave of ['conexao', 'retorno-conexao', 'rascunhos-recuperacao'])
        concluirNotificacao(chave)
    }
  }, [empresa, navegar, executarComConfirmacao])
  return null
}
