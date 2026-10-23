// Perfil e API descartáveis: nenhuma requisição ao Supabase real.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc18-interface')
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
const documento=await api.orcamentos.create({data:'2026-10-15',destinatario:'Cliente de validação',formato:'carta',titulo:'Proposta rc18',introducao:'',itensServico:[],materiais:[],observacoes:[],pagamentos:[],anexos:[],valorTotal:0,status:'rascunho',prazoDias:0,observacaoInterna:''});
let pedidos=[]; let semRede=false;
let controle={tipo:'orcamento',documentoId:documento.id,usuarioId:'usuario',usuarioNome:'Operador D',computador:'pc-d',geracao:1,expiraEm:null,offline:false,podeEditar:true};
window.rc18Consultas=0;
api.colaboracao.acompanhados=async()=>[{tipo:'orcamento',id:documento.id}];
api.nuvem.dispositivos=async()=>[{id:'pc-d',nome:'D-MATHEUS'},{id:'pc-n',nome:'N-MATHEUS'}];
api.colaboracao.acompanhar=async()=>{};
api.colaboracao.edicao=async(tipo,id,acao,destino)=>{
 if(semRede) throw new Error('rede indisponível');
 window.rc18Consultas++;
 await new Promise(r=>setTimeout(r,40));
 if(acao==='transferir'){window.rc18Destino=destino;pedidos=[];controle={...controle,computador:destino,geracao:controle.geracao+1,podeEditar:false}}
 return {...controle,solicitacoes:structuredClone(pedidos)};
};
window.rc18Disparar=()=>{
 pedidos=[{usuarioNome:'Solicitante N',computador:'pc-n',criadoEm:'2026-10-15T20:00:00.000Z'}];
 for(let i=0;i<20;i++)for(const callback of ouvintes)callback({origem:'nuvem',entidades:['controle:orcamento:'+documento.id],status:true});
};

let seq=0;
api.colaboracao.estadoEdicao=async(tipo,id,acao,destino)=>{
 const c=await api.colaboracao.edicao(tipo,id,acao,destino);
 const estado={empresaId:conta.empresa.id,sessao:1,sequencia:++seq,tipo,documentoId:id,controle:c};
 for(const cb of ouvintes)cb({origem:'nuvem',entidades:[],controleEdicao:estado});
 window.rc18Ultimo=structuredClone(estado);
 return estado;
};
window.rc18Mudar=(modo,ciclo=0)=>{
 if(modo==='rede-off')semRede=true;
 else if(modo==='rede-on')semRede=false;
 else {
  controle={...controle,geracao:controle.geracao+1,podeEditar:modo==='dono',computador:modo==='dono'?'pc-d':'pc-n'};
  pedidos=modo==='dono'?[{usuarioNome:'Solicitante N',computador:'pc-n',criadoEm:'pedido-'+ciclo}]:[{usuarioNome:'Solicitante D',computador:'pc-d',criadoEm:'pedido-'+ciclo}];
 }
 for(let i=0;i<20;i++)for(const cb of ouvintes)cb({origem:'nuvem',entidades:['controle:orcamento:'+documento.id],status:true});
};
window.rc18Atrasado=()=>{const e={...window.rc18Ultimo,sequencia:1,controle:{...controle,geracao:1,podeEditar:true,computador:'pc-d',solicitacoes:[{usuarioNome:'Pedido antigo',computador:'pc-antigo',criadoEm:'velho'}]}};for(const cb of ouvintes)cb({origem:'nuvem',entidades:[],controleEdicao:e})};
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
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.waitForTimeout(250)
  const antes = await page.evaluate(() => window.rc18Consultas)
  await page.evaluate(() => window.rc18Disparar())
  const aviso = page.getByRole('button', { name: 'Abrir documento e solicitações', exact: true })
  await aviso.waitFor()
  await page.waitForTimeout(250)
  const consultas = (await page.evaluate(() => window.rc18Consultas)) - antes
  assert.ok(consultas <= 2, `Rajada de 20 eventos iniciou ${consultas} consultas`)
  assert.equal(await aviso.count(), 1)
  await page.evaluate(() => window.rc18Disparar())
  await page.waitForTimeout(250)
  assert.equal(await aviso.count(), 1)
  await page.waitForTimeout(8500)
  assert.equal(await aviso.count(), 1, 'O pedido deve persistir além do prazo do toast comum')
  await page.screenshot({ path: join(saida, 'pedido-em-outra-tela-1024.png'), fullPage: true })
  for (let ciclo = 0; ciclo < 20; ciclo++) {
    await page.evaluate((i) => window.rc18Mudar('outro', i), ciclo)
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[aria-label="Avisos"] button')
          ?.textContent?.includes('Abrir documento')
    )
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].some(
          (b) => b.textContent === 'Abrir documento e solicitações'
        )
    )
    await page.evaluate((i) => window.rc18Mudar('dono', i), ciclo)
    await aviso.waitFor()
    assert.equal(await aviso.count(), 1)
  }
  await page.evaluate(() => window.rc18Atrasado())
  assert.equal(await page.getByText(/Pedido antigo/).count(), 0)
  await page.evaluate(() => window.rc18Mudar('rede-off'))
  const offline = page.getByRole('button', {
    name: 'Aguardando conexão para confirmar',
    exact: true
  })
  await offline.waitFor()
  assert.equal(await offline.isDisabled(), true)
  await page.evaluate(() => window.rc18Mudar('rede-on'))
  await aviso.waitFor()
  assert.equal(await aviso.isEnabled(), true)
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).first().click()
  await page.evaluate(() => window.rc18Mudar('rede-on'))
  await page.waitForTimeout(250)
  assert.equal(await aviso.count(), 0, 'Dispensado não reaparece enquanto pendente')
  await page.evaluate(() => window.rc18Mudar('outro', 99))
  await page.waitForTimeout(250)
  await page.evaluate(() => window.rc18Mudar('dono', 100))
  await aviso.waitFor()
  await aviso.click()
  await page.getByRole('heading', { name: 'Rascunhos e controle de edição', exact: true }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).last().click()
  await page.getByLabel('Destinatário (sem vírgula)', { exact: true }).fill('Cliente alterado')
  await page.evaluate(() => window.rc18Mudar('dono', 101))
  await aviso.waitFor()
  await aviso.click()
  await page.getByRole('heading', { name: 'Alterações não salvas', exact: true }).waitFor()
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem('gdo:abrir-colaboracao-pendente')),
    null
  )
  await page.getByRole('button', { name: 'Continuar editando', exact: true }).click()
  assert.equal(await aviso.count(), 1)
  await aviso.click()
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
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
  await page.waitForFunction(() => window.rc18Destino === 'pc-n')
  assert.deepEqual(erros, [])
  const resultado = {
    ok: true,
    eventosPorRajada: 20,
    consultasPorRajada: consultas,
    avisoPersistente: true,
    deduplicacao: true,
    navegacaoPainel: true,
    destinoTransferencia: 'pc-n',
    alternancias: 20,
    avisoAntigoRejeitado: true,
    offlineDesabilitado: true,
    dispensaRespeitada: true,
    cancelamentoNavegacaoPreservaAviso: true,
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
