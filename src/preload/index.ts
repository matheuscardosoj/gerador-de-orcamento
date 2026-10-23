import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, CrudApi } from '@shared/api'
import type { ArgumentosDoCanal, Canal, RetornoDoCanal } from '@shared/canais'

type EventoDados = import('../shared/evolucao').EventoDados
const ouvintesDados = new Set<(dados: EventoDados) => void>()
let escutandoDados = false

/** Chamada tipada pelo contrato de `AppApi`: argumentos e retorno vêm de `@shared/canais`. */
const invoke = <C extends Canal>(
  canal: C,
  ...args: ArgumentosDoCanal<C>
): Promise<RetornoDoCanal<C>> => ipcRenderer.invoke(canal, ...args)

// Os quatro cadastros compartilham a mesma forma; o genérico `T`/`C` só existe no renderer.
const invocarCadastro = (canal: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(canal, ...args)

function crud<T, C>(
  dominio: 'clientes' | 'servicos' | 'observacoes' | 'pagamentos'
): CrudApi<T, C> {
  return {
    list: () => invocarCadastro(`${dominio}.list`) as Promise<T[]>,
    create: (dto) => invocarCadastro(`${dominio}.create`, dto) as Promise<T>,
    update: (id, patch) => invocarCadastro(`${dominio}.update`, id, patch) as Promise<T | null>,
    remove: (id) => invocarCadastro(`${dominio}.remove`, id) as Promise<void>
  }
}

const api: AppApi = {
  conta: {
    status: () => invoke('conta.status'),
    entrar: (email, senha, lembrar) => invoke('conta.entrar', email, senha, lembrar),
    selecionarEmpresa: (id) => invoke('conta.selecionarEmpresa', id),
    sair: () => invoke('conta.sair'),
    atualizarNome: (nome) => invoke('conta.atualizarNome', nome),
    alterarEmail: (atual, novo) => invoke('conta.alterarEmail', atual, novo),
    confirmarAlteracaoEmail: (codigo) => invoke('conta.confirmarAlteracaoEmail', codigo),
    alterarSenha: (atual, nova) => invoke('conta.alterarSenha', atual, nova),
    alterarPapel: (usuario, papel) => invoke('conta.alterarPapel', usuario, papel),
    enviarCodigo: (email, tipo) => invoke('conta.enviarCodigo', email, tipo),
    confirmarCodigo: (email, codigo, tipo, senha) =>
      invoke('conta.confirmarCodigo', email, codigo, tipo, senha),
    convites: () => invoke('conta.convites'),
    convidar: (email, nome, papel) => invoke('conta.convidar', email, nome, papel),
    cancelarConvite: (id) => invoke('conta.cancelarConvite', id),
    reenviarConvite: (id) => invoke('conta.reenviarConvite', id),
    atualizarEmpresas: () => invoke('conta.atualizarEmpresas'),
    criarEmpresa: (nome, email, admin) => invoke('conta.criarEmpresa', nome, email, admin),
    excluirEmpresa: (id, nome) => invoke('conta.excluirEmpresa', id, nome),
    continuarAposIndisponibilidade: () => invoke('conta.continuarAposIndisponibilidade'),
    avisosEmail: () => invoke('conta.avisosEmail')
  },
  rascunhos: {
    list: (tipo, id) => invoke('rascunhos.list', tipo, id),
    get: (id) => invoke('rascunhos.get', id),
    create: (tipo, id, documento) => invoke('rascunhos.create', tipo, id, documento),
    save: (id, documento) => invoke('rascunhos.save', id, documento),
    comparar: (id, escolhas) => invoke('rascunhos.comparar', id, escolhas),
    aplicar: (id, revisao, escolhas) => invoke('rascunhos.aplicar', id, revisao, escolhas),
    copiar: (id) => invoke('rascunhos.copiar', id),
    remove: (id) => invoke('rascunhos.remove', id)
  },
  rascunhosCadastros: {
    guardar: (tipo, idOrigem, dados) => invoke('rascunhosCadastros.guardar', tipo, idOrigem, dados),
    listar: (tipo) => invoke('rascunhosCadastros.listar', tipo),
    descartar: (tipo, idOrigem) => invoke('rascunhosCadastros.descartar', tipo, idOrigem)
  },
  colaboracao: {
    acompanhados: () => invoke('colaboracao.acompanhados'),
    revisarRecebimentos: (tipo, id) => invoke('colaboracao.revisarRecebimentos', tipo, id),
    conciliarRecebimentos: (revisao, acao) =>
      invoke('colaboracao.conciliarRecebimentos', revisao, acao),
    acompanhar: (tipo, id, ativo) => invoke('colaboracao.acompanhar', tipo, id, ativo),
    membros: () => invoke('colaboracao.membros'),
    vincularMembro: (email, nome) => invoke('colaboracao.vincularMembro', email, nome),
    ativarMembro: (usuario, ativo) => invoke('colaboracao.ativarMembro', usuario, ativo),
    estadoEdicao: (tipo, id, acao, destino) =>
      invoke('colaboracao.estadoEdicao', tipo, id, acao, destino),
    edicao: (tipo, id, acao, destino) => invoke('colaboracao.edicao', tipo, id, acao, destino)
  },
  eventos: {
    observarDados: (callback) => {
      // Um único listener do IPC atende todos os componentes: evita o aviso de
      // vazamento do EventEmitter e isola falhas de um observador dos demais.
      if (!escutandoDados) {
        escutandoDados = true
        ipcRenderer.on('dados.alterados', (_evento, dados: EventoDados) => {
          for (const ouvinte of [...ouvintesDados]) {
            try {
              ouvinte(dados)
            } catch (erro) {
              console.error(erro)
            }
          }
        })
      }
      ouvintesDados.add(callback)
      return () => {
        ouvintesDados.delete(callback)
      }
    }
  },
  preferencias: {
    historico: (tipo) => invoke('preferencias.historico', tipo),
    salvarHistorico: (tipo, dados) => invoke('preferencias.salvarHistorico', tipo, dados)
  },
  reordenarCadastro: (tipo, ids) => invoke('cadastros.reordenar', tipo, ids),
  recibos: {
    alterarNumero: (id, n) => invoke('recibos.alterarNumero', id, n),
    numeracao: () => invoke('recibos.numeracao'),
    definirProximoNumero: (n) => invoke('recibos.definirProximoNumero', n),
    list: () => invoke('recibos.list'),
    get: (id) => invoke('recibos.get', id),
    create: (dto) => invoke('recibos.create', dto),
    update: (id, p) => invoke('recibos.update', id, p),
    confirmar: (id) => invoke('recibos.confirmar', id),
    cancelar: (id) => invoke('recibos.cancelar', id),
    remove: (id, estornar) => invoke('recibos.remove', id, estornar)
  },
  versoes: {
    html: (id) => invoke('versoes.html', id),
    nomear: (id, d) => invoke('versoes.nomear', id, d),
    list: (t, id) => invoke('versoes.list', t, id),
    restaurar: (id, c) => invoke('versoes.restaurar', id, c),
    exportar: (id, f) => invoke('versoes.exportar', id, f)
  },
  nuvem: {
    verificarConexao: (origem) => invoke('nuvem.verificarConexao', origem),
    copiarInstalacao: () => invoke('nuvem.copiarInstalacao'),
    config: () => invoke('nuvem.config'),
    status: () => invoke('nuvem.status'),
    conectar: (c, s, m) => invoke('nuvem.conectar', c, s, m),
    sincronizar: () => invoke('nuvem.sincronizar'),
    restaurarBase: () => invoke('nuvem.restaurarBase'),
    tentarNovamente: (id) => invoke('nuvem.tentarNovamente', id),
    finalizarAtualizacao: (revisao) => invoke('nuvem.finalizarAtualizacao', revisao),
    dispositivos: () => invoke('nuvem.dispositivos'),
    transferir: (t, id, d) => invoke('nuvem.transferir', t, id, d),
    sair: () => invoke('nuvem.sair'),
    aceitarRemoto: (id) => invoke('nuvem.aceitarRemoto', id)
  },
  aplicativo: {
    versao: () => invoke('aplicativo.versao'),
    alteracoesPendentes: (ativo) => invoke('aplicativo.alteracoesPendentes', ativo),
    definirTema: (modo) => invoke('aplicativo.definirTema', modo),
    exportarDiagnostico: () => invoke('aplicativo.exportarDiagnostico')
  },
  empresa: {
    get: () => invoke('empresa.get'),
    save: (patch) => invoke('empresa.save', patch)
  },
  parametros: {
    get: () => invoke('parametros.get'),
    save: (patch) => invoke('parametros.save', patch)
  },
  clientes: crud('clientes'),
  servicos: crud('servicos'),
  observacoes: crud('observacoes'),
  pagamentos: crud('pagamentos'),
  orcamentos: {
    list: () => invoke('orcamentos.list'),
    get: (id) => invoke('orcamentos.get', id),
    proximoNumero: () => invoke('orcamentos.proximoNumero'),
    create: (dto) => invoke('orcamentos.create', dto),
    update: (id, patch) => invoke('orcamentos.update', id, patch),
    remove: (id) => invoke('orcamentos.remove', id),
    duplicate: (id) => invoke('orcamentos.duplicate', id),
    numeracao: () => invoke('orcamentos.numeracao'),
    definirProximoNumero: (n) => invoke('orcamentos.definirProximoNumero', n),
    alterarNumero: (id, n) => invoke('orcamentos.alterarNumero', id, n)
  },
  relatorios: {
    list: () => invoke('relatorios.list'),
    get: (id) => invoke('relatorios.get', id),
    proximoNumero: () => invoke('relatorios.proximoNumero'),
    create: (dto) => invoke('relatorios.create', dto),
    update: (id, patch) => invoke('relatorios.update', id, patch),
    remove: (id) => invoke('relatorios.remove', id),
    numeracao: () => invoke('relatorios.numeracao'),
    definirProximoNumero: (n) => invoke('relatorios.definirProximoNumero', n),
    alterarNumero: (id, n) => invoke('relatorios.alterarNumero', id, n),
    criarDeOrcamento: (id) => invoke('relatorios.criarDeOrcamento', id)
  },
  anexos: {
    imagem: (id) => invoke('anexos.imagem', id)
  },
  anexosRelatorio: {
    imagem: (id) => invoke('anexosRelatorio.imagem', id)
  },
  ia: {
    revisarTexto: (entrada) => invoke('ia.revisarTexto', entrada),
    cancelarRevisao: (id) => invoke('ia.cancelarRevisao', id),
    get: () => invoke('ia.get'),
    save: (patch) => invoke('ia.save', patch),
    status: () => invoke('ia.status'),
    sugerirObservacao: (entrada) => invoke('ia.sugerirObservacao', entrada)
  },
  logo: {
    selecionar: () => invoke('logo.selecionar')
  },
  documentos: {
    gerarReciboPdf: (id) => invoke('documentos.gerarReciboPdf', id),
    gerarReciboDocx: (id) => invoke('documentos.gerarReciboDocx', id),
    gerarPdf: (id) => invoke('documentos.gerarPdf', id),
    gerarDocx: (id) => invoke('documentos.gerarDocx', id),
    gerarRelatorioPdf: (id) => invoke('documentos.gerarRelatorioPdf', id),
    gerarRelatorioDocx: (id) => invoke('documentos.gerarRelatorioDocx', id)
  },
  dados: {
    exportar: () => invoke('dados.exportar'),
    importar: (modo) => invoke('dados.importar', modo)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error API de compatibilidade exposta no window
  window.api = api
}
