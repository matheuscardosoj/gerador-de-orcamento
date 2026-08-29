// Baixa o runtime de IA que vai dentro do instalador: o `llama-server.exe`
// (build oficial do llama.cpp para Windows x64, CPU) e um modelo GGUF pequeno.
// Roda automaticamente antes do `npm run dist` (script `predist`).
//
// Tudo fica em `resources/ia/` (fora do git). Se os arquivos já existirem, nada
// é rebaixado — dá para rodar quantas vezes quiser.
import {
  copyFileSync,
  createReadStream,
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
import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createHash } from 'crypto'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const destino = join(raiz, 'resources', 'ia')
const temp = join(raiz, 'resources', '.tmp-ia')

const MODELO = {
  arquivo: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true',
  tamanhoMinimoMB: 800,
  sha256: '6A1A2EB6D15622BF3C96857206351BA97E1AF16C30D7A74EE38970E434E9407E'
}

const LLAMA = {
  build: '10087',
  commit: '1f66c3ce1',
  nome: 'llama-b10087-bin-win-cpu-x64.zip',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b10087/llama-b10087-bin-win-cpu-x64.zip'
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

async function sha256(caminho) {
  const hash = createHash('sha256')
  for await (const trecho of createReadStream(caminho)) hash.update(trecho)
  return hash.digest('hex').toUpperCase()
}

function ambienteSemLlama() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([chave]) => !chave.toUpperCase().startsWith('LLAMA_'))
  )
}

function validarServidor(exe) {
  const processo = spawnSync(exe, ['--version'], {
    encoding: 'utf8',
    env: ambienteSemLlama(),
    windowsHide: true
  })
  if (processo.error) throw processo.error
  const versao = `${processo.stdout ?? ''}\n${processo.stderr ?? ''}`
  if (!versao.includes(LLAMA.build) || !versao.includes(LLAMA.commit)) {
    throw new Error(
      `llama-server divergente. Esperado build ${LLAMA.build} (${LLAMA.commit}); recebido: ${versao.trim()}`
    )
  }
  process.stdout.write(`[ia] runtime validado: build ${LLAMA.build} (${LLAMA.commit}).\n`)
}

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

async function prepararServidor() {
  const exe = join(destino, 'llama-server.exe')
  if (existsSync(exe)) {
    validarServidor(exe)
    return
  }
  process.stdout.write(`[ia] release fixa do llama.cpp: b${LLAMA.build} (${LLAMA.commit})\n`)

  rmSync(temp, { recursive: true, force: true })
  mkdirSync(temp, { recursive: true })
  const zip = join(temp, LLAMA.nome)
  await baixar(LLAMA.url, zip, LLAMA.nome)

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

  if (!existsSync(exe))
    throw new Error('llama-server.exe não foi encontrado dentro do zip baixado.')
  validarServidor(exe)
}

async function prepararModelo() {
  const caminho = join(destino, MODELO.arquivo)
  if (existsSync(caminho) && statSync(caminho).size > MODELO.tamanhoMinimoMB * 1024 * 1024) {
    const hash = await sha256(caminho)
    if (hash === MODELO.sha256) {
      process.stdout.write(`[ia] modelo validado por SHA-256: ${hash}\n`)
      return
    }
    process.stdout.write(`[ia] modelo divergente (${hash}); baixando novamente.\n`)
    rmSync(caminho, { force: true })
  }
  await baixar(MODELO.url, caminho, MODELO.arquivo)
  if (statSync(caminho).size < MODELO.tamanhoMinimoMB * 1024 * 1024) {
    rmSync(caminho)
    throw new Error('O download do modelo veio incompleto. Rode o comando novamente.')
  }
  const hash = await sha256(caminho)
  if (hash !== MODELO.sha256) {
    rmSync(caminho, { force: true })
    throw new Error(`SHA-256 do modelo inválido. Esperado ${MODELO.sha256}; recebido ${hash}.`)
  }
  process.stdout.write(`[ia] modelo validado por SHA-256: ${hash}\n`)
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
