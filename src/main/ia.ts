// Sugestão de anotação interna por IA rodando 100% local.
//
// Modo `embutida`: usa o `llama-server.exe` + modelo GGUF que o instalador traz
// em `resources/ia` (baixados por `scripts/preparar-ia.mjs`). O servidor sobe sob
// demanda, na primeira sugestão, e é encerrado depois de alguns minutos ocioso.
// Modo `ollama`: fala com um Ollama já instalado na máquina.
// Fora do pacote (npm run dev sem ter rodado `npm run ia`) cai no Ollama sozinho.
import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { createServer } from 'net'
import { cpus } from 'os'
import { configIARepo } from './repositories'
import { validarUrlOllamaLocal } from '@shared/validacao'
import { formatDataCurta, formatMoeda } from '@shared/format'
import type { Orcamento, Relatorio, StatusIA, ConfigIA } from '@shared/types'
import type { SugestaoObservacaoEntrada } from '@shared/api'

const OCIOSO_MS = 5 * 60_000
const TIMEOUT_BOOT_MS = 90_000

let processo: ChildProcess | null = null
let portaAtual = 0
let subindo: Promise<number> | null = null
let timerOcioso: NodeJS.Timeout | null = null
let diagnosticoBoot = ''
let capturandoBoot = false

/** O runtime embutido é hermético: configurações LLAMA_* do usuário pertencem a outros servidores. */
export function ambienteServidorEmbutido(
  origem: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(origem).filter(([chave]) => !chave.toUpperCase().startsWith('LLAMA_'))
  )
}

function registrarDiagnostico(dado: unknown): void {
  if (!capturandoBoot) return
  diagnosticoBoot = (diagnosticoBoot + String(dado)).slice(-32_000)
}

function detalheDiagnostico(): string {
  const linhas = diagnosticoBoot
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const detalhe = linhas.slice(-4).join(' | ').slice(0, 700)
  return detalhe ? ` Detalhe: ${detalhe}` : ''
}

/** Pasta dos recursos de IA (fora do asar quando empacotado). */
function pastaIA(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'ia')
    : join(app.getAppPath(), 'resources', 'ia')
}

function arquivosIA(): { exe: string; modelo: string } | null {
  const pasta = pastaIA()
  const exe = join(pasta, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  if (!existsSync(exe) || !existsSync(pasta)) return null
  const gguf = readdirSync(pasta).find((f) => f.toLowerCase().endsWith('.gguf'))
  if (!gguf) return null
  return { exe, modelo: join(pasta, gguf) }
}

function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const porta = (s.address() as { port: number }).port
      s.close(() => resolve(porta))
    })
  })
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function reagendarDesligamento(): void {
  if (timerOcioso) clearTimeout(timerOcioso)
  timerOcioso = setTimeout(encerrarIA, OCIOSO_MS)
}

/** Sobe o llama-server (se ainda não estiver de pé) e devolve a porta. */
async function garantirServidor(): Promise<number> {
  if (processo && !processo.killed && portaAtual) {
    reagendarDesligamento()
    return portaAtual
  }
  if (subindo) return subindo

  subindo = (async (): Promise<number> => {
    const arquivos = arquivosIA()
    if (!arquivos) throw new Error('Runtime de IA não encontrado em resources/ia.')

    const porta = await portaLivre()
    diagnosticoBoot = ''
    capturandoBoot = true
    processo = spawn(
      arquivos.exe,
      [
        '--model',
        arquivos.modelo,
        '--host',
        '127.0.0.1',
        '--port',
        String(porta),
        '--ctx-size',
        '4096',
        '--threads',
        String(Math.max(2, Math.min(8, cpus().length - 1))),
        '--no-webui'
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: ambienteServidorEmbutido()
      }
    )
    processo.stdout?.on('data', registrarDiagnostico)
    processo.stderr?.on('data', registrarDiagnostico)
    processo.on('error', (erro) => {
      registrarDiagnostico(erro.message)
      processo = null
      portaAtual = 0
    })
    processo.on('exit', (codigo, sinal) => {
      if (capturandoBoot)
        registrarDiagnostico(
          `Processo encerrado (código ${codigo ?? 'n/a'}, sinal ${sinal ?? 'n/a'}).`
        )
      processo = null
      portaAtual = 0
    })

    const limite = Date.now() + TIMEOUT_BOOT_MS
    while (Date.now() < limite) {
      if (!processo)
        throw new Error(`O servidor de IA encerrou durante a inicialização.${detalheDiagnostico()}`)
      try {
        const r = await fetch(`http://127.0.0.1:${porta}/health`)
        if (r.ok) {
          portaAtual = porta
          capturandoBoot = false
          reagendarDesligamento()
          return porta
        }
      } catch {
        /* ainda subindo */
      }
      await esperar(500)
    }
    encerrarIA()
    throw new Error(`O servidor de IA não respondeu a tempo.${detalheDiagnostico()}`)
  })()

  try {
    return await subindo
  } finally {
    subindo = null
  }
}

export function encerrarIA(): void {
  if (timerOcioso) {
    clearTimeout(timerOcioso)
    timerOcioso = null
  }
  if (processo) {
    processo.kill()
    processo = null
  }
  portaAtual = 0
  capturandoBoot = false
}

// ------------------------------------------------------------------ Chamadas

async function chamarEmbutida(prompt: string, sistema: string): Promise<string> {
  const porta = await garantirServidor()
  const r = await fetch(`http://127.0.0.1:${porta}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 200
    })
  })
  if (!r.ok) throw new Error(`Servidor de IA respondeu ${r.status}.`)
  const json = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content?.trim() ?? ''
}

async function chamarOllama(cfg: ConfigIA, prompt: string, sistema: string): Promise<string> {
  if (validarUrlOllamaLocal(cfg.urlOllama).length)
    throw new Error('A URL do Ollama precisa apontar para esta máquina.')
  const r = await fetch(`${cfg.urlOllama.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modeloOllama,
      stream: false,
      options: { temperature: 0.4 },
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: prompt }
      ]
    })
  })
  if (!r.ok) throw new Error(`Ollama respondeu ${r.status}.`)
  const json = (await r.json()) as { message?: { content?: string } }
  return json.message?.content?.trim() ?? ''
}

async function ollamaAtivo(cfg: ConfigIA): Promise<boolean> {
  if (validarUrlOllamaLocal(cfg.urlOllama).length) return false
  try {
    const r = await fetch(`${cfg.urlOllama.replace(/\/$/, '')}/api/tags`)
    return r.ok
  } catch {
    return false
  }
}

// -------------------------------------------------------------------- Prompt

const SISTEMA =
  'Você é um assistente de uma empresa brasileira de prestação de serviços. ' +
  'Escreva sempre em português do Brasil, de forma objetiva e profissional. ' +
  'Responda apenas com o texto pedido, sem introduções, listas ou aspas.'

/** Resumo textual do orçamento entregue ao modelo. */
export function resumirOrcamento(orc: Orcamento): string {
  const linhas: string[] = []
  linhas.push(`Número: ${orc.numero}`)
  if (orc.destinatario) linhas.push(`Cliente: ${orc.destinatario.replace(/,$/, '')}`)
  if (orc.titulo) linhas.push(`Título: ${orc.titulo}`)
  linhas.push(`Data: ${formatDataCurta(orc.data)}`)
  if (orc.itensServico.length) {
    linhas.push('Serviços:')
    orc.itensServico.forEach((i, idx) => {
      const qtd = i.quantidade > 1 ? ` — ${i.quantidade} ${i.unidade}` : ''
      linhas.push(`  ${idx + 1}. ${i.descricao}${qtd} — ${formatMoeda(i.valorTotal)}`)
    })
  }
  const total = orc.itensServico.reduce((s, i) => s + (i.valorTotal || 0), 0)
  linhas.push(`Valor total: ${formatMoeda(total || orc.valorTotal)}`)
  if (orc.prazoDias) linhas.push(`Prazo estimado: ${orc.prazoDias} dias`)
  if (orc.materiais.length) {
    linhas.push(
      `Materiais: ${orc.materiais.map((m) => `${m.quantidade} ${m.unidade} ${m.especificacao}`).join('; ')}`
    )
  }
  if (orc.pagamentos.length) {
    linhas.push(`Forma de pagamento: ${orc.pagamentos.map((p) => p.texto).join(' ')}`)
  }
  return linhas.join('\n')
}

export function resumirRelatorio(rel: Relatorio): string {
  const linhas: string[] = [`Número: ${rel.numero}`]
  if (rel.destinatario) linhas.push(`Cliente: ${rel.destinatario.replace(/,$/, '')}`)
  if (rel.titulo) linhas.push(`Título: ${rel.titulo}`)
  linhas.push(`Data: ${formatDataCurta(rel.data)}`)
  if (rel.itensServico.length) {
    linhas.push('Serviços prestados:')
    rel.itensServico.forEach((item, indice) => {
      const quantidade = item.quantidade > 1 ? ` — ${item.quantidade} ${item.unidade}` : ''
      linhas.push(
        `  ${indice + 1}. ${item.descricao}${quantidade} — ${formatMoeda(item.valorTotal)}`
      )
    })
  }
  if (rel.adiantamentos.length) {
    linhas.push(
      `Adiantamentos: ${rel.adiantamentos.map((item) => `${item.descricao || 'Sem descrição'} — ${formatMoeda(item.valor)}`).join('; ')}`
    )
  }
  if (rel.reembolsos.length) {
    linhas.push(
      `Reembolsos: ${rel.reembolsos.map((item) => `${item.descricao || 'Sem descrição'} — ${formatMoeda(item.valor)}`).join('; ')}`
    )
  }
  linhas.push(`Valor total dos serviços: ${formatMoeda(rel.totais.servicos)}`)
  linhas.push(
    `Valor a ${rel.totais.tipoSaldo === 'devolver' ? 'devolver' : 'receber'}: ${formatMoeda(rel.totais.valorFinal)}`
  )
  return linhas.join('\n')
}

function promptAnotacaoOrcamento(orc: Orcamento): string {
  return (
    'Escreva UMA única frase corrida, de no máximo 25 palavras, que identifique o ' +
    'orçamento abaixo numa lista: o serviço, a quantidade, o cliente e o valor total.\n' +
    'Proibido usar listas, marcadores, quebras de linha, rótulos de campo ou aspas.\n' +
    'Exemplo do formato esperado: "Poda de 3 árvores de grande porte no sítio do Sr. Antônio, ' +
    'R$ 1.800,00, prazo de 2 dias."\n\n' +
    'Orçamento:\n' +
    resumirOrcamento(orc)
  )
}

function promptAnotacaoRelatorio(rel: Relatorio): string {
  return (
    'Escreva UMA única frase corrida, de no máximo 30 palavras, que identifique o ' +
    'relatório abaixo numa lista: serviço concluído, cliente, valor dos serviços e saldo final. ' +
    'Mencione adiantamento ou reembolso quando houver.\n' +
    'Proibido usar listas, marcadores, quebras de linha, rótulos de campo ou aspas.\n\n' +
    'Relatório:\n' +
    resumirRelatorio(rel)
  )
}

export function promptAnotacao(entrada: SugestaoObservacaoEntrada): string {
  return entrada.tipo === 'relatorio'
    ? promptAnotacaoRelatorio(entrada.documento)
    : promptAnotacaoOrcamento(entrada.documento)
}

// ---------------------------------------------------------------- API pública

export async function statusIA(): Promise<StatusIA> {
  const cfg = configIARepo.get()
  if (cfg.modo === 'desligada') {
    return {
      modo: 'desligada',
      disponivel: false,
      detalhe: 'Sugestão por IA desativada nas Configurações.'
    }
  }
  if (cfg.modo === 'ollama') {
    const ok = await ollamaAtivo(cfg)
    return {
      modo: 'ollama',
      disponivel: ok,
      detalhe: ok
        ? `Ollama respondendo em ${cfg.urlOllama} (modelo ${cfg.modeloOllama}).`
        : `Não foi possível falar com o Ollama em ${cfg.urlOllama}.`
    }
  }
  const arquivos = arquivosIA()
  if (arquivos) {
    try {
      await garantirServidor()
      return {
        modo: 'embutida',
        disponivel: true,
        detalhe: `Modelo embutido iniciado com sucesso: ${arquivos.modelo.split(/[\\/]/).pop()}.`
      }
    } catch (e) {
      return {
        modo: 'embutida',
        disponivel: false,
        detalhe: String(e).replace(/^Error:\s*/, '')
      }
    }
  }
  const ok = await ollamaAtivo(cfg)
  return {
    modo: 'embutida',
    disponivel: ok,
    detalhe: ok
      ? 'Modelo embutido ausente (rode "npm run ia"); usando o Ollama encontrado na máquina.'
      : 'Modelo embutido ausente e nenhum Ollama respondendo — preencha a anotação manualmente.'
  }
}

export async function sugerirObservacao(entrada: SugestaoObservacaoEntrada): Promise<string> {
  const cfg = configIARepo.get()
  if (cfg.modo === 'desligada')
    throw new Error('A sugestão por IA está desativada nas Configurações.')

  const prompt = promptAnotacao(entrada)
  if (cfg.modo === 'ollama') return limpar(await chamarOllama(cfg, prompt, SISTEMA))

  if (arquivosIA()) return limpar(await chamarEmbutida(prompt, SISTEMA))

  // Sem os arquivos embutidos, tenta o Ollama antes de desistir.
  if (await ollamaAtivo(cfg)) return limpar(await chamarOllama(cfg, prompt, SISTEMA))
  throw new Error(
    'Nenhuma IA local disponível: o modelo embutido não está instalado e não há Ollama respondendo.'
  )
}

/**
 * Modelos pequenos costumam embrulhar a resposta ("Aqui está a frase:" + aspas).
 * Aqui sobra só o texto que interessa.
 */
function limpar(texto: string): string {
  let linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // Descarta linhas de introdução ("Aqui está…:", "Anotação:") antes do conteúdo.
  while (linhas.length > 1 && linhas[0].endsWith(':')) linhas = linhas.slice(1)
  // Se mesmo assim vier em tópicos, vira uma frase única separada por vírgulas.
  const emTopicos = linhas.length > 1 && linhas.every((l) => /^[-*•]/.test(l))
  if (emTopicos) {
    return linhas
      .map((l) => l.replace(/^[-*•]\s*/, ''))
      .join(', ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return linhas
    .join(' ')
    .replace(/^\s*(anota(ç|c)ão|observa(ç|c)ão|resumo)\s*:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
}
