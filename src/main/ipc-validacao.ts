// Forma dos argumentos de cada canal IPC, conferida no processo principal antes de chamar o
// tratador. O renderer é código que roda conteúdo editável pelo usuário; o main não pode supor que
// um `id` seja texto ou que um `patch` seja um objeto. A validação de negócio continua nos
// repositórios (`validacao.ts`): aqui só se barra o que nem tem a forma esperada.
import type { CanalDeTratador } from '@shared/canais'

export type Regra = (valor: unknown) => boolean

const TAMANHO_MAXIMO_TEXTO = 2_000_000

const id: Regra = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200
const texto: Regra = (v) => typeof v === 'string' && v.length <= TAMANHO_MAXIMO_TEXTO
// NaN e Infinity passam: os repositórios já recusam número inválido com a mensagem própria da tela.
const numero: Regra = (v) => typeof v === 'number'
const booleano: Regra = (v) => typeof v === 'boolean'
const objeto: Regra = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const um =
  (...valores: string[]): Regra =>
  (v) =>
    typeof v === 'string' && valores.includes(v)
const lista =
  (item: Regra, max = 10_000): Regra =>
  (v) =>
    Array.isArray(v) && v.length <= max && v.every(item)
const opcional =
  (regra: Regra): Regra =>
  (v) =>
    v === undefined || v === null || regra(v)

const tipoDocumento = um('orcamento', 'relatorio', 'recibo')
const tipoCadastro = um('cliente', 'servico', 'observacoes', 'pagamentos')
const escolhas = opcional(objeto)
const acaoEdicao = opcional(texto)
const nenhum: Regra[] = []
const porId: Regra[] = [id]
const crud: Record<'create' | 'update' | 'remove' | 'list', Regra[]> = {
  list: nenhum,
  create: [objeto],
  update: [id, objeto],
  remove: porId
}

export const REGRAS_DE_ARGUMENTOS: Record<CanalDeTratador, Regra[]> = {
  'rascunhosCadastros.guardar': [tipoCadastro, id, objeto],
  'rascunhosCadastros.listar': [tipoCadastro],
  'rascunhosCadastros.descartar': [tipoCadastro, id],
  'rascunhos.list': [opcional(tipoDocumento), opcional(id)],
  'rascunhos.get': porId,
  'rascunhos.create': [tipoDocumento, id, opcional(objeto)],
  'rascunhos.save': [id, objeto],
  'rascunhos.comparar': [id, escolhas],
  'rascunhos.aplicar': [id, numero, objeto],
  'rascunhos.copiar': porId,
  'rascunhos.remove': porId,
  'colaboracao.membros': nenhum,
  'colaboracao.revisarRecebimentos': [tipoDocumento, id],
  'colaboracao.conciliarRecebimentos': [objeto, um('reaplicar', 'arquivar')],
  'colaboracao.acompanhar': [tipoDocumento, id, booleano],
  'colaboracao.acompanhados': nenhum,
  'colaboracao.vincularMembro': [texto, texto],
  'colaboracao.ativarMembro': [id, booleano],
  'colaboracao.estadoEdicao': [tipoDocumento, id, acaoEdicao, opcional(id)],
  'colaboracao.edicao': [tipoDocumento, id, acaoEdicao, opcional(id)],
  'preferencias.historico': [tipoDocumento],
  'preferencias.salvarHistorico': [tipoDocumento, objeto],
  'cadastros.reordenar': [um('servicos', 'observacoes', 'pagamentos'), lista(id)],
  'versoes.html': porId,
  'versoes.nomear': [id, texto],
  'versoes.list': [tipoDocumento, id],
  'versoes.restaurar': [id, booleano],
  'versoes.exportar': [id, um('pdf', 'docx')],
  'recibos.list': nenhum,
  'recibos.numeracao': nenhum,
  'recibos.alterarNumero': [id, numero],
  'recibos.definirProximoNumero': [numero],
  'recibos.get': porId,
  'recibos.create': [objeto],
  'recibos.update': [id, objeto],
  'recibos.confirmar': porId,
  'recibos.cancelar': porId,
  'recibos.remove': [id, opcional(booleano)],
  'nuvem.config': nenhum,
  'nuvem.verificarConexao': [opcional(um('online', 'offline', 'manual'))],
  'nuvem.status': nenhum,
  'nuvem.conectar': [objeto, texto, um('publicar', 'baixar')],
  'nuvem.sincronizar': nenhum,
  'nuvem.restaurarBase': nenhum,
  'nuvem.tentarNovamente': porId,
  'nuvem.finalizarAtualizacao': porId,
  'nuvem.copiarInstalacao': nenhum,
  'nuvem.dispositivos': nenhum,
  'nuvem.transferir': [tipoDocumento, id, id],
  'nuvem.sair': nenhum,
  'nuvem.aceitarRemoto': porId,
  'documentos.gerarReciboPdf': porId,
  'documentos.gerarReciboDocx': porId,
  'documentos.gerarPdf': porId,
  'documentos.gerarDocx': porId,
  'documentos.gerarRelatorioPdf': porId,
  'documentos.gerarRelatorioDocx': porId,
  'aplicativo.versao': nenhum,
  'aplicativo.alteracoesPendentes': [booleano],
  'aplicativo.exportarDiagnostico': nenhum,
  'aplicativo.definirTema': [texto],
  'empresa.get': nenhum,
  'empresa.save': [objeto],
  'parametros.get': nenhum,
  'parametros.save': [objeto],
  'clientes.list': crud.list,
  'clientes.create': crud.create,
  'clientes.update': crud.update,
  'clientes.remove': crud.remove,
  'servicos.list': crud.list,
  'servicos.create': crud.create,
  'servicos.update': crud.update,
  'servicos.remove': crud.remove,
  'observacoes.list': crud.list,
  'observacoes.create': crud.create,
  'observacoes.update': crud.update,
  'observacoes.remove': crud.remove,
  'pagamentos.list': crud.list,
  'pagamentos.create': crud.create,
  'pagamentos.update': crud.update,
  'pagamentos.remove': crud.remove,
  'orcamentos.list': nenhum,
  'orcamentos.get': porId,
  'orcamentos.proximoNumero': nenhum,
  'orcamentos.create': [objeto],
  'orcamentos.update': [id, objeto],
  'orcamentos.remove': porId,
  'orcamentos.duplicate': porId,
  'orcamentos.numeracao': nenhum,
  'orcamentos.definirProximoNumero': [numero],
  'orcamentos.alterarNumero': [id, numero],
  'relatorios.list': nenhum,
  'relatorios.get': porId,
  'relatorios.proximoNumero': nenhum,
  'relatorios.create': [objeto],
  'relatorios.update': [id, objeto],
  'relatorios.remove': porId,
  'relatorios.numeracao': nenhum,
  'relatorios.definirProximoNumero': [numero],
  'relatorios.alterarNumero': [id, numero],
  'relatorios.criarDeOrcamento': porId,
  'anexos.imagem': porId,
  'anexosRelatorio.imagem': porId,
  'ia.get': nenhum,
  'ia.revisarTexto': [objeto],
  'ia.cancelarRevisao': porId,
  'ia.save': [objeto],
  'ia.status': nenhum,
  'ia.sugerirObservacao': [objeto],
  'logo.selecionar': nenhum,
  'dados.exportar': nenhum,
  'dados.importar': [um('restaurar', 'mesclar')]
}

/** Lança se os argumentos não têm a forma esperada pelo canal. */
export function validarArgumentos(canal: CanalDeTratador, args: unknown[]): void {
  const regras = REGRAS_DE_ARGUMENTOS[canal]
  const invalido = (): never => {
    throw new Error(
      'Os dados enviados para esta ação são inválidos. Atualize a tela e tente de novo.'
    )
  }
  if (args.length > regras.length && args.slice(regras.length).some((v) => v !== undefined))
    invalido()
  regras.forEach((regra, i) => {
    if (!regra(args[i])) invalido()
  })
}
