// Perfil e API descartáveis: nenhuma requisição ao Supabase real.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc17-interface')
mkdirSync(saida, { recursive: true })
const fixture = `
import { criarMockApi } from '/src/lib/mockApi.ts';
const api=criarMockApi();
await api.conta.entrar('visual@example.invalid','demonstracao',false);
const conta=await api.conta.status();
const ouvintes=new Set();
api.eventos.observarDados=callback=>{ouvintes.add(callback);return ()=>ouvintes.delete(callback)};
api.conta.status=async()=>structuredClone(conta);
api.nuvem.status=async()=>({configurada:true,autenticada:true,computador:'pc-d',pendentes:0,conflitos:[],ultimaSincronizacao:null,erro:null,bytesBanco:0,reservas:{orcamento:0,relatorio:0,recibo:0},protocolo:4});
const documento=await api.orcamentos.create({data:'2026-10-15',destinatario:'Cliente de validação',formato:'carta',titulo:'Proposta rc17',introducao:'',itensServico:[],materiais:[],observacoes:[],pagamentos:[],anexos:[],valorTotal:0,status:'rascunho',prazoDias:0,observacaoInterna:''});
let pedidos=[];
let controle={tipo:'orcamento',documentoId:documento.id,usuarioId:'usuario',usuarioNome:'Operador D',computador:'pc-d',geracao:1,expiraEm:null,offline:false,podeEditar:true};
window.rc17Consultas=0;
api.colaboracao.acompanhados=async()=>[{tipo:'orcamento',id:documento.id}];
api.nuvem.dispositivos=async()=>[{id:'pc-d',nome:'D-MATHEUS'},{id:'pc-n',nome:'N-MATHEUS'}];
api.colaboracao.acompanhar=async()=>{};
api.colaboracao.edicao=async(tipo,id,acao,destino)=>{
 window.rc17Consultas++;
 await new Promise(r=>setTimeout(r,40));
 if(acao==='transferir'){window.rc17Destino=destino;pedidos=[];controle={...controle,computador:destino,geracao:2,podeEditar:false}}
 return {...controle,solicitacoes:structuredClone(pedidos)};
};
window.rc17Disparar=()=>{
 pedidos=[{usuarioNome:'Solicitante N',computador:'pc-n',criadoEm:'2026-10-15T20:00:00.000Z'}];
 for(let i=0;i<20;i++)for(const callback of ouvintes)callback({origem:'nuvem',entidades:['controle:orcamento:'+documento.id],status:true});
};
window.api=api;
await import('/src/main.tsx');
`
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [
    react(),
    {
      name: 'rc17-fixture',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/rc17-entry.js') {
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
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/rc17-entry.js"')
    })
  })
  await page.reload()
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.waitForTimeout(250)
  const antes = await page.evaluate(() => window.rc17Consultas)
  await page.evaluate(() => window.rc17Disparar())
  const aviso = page.getByRole('button', { name: 'Abrir documento e solicitações', exact: true })
  await aviso.waitFor()
  await page.waitForTimeout(250)
  const consultas = (await page.evaluate(() => window.rc17Consultas)) - antes
  assert.ok(consultas <= 2, `Rajada de 20 eventos iniciou ${consultas} consultas`)
  assert.equal(await aviso.count(), 1)
  await page.evaluate(() => window.rc17Disparar())
  await page.waitForTimeout(250)
  assert.equal(await aviso.count(), 1)
  await page.waitForTimeout(8500)
  assert.equal(await aviso.count(), 1, 'O pedido deve persistir além do prazo do toast comum')
  await page.screenshot({ path: join(saida, 'pedido-em-outra-tela-1024.png'), fullPage: true })
  await aviso.click()
  await page.getByRole('heading', { name: 'Rascunhos e controle de edição', exact: true }).waitFor()
  await page.getByLabel('Transferir para', { exact: true }).selectOption('pc-n')
  const transferir = page.getByRole('button', { name: 'Transferir controle', exact: true })
  await transferir.waitFor()
  for (const width of [1024, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: join(saida, `painel-pedido-${width}.png`), fullPage: true })
  }
  await transferir.click()
  await page.waitForFunction(() => window.rc17Destino === 'pc-n')
  assert.deepEqual(erros, [])
  const resultado = {
    ok: true,
    eventosPorRajada: 20,
    consultasPorRajada: consultas,
    avisoPersistente: true,
    deduplicacao: true,
    navegacaoPainel: true,
    destinoTransferencia: 'pc-n',
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
