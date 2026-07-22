// Baixa o runtime de IA que vai dentro do instalador: o `llama-server.exe`
// (build oficial do llama.cpp para Windows x64, CPU) e um modelo GGUF pequeno.
// Roda automaticamente antes do `npm run dist` (script `predist`).
//
// Tudo fica em `resources/ia/` (fora do git). Se os arquivos já existirem, nada
// é rebaixado — dá para rodar quantas vezes quiser.
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'resources', 'ia')
const temp = join(raiz, 'resources', '.tmp-ia')

const MODELO = {
  arquivo: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true',
  tamanhoMinimoMB: 800
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

async function baixar(url, caminho, rotulo) {
  process.stdout.write(`[ia] baixando ${rotulo}…\n`)
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok || !r.body) throw new Error(`Falha ao baixar ${rotulo}: HTTP ${r.status}`)
  const total = Number(r.headers.get('content-length') || 0)
  let recebido = 0
  let ultimoAviso = 0
  const origem = Readable.fromWeb(r.body)
  origem.on('data', (chunk) => {
    recebido += chunk.length
    // Um aviso a cada 25 MB — o modelo passa de 1 GB e o build não pode parecer travado.
    if (recebido - ultimoAviso > 25 * 1024 * 1024) {
      ultimoAviso = recebido
      const pct = total ? ` (${((recebido / total) * 100).toFixed(0)}%)` : ''
      process.stdout.write(`[ia]   ${mb(recebido)} MB${pct}\n`)
    }
  })
  const parcial = `${caminho}.parcial`
  await pipeline(origem, createWriteStream(parcial))
  renameSync(parcial, caminho)
  process.stdout.write(`[ia] ok: ${rotulo} (${mb(statSync(caminho).size)} MB)\n`)
}

/** Última release do llama.cpp com o binário de CPU para Windows x64. */
async function urlDoLlamaServer() {
  const r = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', {
    headers: { 'User-Agent': 'gerador-de-orcamento' }
  })
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} ao listar as releases do llama.cpp.`)
  const release = await r.json()
  const asset = release.assets.find((a) => /bin-win-cpu-x64\.zip$/i.test(a.name))
  if (!asset) throw new Error('Nenhum binário win-cpu-x64 encontrado na última release do llama.cpp.')
  return { url: asset.browser_download_url, nome: asset.name, versao: release.tag_name }
}

async function prepararServidor() {
  const exe = join(destino, 'llama-server.exe')
  if (existsSync(exe)) {
    process.stdout.write('[ia] llama-server.exe já presente — pulando.\n')
    return
  }
  const { url, nome, versao } = await urlDoLlamaServer()
  process.stdout.write(`[ia] release do llama.cpp: ${versao}\n`)

  rmSync(temp, { recursive: true, force: true })
  mkdirSync(temp, { recursive: true })
  const zip = join(temp, nome)
  await baixar(url, zip, nome)

  // `tar` do Windows 10+ (bsdtar) lê zip — evita depender de outra biblioteca.
  execFileSync('tar', ['-xf', zip, '-C', temp], { stdio: 'inherit' })

  // A release traz vários executáveis; só o servidor e as DLLs interessam.
  const copiar = (pasta) => {
    for (const item of readdirSync(pasta, { withFileTypes: true })) {
      const origem = join(pasta, item.name)
      if (item.isDirectory()) {
        copiar(origem)
        continue
      }
      const ehServidor = item.name.toLowerCase() === 'llama-server.exe'
      const ehDll = item.name.toLowerCase().endsWith('.dll')
      if (ehServidor || ehDll) renameSync(origem, join(destino, item.name))
    }
  }
  copiar(temp)
  rmSync(temp, { recursive: true, force: true })

  if (!existsSync(exe)) throw new Error('llama-server.exe não foi encontrado dentro do zip baixado.')
}

async function prepararModelo() {
  const caminho = join(destino, MODELO.arquivo)
  if (existsSync(caminho) && statSync(caminho).size > MODELO.tamanhoMinimoMB * 1024 * 1024) {
    process.stdout.write('[ia] modelo já presente — pulando.\n')
    return
  }
  await baixar(MODELO.url, caminho, MODELO.arquivo)
  if (statSync(caminho).size < MODELO.tamanhoMinimoMB * 1024 * 1024) {
    rmSync(caminho)
    throw new Error('O download do modelo veio incompleto. Rode o comando novamente.')
  }
}

/**
 * O `llama-server.exe` depende do runtime C++ da Microsoft. Quase toda máquina
 * Windows tem, mas não é garantido — copiar as DLLs para o lado do executável
 * (deployment app-local, permitido pela Microsoft) elimina esse "depende".
 */
function copiarRuntimeCpp() {
  if (process.platform !== 'win32') return
  const system32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const dlls = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']
  const faltando = []
  for (const dll of dlls) {
    const destinoDll = join(destino, dll)
    if (existsSync(destinoDll)) continue
    const origem = join(system32, dll)
    if (existsSync(origem)) copyFileSync(origem, destinoDll)
    else faltando.push(dll)
  }
  if (faltando.length) {
    process.stdout.write(
      `[ia] aviso: ${faltando.join(', ')} não encontradas em ${system32}. ` +
        'O app vai depender do Visual C++ Redistributable na máquina de destino.\n'
    )
  } else {
    process.stdout.write('[ia] runtime C++ copiado ao lado do llama-server.\n')
  }
}

async function main() {
  mkdirSync(destino, { recursive: true })
  await prepararServidor()
  copiarRuntimeCpp()
  await prepararModelo()
  process.stdout.write(`[ia] pronto em ${destino}\n`)
}

main().catch((e) => {
  process.stderr.write(`\n[ia] ERRO: ${e.message}\n`)
  process.exit(1)
})
