import { solicitarRecuperacaoNuvem } from './tempo-real'
import { numeroHistoricoReconhecido } from './numeros'
import {
  guardarRascunhoCadastro,
  listarRascunhosCadastro,
  descartarRascunhoCadastro,
  type TipoRascunhoCadastro
} from './rascunhos-cadastros'
import { exigeNumeracaoAtualizada } from './bloqueio-numeracao'
import { urlDoAplicativo } from './origem-janela'
import { contaApi } from './contas/servico'
import { exigirAcesso, iniciarOperacao } from './contas/acesso'
import { mensagemErro } from '../shared/erros'
import { criarPayloadCadastroExcluido, type TabelaCadastro } from '@shared/cadastros-sincronizacao'
import { recibosRepo } from './recibos'
import { revisarRecebimentos, conciliarRecebimentos } from './conciliacao-financeira'
import {
  listarRascunhos,
  obterRascunho,
  criarRascunho,
  salvarRascunho,
  compararRascunho,
  aplicarRascunho,
  copiarRascunho,
  descartarRascunho
} from './rascunhos'
import {
  membrosEmpresa,
  vincularMembro,
  ativarMembro,
  controlarEdicao,
  estadoControleEdicao,
  documentosAcompanhados,
  autorizarGravacao,
  acompanharEdicao,
  autorizarEmissao,
  numeracaoCompartilhada,
  definirNumeracaoCompartilhada
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
  finalizarAtualizacaoNumeracao,
  statusNuvem,
  conectarNuvem,
  sincronizarNuvem,
  restaurarBaseDaNuvem,
  repetirOperacaoNuvem,
  dispositivosNuvem,
  transferirDocumento,
  sairNuvem,
  aplicarConflito,
  capturarCadastros,
  protocoloNuvem
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

const handlers: Record<string, (...args: unknown[]) => unknown> = {
  'rascunhosCadastros.guardar': (tipo, id, dados) =>
    guardarRascunhoCadastro(
      tipo as TipoRascunhoCadastro,
      String(id),
      dados as Record<string, unknown>
    ),
  'rascunhosCadastros.listar': (tipo) => listarRascunhosCadastro(tipo as TipoRascunhoCadastro),
  'rascunhosCadastros.descartar': (tipo, id) =>
    descartarRascunhoCadastro(tipo as TipoRascunhoCadastro, String(id)),
  'rascunhos.list': (tipo, id) => listarRascunhos(tipo as never, id as string | undefined),
  'rascunhos.get': (id) => obterRascunho(String(id)),
  'rascunhos.create': (tipo, id, documento) =>
    criarRascunho(tipo as never, String(id), documento as never),
  'rascunhos.save': (id, documento) => salvarRascunho(String(id), documento as never),
  'rascunhos.comparar': (id, escolhas) => compararRascunho(String(id), escolhas as never),
  'rascunhos.aplicar': (id, revisao, escolhas) =>
    aplicarRascunho(String(id), Number(revisao), escolhas as never),
  'rascunhos.copiar': (id) => copiarRascunho(String(id)),
  'rascunhos.remove': (id) => descartarRascunho(String(id)),
  'colaboracao.membros': () => membrosEmpresa(),
  'colaboracao.revisarRecebimentos': (tipo, id) => revisarRecebimentos(tipo as never, String(id)),
  'colaboracao.conciliarRecebimentos': (revisao, acao) =>
    conciliarRecebimentos(revisao as never, acao as never),
  'colaboracao.acompanhar': (tipo, id, ativo) =>
    acompanharEdicao(tipo as never, String(id), ativo === true),
  'colaboracao.acompanhados': () => documentosAcompanhados(true),
  'colaboracao.vincularMembro': (email, nome) => vincularMembro(String(email), String(nome)),
  'colaboracao.ativarMembro': (usuario, ativo) => ativarMembro(String(usuario), ativo === true),
  'colaboracao.estadoEdicao': (tipo, id, acao, destino) =>
    estadoControleEdicao(
      tipo as never,
      String(id),
      acao ? String(acao) : 'obter',
      destino ? String(destino) : undefined
    ),
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
  'recibos.alterarNumero': (id, n) => recibosRepo.alterarNumero(String(id), Number(n)),
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
  'nuvem.verificarConexao': (origem) =>
    solicitarRecuperacaoNuvem(
      ['online', 'offline'].includes(String(origem)) ? String(origem) : 'manual'
    ),
  'nuvem.status': () => statusNuvem(),
  'nuvem.conectar': (c, s, m) => conectarNuvem(c as never, s as string, m as never),
  'nuvem.sincronizar': () => sincronizarNuvem(),
  'nuvem.restaurarBase': () => restaurarBaseDaNuvem(),
  'nuvem.tentarNovamente': (id) => repetirOperacaoNuvem(String(id)),
  'nuvem.finalizarAtualizacao': (revisao) => finalizarAtualizacaoNumeracao(String(revisao)),
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
  for (const [acao, fn] of Object.entries(contaApi)) {
    ipcMain.handle(`conta.${acao}`, async (_evento, ...args) => {
      try {
        if (
          !['status', 'avisosEmail', 'continuarAposIndisponibilidade'].includes(acao) &&
          (await contaApi.status()).fase === 'empresaIndisponivel'
        )
          throw new Error('Aguarde o encerramento do acesso a esta empresa.')
        return await (fn as (...valores: unknown[]) => Promise<unknown>)(...args)
      } catch (erro) {
        throw new Error(mensagemErro(erro))
      }
    })
  }
  for (const [canal, fn] of Object.entries(handlers)) {
    ipcMain.handle(canal, async (evento, ...args) => {
      let finalizar: (() => void) | undefined
      const inicio = performance.now()
      try {
        if (!urlDoAplicativo(evento.senderFrame?.url ?? '', process.env['ELECTRON_RENDERER_URL']))
          throw new Error('Origem não autorizada para esta operação.')
        exigirAcesso(canal, args)
        if (canal === 'nuvem.sair') return await contaApi.sair()
        finalizar = iniciarOperacao()
        const dominio = canal.split('.')[0]
        // As condições do canal vêm primeiro: statusNuvem() faz dezenas de consultas
        // e só importa para os canais que gravam.
        if (
          (exigeNumeracaoAtualizada(canal) ||
            /^(clientes|servicos|empresa|parametros|observacoes|pagamentos)\.(create|update|save|remove)$/.test(
              canal
            ) ||
            canal.startsWith('documentos.gerar') ||
            canal === 'rascunhos.aplicar' ||
            canal === 'cadastros.reordenar') &&
          statusNuvem().atualizacaoBasePendente
        )
          throw new Error(
            'A base da empresa foi reorganizada ou está em manutenção. Confira Nuvem / Sincronização antes de gravar. Suas alterações locais foram preservadas.'
          )
        if (
          exigeNumeracaoAtualizada(canal) &&
          (statusNuvem().atualizandoNumeracao || statusNuvem().atualizacaoPendente)
        )
          throw new Error(
            'Aguarde a atualização da numeração da base antes de salvar. Suas alterações no formulário continuam preservadas.'
          )
        if (canal.startsWith('documentos.gerar')) {
          const t = canal.includes('Recibo')
            ? 'recibo'
            : canal.includes('Relatorio')
              ? 'relatorio'
              : 'orcamento'
          await autorizarEmissao(t, String(args[0]))
        }
        if (canal === 'versoes.exportar') {
          const v = obterVersao(String(args[0]))
          const atual = (
            v.tipo === 'orcamento'
              ? orcamentosRepo
              : v.tipo === 'relatorio'
                ? relatoriosRepo
                : recibosRepo
          ).get(v.documentoId)
          if (
            atual &&
            atual.numero !== v.documento.numero &&
            !numeroHistoricoReconhecido(v.tipo, v.documentoId, v.documento.numero, atual.numero)
          )
            throw new Error(
              'Esta versão tem um número anterior à correção do rascunho. Crie um novo documento a partir dela para emitir.'
            )
          if (atual && atual.numero === v.documento.numero)
            await autorizarEmissao(v.tipo, v.documentoId)
        }
        const tipo = (
          { orcamentos: 'orcamento', relatorios: 'relatorio', recibos: 'recibo' } as const
        )[dominio as 'orcamentos' | 'relatorios' | 'recibos']
        if (tipo && canal.endsWith('.numeracao'))
          return await numeracaoCompartilhada(
            tipo,
            (await fn(...args)) as import('@shared/api').InfoNumeracao
          )
        if (tipo && canal.endsWith('.definirProximoNumero') && protocoloNuvem() >= 2)
          return await definirNumeracaoCompartilhada(tipo, Number(args[0]))
        if (tipo && /\.(update|remove|alterarNumero|confirmar|cancelar)$/.test(canal)) {
          await autorizarGravacao(tipo, String(args[0]))
          if (tipo === 'recibo') {
            const r = recibosRepo.get(String(args[0]))
            if (r?.origemTipo === 'relatorio' && r.origemId)
              await autorizarGravacao('relatorio', r.origemId)
          }
        }
        exigirAcesso(canal, args)
        if (/\.(create|update|save|remove)$/.test(canal))
          return await tx(() => {
            const resultado = fn(...args)
            const dominios: Partial<Record<string, TabelaCadastro>> = {
              clientes: 'clientes',
              servicos: 'servicos',
              observacoes: 'observacoes_padrao',
              pagamentos: 'pagamentos_padrao'
            }
            const tabela = dominios[canal.split('.')[0]]
            if (tabela && canal.endsWith('.remove'))
              enfileirar(
                `${tabela}:${String(args[0])}`,
                criarPayloadCadastroExcluido(tabela, String(args[0]))
              )
            capturarCadastros()
            return resultado
          })
        return await fn(...args)
      } catch (erro) {
        // Não serializar argumentos, sessão ou SQL para o renderer.
        // A causa original permanece no processo principal para diagnóstico.
        throw new Error(mensagemErro(erro), { cause: erro })
      } finally {
        finalizar?.()
        const ms = performance.now() - inicio
        if (ms > 500) console.warn(`[desempenho] ${canal} levou ${Math.round(ms)} ms`)
      }
    })
  }
}
