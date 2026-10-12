// Dois perfis isolados, usando somente o cliente descartável do teste físico.
// Sessões seguem protegidas pelo Windows; nunca registra tokens ou corpos HTTP.
import { _electron as electron } from 'playwright'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const raiz = resolve('output/playwright', `latencia-real-${Date.now()}`)
const origem = process.argv[3] ?? join(process.env.APPDATA, 'gerador-de-orcamento')
const executablePath = process.argv[2] ? resolve(process.argv[2]) : undefined
const clienteTesteId = process.env.GERADOR_CLIENTE_TESTE_ID
assert.ok(clienteTesteId, 'Informe o identificador do cliente de teste confirmado pelo usuário.')
const apps = [],
  pages = [],
  medidas = []
let cliente, ultimoNome, falhaRestauracao
let clienteDeTesteRestaurado = false
async function aguardar(p, consulta, limite = 60000) {
  const inicio = Date.now()
  while (Date.now() - inicio < limite) {
    if (await p.evaluate(consulta)) return
    await p.waitForTimeout(100)
  }
  throw Error('A conexão de teste não ficou pronta.')
}
try {
  for (const nome of ['a', 'b']) {
    const perfil = join(raiz, nome)
    mkdirSync(join(perfil, 'data'), { recursive: true })
    copyFileSync(join(origem, 'data', 'banco.db'), join(perfil, 'data', 'banco.db'))
    copyFileSync(join(origem, 'Local State'), join(perfil, 'Local State'))
    const app = await electron.launch({
      executablePath,
      args: executablePath ? [] : ['.'],
      env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
    })
    apps.push(app)
    await app.evaluate(() => {
      const original = global.fetch
      global.__temposHttp = []
      global.fetch = async (...args) => {
        const inicio = Date.now(),
          rota = new URL(String(args[0])).pathname
        try {
          return await original(...args)
        } finally {
          global.__temposHttp.push({ rota, inicio, duracao: Date.now() - inicio })
        }
      }
    })
    const page = await app.firstWindow()
    pages.push(page)
    await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
    await page.getByRole('textbox', { name: 'Buscar clientes', exact: true }).fill('Teste')
    await aguardar(page, async () => {
      const s = await window.api.nuvem.status()
      return s.tempoReal === 'conectado' && s.pendentes === 0 && !s.erro
    })
  }
  cliente = await pages[0].evaluate(
    async (id) => (await window.api.clientes.list()).find((c) => c.id === id),
    clienteTesteId
  )
  assert.ok(cliente, 'Cliente de teste autorizado não encontrado.')
  ultimoNome = cliente.nome
  for (let i = 0; i < 8; i++) {
    const a = i % 2,
      b = 1 - a,
      nome = `Teste de sincronização — medição ${i + 1}`
    await pages[a]
      .getByRole('button', { name: `Editar cliente ${ultimoNome}`, exact: true })
      .click()
    const modal = pages[a].getByRole('dialog', { name: 'Editar cliente', exact: true })
    await modal
      .getByRole('textbox', { name: 'Nome / razão social (obrigatório)', exact: true })
      .fill(nome)
    const inicio = Date.now()
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click()
    await pages[b].getByText(nome, { exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    medidas.push({ direcao: a === 0 ? 'A → B' : 'B → A', milissegundos: Date.now() - inicio })
    ultimoNome = nome
  }
} finally {
  if (cliente && pages.length) {
    const atual = await pages[0]
      .evaluate(
        async (id) => (await window.api.clientes.list()).find((c) => c.id === id),
        cliente.id
      )
      .catch(() => null)
    try {
      if (
        atual?.nome === ultimoNome ||
        atual?.nome.startsWith('Teste de sincronização — medição ')
      ) {
        const s = await pages[0].evaluate(async ({ id, nome }) => {
          await window.api.clientes.update(id, { nome })
          return window.api.nuvem.sincronizar()
        }, cliente)
        assert.ok(
          !s.erro && !s.pendentes,
          'A restauração do cliente precisa ser confirmada pelo servidor.'
        )
      }
      for (const page of pages) {
        await page.evaluate(() => window.api.nuvem.sincronizar())
        const nome = await page.evaluate(
          async (id) => (await window.api.clientes.list()).find((c) => c.id === id)?.nome,
          cliente.id
        )
        assert.equal(nome, cliente.nome, 'O nome original deve estar restaurado nos dois perfis.')
      }
      clienteDeTesteRestaurado = true
    } catch (e) {
      falhaRestauracao = e
    }
  }
  for (let i = 0; i < apps.length; i++) {
    const tempos = await apps[i].evaluate(() => global.__temposHttp).catch(() => [])
    writeFileSync(join(raiz, `http-${i}.json`), JSON.stringify(tempos, null, 2))
    await apps[i].close()
  }
}
if (falhaRestauracao) throw falhaRestauracao
const ordenadas = medidas.map((m) => m.milissegundos).sort((a, b) => a - b)
const resultado = {
  pasta: raiz,
  projetoReal: true,
  perfisIsolados: true,
  doisComputadoresFisicos: false,
  clienteDeTesteRestaurado,
  medidas,
  mediana: ordenadas[Math.floor(ordenadas.length / 2)],
  p95: ordenadas[Math.ceil(ordenadas.length * 0.95) - 1],
  metaCumprida: ordenadas.at(-1) <= 2000
}
writeFileSync(join(raiz, 'resultado.json'), JSON.stringify(resultado, null, 2))
console.log(JSON.stringify(resultado))
assert.ok(
  resultado.metaCumprida,
  'A atualização completa deve chegar em até dois segundos em conexão estável.'
)
