// Valida paginação e falha de exclusão usando somente API e perfil sintéticos.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/1-5-1-cadastros')
mkdirSync(saida, { recursive: true })
const fixture = `
import { criarMockApi } from '/src/lib/mockApi.ts';
const api=criarMockApi();
await api.conta.entrar('validacao@example.invalid','demonstracao',false);
for(let i=1;i<=25;i++){
 await api.clientes.create({nome:'Cliente de pagina '+String(i).padStart(2,'0'),tratamento:'A',contato:'',observacao:'',ativo:true,criadoEm:new Date().toISOString()});
 await api.servicos.create({nome:'Servico de pagina '+String(i).padStart(2,'0'),descricaoPadrao:'Descricao '+i,unidade:'serviço',precoReferencia:i});
}
api.servicos.remove=async()=>{throw new Error('Falha simulada da exclusão do serviço')};
window.api=api;
await import('/src/main.tsx');
`
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [
    react(),
    {
      name: 'validacao-1-5-1',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/validacao-1-5-1.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.end(fixture)
          } else next()
        })
      }
    }
  ],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '127.0.0.1', port: 5190, strictPort: true }
})
await servidor.listen()
const entrada = join(saida, 'interface.cjs')
writeFileSync(
  entrada,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(saida, 'perfil'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1400,height:900,webPreferences:{contextIsolation:true}});w.loadURL('http://127.0.0.1:5190')});app.on('window-all-closed',()=>app.quit());`
)
const app = await _electron.launch({ args: [entrada] })
try {
  const page = await app.firstWindow()
  const erros = []
  page.on('pageerror', (error) => erros.push(error.message))
  await page.route('http://127.0.0.1:5190/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/validacao-1-5-1.js"')
    })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  await page.getByRole('heading', { name: 'Cadastros', exact: true }).waitFor()

  await page.getByRole('tab', { name: 'Clientes', exact: true }).waitFor()
  assert.equal(await page.locator('tbody tr').count(), 12)
  await page.getByText('Mostrando 1–12 de 26 clientes', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Próxima', exact: true }).click()
  assert.equal(await page.locator('tbody tr').count(), 12)
  await page.getByText('Mostrando 13–24 de 26 clientes', { exact: true }).waitFor()
  await page.getByLabel('Buscar clientes').fill('Cliente de pagina 25')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByText('Mostrando 1–1 de 1 clientes', { exact: true }).waitFor()

  await page.getByRole('tab', { name: 'Catálogo de serviços', exact: true }).click()
  assert.equal(await page.locator('tbody tr').count(), 12)
  await page.getByText('Mostrando 1–12 de 28 serviços', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Próxima', exact: true }).click()
  assert.equal(await page.locator('tbody tr').count(), 12)
  await page.getByText('Mostrando 13–24 de 28 serviços', { exact: true }).waitFor()
  await page.getByLabel('Buscar serviços').fill('Servico de pagina 25')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByText('Mostrando 1–1 de 1 serviços', { exact: true }).waitFor()
  await page.getByLabel('Buscar serviços').fill('')
  await page
    .getByRole('button', { name: 'Excluir serviço Servico de pagina 01', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Excluir serviço', exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await dialog.getByText(/Falha simulada da exclusão do serviço/).waitFor()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.deepEqual(erros, [])

  const resultado = {
    ok: true,
    clientesPorPagina: 12,
    servicosPorPagina: 12,
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
