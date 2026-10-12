import { recibosRepo } from './recibos'
import {
  membrosEmpresa,
  vincularMembro,
  ativarMembro,
  controlarEdicao,
  autorizarGravacao
} from './colaboracao'
import { lerPreferencias, salvarPreferencias, reordenarCadastro } from './preferencias'
import { copiarInstalacaoNuvem } from './nuvem-configuracao'
import {
  listarVersoes,
  enfileirar,
  obterVersao,
  exigirResponsavel,
  pacoteDocumento
} from './versoes'
import { restaurarVersao } from './historico-documentos'
import { exportarVersao, htmlVersao, gerarReciboPdf, gerarReciboDocx } from './documents'
import { run, tx } from './db/sqlite'
import {
  configuracaoNuvem,
  statusNuvem,
  conectarNuvem,
  sincronizarNuvem,
  dispositivosNuvem,
  transferirDocumento,
  sairNuvem,
  aplicarConflito,
  capturarCadastros
} from './nuvem'
import { app, ipcMain, dialog, nativeImage } from 'electron'
import { readFileSync } from 'fs'
import {
  empresaRepo,
  parametrosRepo,
  clientesRepo,
  servicosRepo,
  observacoesRepo,
  pagamentosRepo,
  orcamentosRepo,
  relatoriosRepo,
  anexosRepo,
  anexosRelatorioRepo,
  configIARepo
} from './repositories'
import { gerarPdf, gerarDocx, gerarRelatorioPdf, gerarRelatorioDocx } from './documents'
import { statusIA, sugerirObservacao, revisarTexto, cancelarRevisao } from './ia'
import { exportarDados, importarDados } from './dados'

let alteracoesPendentes = false

export function haAlteracoesPendentes(): boolean {
  return alteracoesPendentes
}

export function liberarAlteracoesPendentes(): void {
  alteracoesPendentes = false
}

async function selecionarLogo(): Promise<string | null> {
  const r = await dialog.showOpenDialog({
    title: 'Selecionar logo',
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (r.canceled || !r.filePaths[0]) return null
  const caminho = r.filePaths[0]
  let imagem = nativeImage.createFromBuffer(readFileSync(caminho))
  if (imagem.isEmpty()) throw new Error('Não foi possível abrir esta imagem.')
  let limite = 1000
  while (true) {
    const { width, height } = imagem.getSize()
    if (Math.max(width, height) > limite)
      imagem = imagem.resize(width >= height ? { width: limite } : { height: limite })
    const png = imagem.toPNG()
    if (png.length <= 150 * 1024) return `data:image/png;base64,${png.toString('base64')}`
    limite = Math.floor(Math.min(limite, Math.max(width, height)) * 0.8)
    if (limite < 64)
      throw new Error('Esta logo não atende ao limite de 150 KiB. Use uma imagem mais simples.')
  }
}

// Mapa canal -> função. Registrado em loop via ipcMain.handle.
// A geração de documentos (documentos.*) é registrada na Fase 5.
const handlers: Record<string, (...args: unknown[]) => unknown> = {
  'colaboracao.membros': () => membrosEmpresa(),
  'colaboracao.vincularMembro': (email, nome) => vincularMembro(String(email), String(nome)),
  'colaboracao.ativarMembro': (usuario, ativo) => ativarMembro(String(usuario), ativo === true),
  'colaboracao.edicao': (tipo, id, acao, destino) =>
    controlarEdicao(
      tipo as never,
      String(id),
      acao ? String(acao) : 'obter',
      destino ? String(destino) : undefined
    ),
  'preferencias.historico': (tipo) => lerPreferencias(String(tipo)),
  'preferencias.salvarHistorico': (tipo, dados) => salvarPreferencias(String(tipo), dados),
  'cadastros.reordenar': (tipo, ids) => reordenarCadastro(String(tipo), ids as string[]),
  'versoes.html': (id) => htmlVersao(id as string),
  'versoes.nomear': (id, d) =>
    tx(() => {
      const v = obterVersao(String(id))
      exigirResponsavel(v.tipo, v.documentoId)
      run('UPDATE versoes SET descricao=? WHERE id=?', [String(d).slice(0, 160), id])
      enfileirar(`${v.tipo}:${v.documentoId}`, pacoteDocumento(v.tipo, v.documentoId))
    }),
  'recibos.list': () => recibosRepo.list(),
  'recibos.numeracao': () => recibosRepo.numeracao(),
  'recibos.definirProximoNumero': (n) => recibosRepo.definirProximoNumero(n as number),
  'recibos.get': (id) => recibosRepo.get(id as string),
  'recibos.create': (dto) => recibosRepo.create(dto as never),
  'recibos.update': (id, p) => recibosRepo.update(id as string, p as never),
  'recibos.confirmar': (id) => recibosRepo.confirmar(id as string),
  'recibos.cancelar': (id) => recibosRepo.cancelar(id as string),
  'recibos.remove': (id, estornar) => recibosRepo.remove(id as string, estornar === true),
  'versoes.list': (t, id) => listarVersoes(t as never, id as string),
  'versoes.restaurar': (id, c) => restaurarVersao(id as string, c as boolean),
  'versoes.exportar': (id, f) => exportarVersao(id as string, f as never),
  'nuvem.config': () => configuracaoNuvem(),
  'nuvem.status': () => statusNuvem(),
  'nuvem.conectar': (c, s, m) => conectarNuvem(c as never, s as string, m as never),
  'nuvem.sincronizar': () => sincronizarNuvem(),
  'nuvem.copiarInstalacao': () => copiarInstalacaoNuvem(),
  'nuvem.dispositivos': () => dispositivosNuvem(),
  'nuvem.transferir': (t, id, d) => transferirDocumento(t as never, id as string, d as string),
  'nuvem.sair': () => sairNuvem(),
  'nuvem.aceitarRemoto': (id) => aplicarConflito(id as string),
  'documentos.gerarReciboPdf': (id) => gerarReciboPdf(id as string),
  'documentos.gerarReciboDocx': (id) => gerarReciboDocx(id as string),
  'aplicativo.versao': () => app.getVersion(),
  'aplicativo.alteracoesPendentes': (ativo) => {
    alteracoesPendentes = Boolean(ativo)
  },
  'empresa.get': () => empresaRepo.get(),
  'empresa.save': (patch) => empresaRepo.save(patch as never),

  'parametros.get': () => parametrosRepo.get(),
  'parametros.save': (patch) => parametrosRepo.save(patch as never),

  'clientes.list': () => clientesRepo.list(),
  'clientes.create': (dto) => clientesRepo.create(dto as never),
  'clientes.update': (id, patch) => clientesRepo.update(id as string, patch as never),
  'clientes.remove': (id) => clientesRepo.remove(id as string),

  'servicos.list': () => servicosRepo.list(),
  'servicos.create': (dto) => servicosRepo.create(dto as never),
  'servicos.update': (id, patch) => servicosRepo.update(id as string, patch as never),
  'servicos.remove': (id) => servicosRepo.remove(id as string),

  'observacoes.list': () => observacoesRepo.list(),
  'observacoes.create': (dto) => observacoesRepo.create(dto as never),
  'observacoes.update': (id, patch) => observacoesRepo.update(id as string, patch as never),
  'observacoes.remove': (id) => observacoesRepo.remove(id as string),

  'pagamentos.list': () => pagamentosRepo.list(),
  'pagamentos.create': (dto) => pagamentosRepo.create(dto as never),
  'pagamentos.update': (id, patch) => pagamentosRepo.update(id as string, patch as never),
  'pagamentos.remove': (id) => pagamentosRepo.remove(id as string),

  'orcamentos.list': () => orcamentosRepo.list(),
  'orcamentos.get': (id) => orcamentosRepo.get(id as string),
  'orcamentos.proximoNumero': () => orcamentosRepo.proximoNumero(),
  'orcamentos.create': (dto) => orcamentosRepo.create(dto as never),
  'orcamentos.update': (id, patch) => orcamentosRepo.update(id as string, patch as never),
  'orcamentos.remove': (id) => orcamentosRepo.remove(id as string),
  'orcamentos.duplicate': (id) => orcamentosRepo.duplicate(id as string),
  'orcamentos.numeracao': () => orcamentosRepo.numeracao(),
  'orcamentos.definirProximoNumero': (n) => orcamentosRepo.definirProximoNumero(n as number),
  'orcamentos.alterarNumero': (id, n) => orcamentosRepo.alterarNumero(id as string, n as number),

  'relatorios.list': () => relatoriosRepo.list(),
  'relatorios.get': (id) => relatoriosRepo.get(id as string),
  'relatorios.proximoNumero': () => relatoriosRepo.proximoNumero(),
  'relatorios.create': (dto) => relatoriosRepo.create(dto as never),
  'relatorios.update': (id, patch) => relatoriosRepo.update(id as string, patch as never),
  'relatorios.remove': (id) => relatoriosRepo.remove(id as string),
  'relatorios.numeracao': () => relatoriosRepo.numeracao(),
  'relatorios.definirProximoNumero': (n) => relatoriosRepo.definirProximoNumero(n as number),
  'relatorios.alterarNumero': (id, n) => relatoriosRepo.alterarNumero(id as string, n as number),
  'relatorios.criarDeOrcamento': (id) => relatoriosRepo.criarDeOrcamento(id as string),

  'anexos.imagem': (id) => anexosRepo.imagem(id as string),
  'anexosRelatorio.imagem': (id) => anexosRelatorioRepo.imagem(id as string),

  'ia.get': () => configIARepo.get(),
  'ia.revisarTexto': (entrada) => revisarTexto(entrada as never),
  'ia.cancelarRevisao': (id) => cancelarRevisao(String(id)),
  'ia.save': (patch) => configIARepo.save(patch as never),
  'ia.status': () => statusIA(),
  'ia.sugerirObservacao': (orc) => sugerirObservacao(orc as never),

  'logo.selecionar': () => selecionarLogo(),

  'documentos.gerarPdf': (id) => gerarPdf(id as string),
  'documentos.gerarDocx': (id) => gerarDocx(id as string),
  'documentos.gerarRelatorioPdf': (id) => gerarRelatorioPdf(id as string),
  'documentos.gerarRelatorioDocx': (id) => gerarRelatorioDocx(id as string),
  'dados.exportar': () => exportarDados(),
  'dados.importar': (modo) => importarDados(modo as 'restaurar' | 'mesclar')
}

export function registrarIpc(): void {
  for (const [canal, fn] of Object.entries(handlers)) {
    ipcMain.handle(canal, async (_evento, ...args) => {
      const dominio = canal.split('.')[0]
      const tipo = (
        { orcamentos: 'orcamento', relatorios: 'relatorio', recibos: 'recibo' } as const
      )[dominio as 'orcamentos' | 'relatorios' | 'recibos']
      if (tipo && /\.(update|remove|alterarNumero|confirmar|cancelar)$/.test(canal)) {
        await autorizarGravacao(tipo, String(args[0]))
        if (tipo === 'recibo') {
          const r = recibosRepo.get(String(args[0]))
          if (r?.origemTipo === 'relatorio' && r.origemId)
            await autorizarGravacao('relatorio', r.origemId)
        }
      }
      if (/\.(create|update|save|remove)$/.test(canal))
        return tx(() => {
          const resultado = fn(...args)
          const dominios: Record<string, string> = {
            clientes: 'clientes',
            servicos: 'servicos',
            observacoes: 'observacoes_padrao',
            pagamentos: 'pagamentos_padrao'
          }
          const tabela = dominios[canal.split('.')[0]]
          if (tabela && canal.endsWith('.remove'))
            enfileirar(`${tabela}:${String(args[0])}`, { tabela, id: args[0], row: null })
          capturarCadastros()
          return resultado
        })
      return await fn(...args)
    })
  }
}
