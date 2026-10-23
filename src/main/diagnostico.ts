import { randomBytes } from 'crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  statfsSync
} from 'fs'
import { release } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { diagnosticoErro } from '../shared/erros'

const LIMITE_ARQUIVO = 1_000_000
const LINHAS_NO_RELATORIO = 200

export function pastaLogs(): string {
  return join(app.getPath('userData'), 'logs')
}

/** Causas encadeadas do erro (a mais externa primeiro), já sem credenciais. */
function cadeiaDeCausas(erro: unknown): string[] {
  const textos: string[] = []
  let atual: unknown = erro
  for (let i = 0; i < 5 && atual && typeof atual === 'object'; i++) {
    const { causa, codigo } = diagnosticoErro(atual)
    if (causa || codigo) textos.push(codigo ? `${codigo}: ${causa}` : causa)
    atual = (atual as { cause?: unknown }).cause
  }
  return textos
}

function girarSeGrande(arquivo: string): void {
  try {
    if (existsSync(arquivo) && statSync(arquivo).size > LIMITE_ARQUIVO)
      renameSync(arquivo, `${arquivo}.1`)
  } catch {
    // Sem rotação o arquivo só cresce; não pode impedir o registro.
  }
}

/**
 * Registra a causa real de uma falha em `userData/logs/app.jsonl` e devolve um código curto
 * para a mensagem da tela. Nunca lança: o diagnóstico não substitui o erro original.
 */
export function registrarDiagnostico(
  etapa: string,
  erro: unknown,
  extra: Record<string, unknown> = {}
): string {
  const id = randomBytes(3).toString('hex').toUpperCase()
  try {
    const pasta = pastaLogs()
    mkdirSync(pasta, { recursive: true })
    const arquivo = join(pasta, 'app.jsonl')
    girarSeGrande(arquivo)
    appendFileSync(
      arquivo,
      `${JSON.stringify({
        em: new Date().toISOString(),
        id,
        etapa,
        versao: app.getVersion?.() ?? '',
        ...diagnosticoErro(erro),
        cadeia: cadeiaDeCausas(erro),
        ...extra
      })}\n`,
      'utf8'
    )
  } catch {
    // Sem permissão de escrita não há onde registrar; o erro original segue adiante.
  }
  return id
}

function listarPerfis(raiz: string): unknown[] {
  const pasta = join(raiz, 'perfis')
  if (!existsSync(pasta)) return []
  return readdirSync(pasta).map((nome) => {
    const dados = join(pasta, nome, 'data')
    const banco = join(dados, 'banco.db')
    const trava = join(dados, 'banco.lock')
    const lerTrava = (): string | null => {
      try {
        return readFileSync(trava, 'utf8').trim()
      } catch {
        return null
      }
    }
    return {
      perfil: nome.slice(0, 8),
      banco: existsSync(banco) ? statSync(banco).size : null,
      alteradoEm: existsSync(banco) ? statSync(banco).mtime.toISOString() : null,
      trava: existsSync(trava) ? lerTrava() : null,
      backups: existsSync(join(dados, 'backups')) ? readdirSync(join(dados, 'backups')) : []
    }
  })
}

function resumoDeContas(raiz: string): unknown {
  const arquivo = join(raiz, 'contas.json')
  if (!existsSync(arquivo)) return { existe: false }
  try {
    const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as {
      atual?: string | null
      perfis?: Array<{ id?: string; lembrar?: boolean; central?: boolean }>
    }
    return {
      existe: true,
      legivel: true,
      atual: dados.atual?.slice(0, 8) ?? null,
      perfis: (dados.perfis ?? []).map((p) => ({
        perfil: p.id?.slice(0, 8),
        lembrar: p.lembrar,
        central: p.central
      }))
    }
  } catch (erro) {
    return {
      existe: true,
      legivel: false,
      tamanho: statSync(arquivo).size,
      erro: diagnosticoErro(erro).causa
    }
  }
}

function ultimasLinhas(arquivo: string): unknown[] {
  try {
    return readFileSync(arquivo, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-LINHAS_NO_RELATORIO)
      .map((linha) => {
        try {
          return JSON.parse(linha) as unknown
        } catch {
          return linha
        }
      })
  } catch {
    return []
  }
}

/** Relatório para o suporte: versões, estado das pastas e registros recentes, sem tokens nem e-mails. */
export function montarRelatorioDiagnostico(): string {
  const raiz = app.getPath('userData')
  let livre: number | null = null
  try {
    const s = statfsSync(raiz)
    livre = s.bavail * s.bsize
  } catch {
    livre = null
  }
  return JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      aplicativo: app.getVersion?.() ?? '',
      plataforma: process.platform,
      arquitetura: process.arch,
      sistema: release(),
      versoes: { electron: process.versions.electron, node: process.versions.node },
      pastaDeDados: raiz,
      espacoLivreBytes: livre,
      contas: resumoDeContas(raiz),
      perfis: listarPerfis(raiz),
      registros: ultimasLinhas(join(pastaLogs(), 'app.jsonl'))
    },
    null,
    2
  )
}
