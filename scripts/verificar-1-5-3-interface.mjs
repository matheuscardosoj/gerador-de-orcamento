// Valida paginação e falha de exclusão usando somente API e perfil sintéticos.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/1-5-3-cadastros')
mkdirSync(saida, { recursive: true })
const fixture = `
import { criarMockApi } from '/src/lib/mockApi.ts';
const api=criarMockApi();
await api.conta.entrar('validacao@example.invalid','demonstracao',false);
const estado={configurada:true,autenticada:true,computador:'pc-sintetico',pendentes:0,conflitos:[],ultimaSincronizacao:new Date().toISOString(),erro:null,bytesBanco:0,reservas:{orcamento:0,relatorio:0,recibo:0},protocolo:3,tempoReal:'conectado',conexao:'acessivel'};
api.nuvem.status=async()=>({...estado});
api.nuvem.verificarConexao=async()=>{window.__verificacoes=(window.__verificacoes||0)+1};
window.__conexao=estado;
api.servicos.remove=async()=>{throw new Error('Falha simulada da exclusão do serviço')};
const callbacks=new Set();
api.eventos.observarDados=(fn)=>{callbacks.add(fn);return()=>callbacks.delete(fn)};
window.__emitir=()=>{for(const fn of callbacks)fn({origem:'nuvem',entidades:[],status:true})};
window.api=api;
await import('/src/main.tsx');
`
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [
    react(),
    {
      name: 'validacao-1-5-3',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/validacao-1-5-3.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.end(fixture)
          } else next()
        })
      }
    }
  ],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '127.0.0.1', port: 5192, strictPort: true }
})
await servidor.listen()
const entrada = join(saida, 'interface.cjs')
writeFileSync(
  entrada,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(saida, 'perfil'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1400,height:900,webPreferences:{contextIsolation:true}});w.loadURL('http://127.0.0.1:5192')});app.on('window-all-closed',()=>app.quit());`
)
const app = await _electron.launch({ args: [entrada] })
try {
  const page = await app.firstWindow()
  const erros = []
  page.on('pageerror', (error) => erros.push(error.message))
  await page.route('http://127.0.0.1:5192/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/validacao-1-5-3.js"')
    })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  await page.getByRole('heading', { name: 'Cadastros', exact: true }).waitFor()

  await page.getByRole('tab', { name: 'Catálogo de serviços', exact: true }).click()
  await page
    .getByRole('button', { name: /Excluir serviço/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  const avisos = page.getByRole('region', { name: 'Avisos', exact: true })
  await avisos.getByText('Falha simulada da exclusão do serviço', { exact: true }).waitFor()
  assert.equal(await dialog.locator('[data-gdo-notificacoes]').count(), 1)
  assert.equal(await avisos.evaluate((el) => !!el.closest('[role="dialog"]')), true)
  await avisos.getByRole('button', { name: 'Fechar aviso', exact: true }).focus()
  assert.equal(
    await avisos
      .getByRole('button', { name: 'Fechar aviso', exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  )
  for (const largura of [1440, 1024]) {
    await page.setViewportSize({ width: largura, height: 800 })
    await page.screenshot({ path: join(saida, `modal-aviso-${largura}.png`), fullPage: true })
    const caixa = await avisos.boundingBox()
    assert.ok(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura)
  }
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.evaluate(() => {
    window.__conexao.conexao = 'inacessivel'
    window.__conexao.erro = 'Falha de rede'
    window.dispatchEvent(
      new CustomEvent('gdo:dados', { detail: { origem: 'nuvem', entidades: [], status: true } })
    )
  })
  // mockApi subscriptions use their own emitter; trigger the registered observers explicitly below.
  await page.evaluate(() => window.__emitir())
  await avisos.getByText(/A conexão será verificada automaticamente/).waitFor()
  await page.evaluate(async () => {
    const { notificar } = await import('/src/lib/notificacoes.ts')
    const texto =
      'Não foi possível acessar o serviço. Verifique a conexão e se o serviço está disponível; depois tente novamente.'
    for (const chave of [
      'salvar-orcamento',
      'rascunhos-orcamento',
      'salvar-relatorio',
      'salvar-recibo'
    ])
      notificar(texto, 'erro', { chave })
  })
  await avisos.getByRole('button', { name: 'Tentar agora', exact: true }).click()
  assert.equal(await avisos.getByText(/A conexão será verificada automaticamente/).count(), 1)
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.__emitir())
  assert.equal(await avisos.getByText(/A conexão será verificada automaticamente/).count(), 1)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  assert.ok((await page.evaluate(() => window.__verificacoes)) > 0)
  await page.evaluate(() => {
    window.__conexao.conexao = 'acessivel'
    window.__conexao.erro = null
    window.__conexao.recuperandoConexao = true
    window.__emitir()
  })
  await avisos
    .getByText('Conexão restabelecida. Retomando sincronização…', { exact: true })
    .waitFor()
  assert.equal(
    await avisos
      .getByText('Conexão restabelecida. Sincronização concluída.', { exact: true })
      .count(),
    0
  )
  await page.evaluate(() => {
    window.__conexao.recuperandoConexao = false
    window.__emitir()
  })
  await avisos
    .getByText('Conexão restabelecida. Sincronização concluída.', { exact: true })
    .waitFor()
  assert.equal(await avisos.getByText(/A conexão será verificada automaticamente/).count(), 0)
  await page.evaluate(async () => {
    const { notificar } = await import('/src/lib/notificacoes.ts')
    for (let i = 0; i < 5; i++) notificar('Falha de teste ' + i, 'erro', { chave: 'fila-' + i })
  })
  const ver = avisos.getByRole('button', { name: /Ver .* ocult/ })
  await ver.click()
  assert.equal(await avisos.getByText(/Falha de teste/).count(), 5)
  const limite = await avisos
    .locator('.overflow-y-auto')
    .evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }))
  assert.ok(limite.scroll >= limite.client)
  await new Promise((r) => setTimeout(r, 9500))
  assert.equal(await avisos.getByText(/Falha de teste/).count(), 5)
  assert.equal(
    await avisos
      .getByText('Conexão restabelecida. Sincronização concluída.', { exact: true })
      .count(),
    0
  )
  await page.screenshot({ path: join(saida, 'fila-avisos.png'), fullPage: true })
  assert.deepEqual(erros, [])

  const resultado = {
    ok: true,
    modalAcessivel: true,
    conexaoDeduplicada: true,
    persistenciaErros: true,
    filaComRolagem: true,
    erroExclusaoExibido: true,
    erros
  }
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify(resultado))
} catch (erro) {
  const page = await app.firstWindow()
  await page.screenshot({ path: join(saida, 'falha.png'), fullPage: true })
  writeFileSync(join(saida, 'falha.txt'), await page.locator('body').innerText())
  throw erro
} finally {
  await app.close()
  await servidor.close()
}
