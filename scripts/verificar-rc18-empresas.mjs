// Perfil e API descartáveis: nenhuma requisição ao Supabase real.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc18-empresas')
mkdirSync(saida, { recursive: true })
const fixture = `
import { criarMockApi } from '/src/lib/mockApi.ts';
const api=criarMockApi();
await api.conta.entrar('operador@example.invalid','demonstracao',false);
const conta=await api.conta.status();
conta.fase='escolherEmpresa';conta.operador=true;conta.empresa=null;
conta.empresas=[{id:'empresa-a',nome:'Empresa inicial',papel:'administrador'}];
const ouvintes=new Set();
let criacoes=0,atualizacoes=0,exclusoes=0;
api.eventos.observarDados=cb=>{ouvintes.add(cb);return()=>ouvintes.delete(cb)};
api.conta.status=async()=>structuredClone(conta);
api.conta.criarEmpresa=async()=>{criacoes++};
api.conta.atualizarEmpresas=async()=>{
 atualizacoes++;if(atualizacoes===1)throw new Error('rede indisponível');
 conta.empresas.push({id:'empresa-nova',nome:'Empresa nova',papel:'administrador'});
 for(const cb of ouvintes)cb({origem:'nuvem',entidades:[],status:true});
 return structuredClone(conta);
};
api.conta.excluirEmpresa=async()=>{exclusoes++;throw new Error('falha simulada')};
window.rc18Contadores=()=>({criacoes,atualizacoes,exclusoes});
window.api=api;
await import('/src/main.tsx');
`
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [
    react(),
    {
      name: 'rc18-fixture',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/rc18-entry.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.end(fixture)
          } else next()
        })
      }
    }
  ],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '127.0.0.1', port: 5189, strictPort: true }
})
await servidor.listen()
const entrada = join(saida, 'interface.cjs')
writeFileSync(
  entrada,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(saida, 'perfil'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1024,height:900,webPreferences:{contextIsolation:true}});w.loadURL('http://127.0.0.1:5189')});app.on('window-all-closed',()=>app.quit());`
)
const app = await _electron.launch({ args: [entrada] })
try {
  const page = await app.firstWindow()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.route('http://127.0.0.1:5189/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/rc18-entry.js"')
    })
  })
  await page.reload()
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.getByRole('button', { name: 'Excluir empresa Empresa inicial', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.waitFor()
  assert.equal(await modal.getByText(/Não foi possível concluir esta ação/).count(), 0)
  assert.ok(await modal.getByText(/Todos os documentos/).isVisible())
  assert.equal((await page.evaluate(() => window.rc18Contadores())).exclusoes, 0)
  assert.equal(
    await modal.getByRole('button', { name: 'Excluir permanentemente', exact: true }).isDisabled(),
    true
  )
  for (const width of [1024, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: join(saida, `exclusao-sem-erro-${width}.png`), fullPage: true })
  }
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByText('Criar outra empresa', { exact: true }).click()
  await page.getByLabel('Nome da empresa', { exact: true }).fill('Empresa nova')
  await page.getByLabel('Nome do administrador', { exact: true }).fill('Administrador')
  await page.getByLabel('E-mail do administrador', { exact: true }).fill('adm@example.invalid')
  await page.getByRole('button', { name: 'Criar empresa e enviar convite', exact: true }).click()
  await page.getByText(/Empresa criada. Não foi possível atualizar a lista./).waitFor()
  assert.equal((await page.evaluate(() => window.rc18Contadores())).criacoes, 1)
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click()
  await page.getByRole('button', { name: 'Empresa nova', exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.rc18Contadores()), {
    criacoes: 1,
    atualizacoes: 2,
    exclusoes: 0
  })
  assert.deepEqual(erros, [])
  await page.screenshot({ path: join(saida, 'empresa-criada-sem-relogin.png'), fullPage: true })
  const resultado = {
    ok: true,
    erroAntesDeExcluir: false,
    exclusoes: 0,
    criacoes: 1,
    atualizacoes: 2,
    listaAtualizadaSemRelogar: true,
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
