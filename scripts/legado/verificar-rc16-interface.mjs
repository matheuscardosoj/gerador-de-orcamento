// Perfil descartável e API em memória. Nenhuma requisição ao Supabase real.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc16-interface')
mkdirSync(saida, { recursive: true })
const entradaMock = `
import { criarMockApi } from '/src/lib/mockApi.ts';
const api = criarMockApi();
await api.conta.entrar('visual@example.invalid','demonstracao',false);
let conta = await api.conta.status();
const ouvintes = new Set();
api.eventos.observarDados = callback => { ouvintes.add(callback); return () => ouvintes.delete(callback); };
api.conta.status = async () => structuredClone(conta);
window.rc16Conta = operador => {
 conta = {...conta, operador, fase:'empresaIndisponivel',empresa:null,indisponibilidade:{motivo:'empresaExcluida',empresaId:'teste',nome:'Empresa descartável',concluida:true}};
 for (const callback of ouvintes) callback({origem:'nuvem',entidades:[],status:true});
};
const original = api.conta.continuarAposIndisponibilidade;
api.conta.continuarAposIndisponibilidade = async () => { conta={...conta,fase:conta.operador?'escolherEmpresa':'desconectado',indisponibilidade:undefined};return structuredClone(conta); };
api.nuvem.status = async () => ({configurada:true,autenticada:true,computador:'pc-visual',pendentes:0,conflitos:[],ultimaSincronizacao:null,erro:null,bytesBanco:0,reservas:{orcamento:0,relatorio:0,recibo:0},protocolo:3});
api.colaboracao.edicao = async () => ({tipo:'orcamento',documentoId:'visual',usuarioId:'usuario',usuarioNome:'Pessoa de teste',computador:'pc-visual',geracao:1,expiraEm:null,offline:false,podeEditar:true,solicitacoes:[]});
api.colaboracao.acompanhar = async () => {};
const documento = await api.orcamentos.create({data:'2026-10-15',destinatario:'Cliente de validação',formato:'carta',titulo:'Proposta de validação',introducao:'',itensServico:[],materiais:[],observacoes:[],pagamentos:[],anexos:[],valorTotal:0,status:'rascunho',prazoDias:0,observacaoInterna:''});
let lista=[];
api.rascunhos.list = async () => structuredClone(lista);
api.rascunhos.create = async (tipo,id,d) => {const r={id:'rascunho-visual',tipo,documentoId:id,documento:d,base:d,baseRevisao:1,estado:'local',criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};lista=[r];return structuredClone(r);};
api.rascunhos.save = async (id,d) => {lista[0].documento=d;return structuredClone(lista[0]);};
api.rascunhos.remove = async id => {lista=lista.filter(r=>r.id!==id);};
window.api=api;window.rc16Documento=documento;
await import('/src/main.tsx');
`
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [
    react(),
    {
      name: 'rc16-fixture',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/rc16-entry.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.end(entradaMock)
          } else next()
        })
      }
    }
  ],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '127.0.0.1', port: 5188, strictPort: true }
})
await servidor.listen()
const entrada = join(saida, 'interface.cjs')
writeFileSync(
  entrada,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(saida, 'perfil'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1024,height:900,webPreferences:{contextIsolation:true}});w.loadURL('http://127.0.0.1:5188')});app.on('window-all-closed',()=>app.quit());`
)
const app = await _electron.launch({ args: [entrada] })
try {
  const page = await app.firstWindow()
  await page.route('**/src/main.tsx', async (route) => {
    const response = await route.fetch()
    // Entrada real é carregada pelo fixture após instalar a API de demonstração.
    await route.fulfill({ response })
  })
  await page.route('http://127.0.0.1:5188/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/rc16-entry.js"')
    })
  })
  await page.reload()
  await page.setViewportSize({ width: 1024, height: 900 })
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page
    .getByRole('button', { name: /Abrir orçamento Nº/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Criar rascunho de trabalho', exact: true }).click()
  await page.getByRole('button', { name: 'Voltar ao documento principal', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Voltar ao documento principal', exact: true }).click()
  await page.getByRole('button', { name: 'Criar rascunho de trabalho', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Rascunhos e controle', exact: true }).click()
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 1)
  await page.screenshot({ path: join(saida, 'rascunhos-1024.png'), fullPage: true })
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).click()
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).last().click()
  await page.getByText('Não há rascunhos guardados para este documento.').waitFor()
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click()
  for (const operador of [true, false]) {
    await page.evaluate((operador) => window.rc16Conta(operador), operador)
    await page
      .getByRole('heading', { name: 'Esta empresa foi excluída pelo Administrador do Sistema.' })
      .waitFor()
    for (const width of [1024, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({
        path: join(saida, `empresa-excluida-${operador ? 'operador' : 'membro'}-${width}.png`),
        fullPage: true
      })
    }
    assert.equal(
      await page
        .getByRole('button', {
          name: operador ? 'Escolher outra empresa' : 'Voltar ao acesso',
          exact: true
        })
        .count(),
      1
    )
  }
  assert.deepEqual(erros, [])
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify(
      {
        rascunhos: 'criação, retorno, cancelamento e exclusão aprovados',
        empresaExcluida: 'operador e membro, 1024 e 1600 px',
        erros
      },
      null,
      2
    )
  )
  console.log(saida)
} finally {
  await app.close()
  await servidor.close()
}
