// Perfil e API descartáveis: nenhuma requisição ao Supabase real.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc20-calculo')
mkdirSync(saida, { recursive: true })
const fixture = `
import { criarMockApi } from '/src/lib/mockApi.ts';
import { criarEntradaCalculo, calcularCustoServico } from '/@fs/C:/Users/Matheus/Documents/gerador-de-orcamento/src/shared/calculo/engine.ts';
const api=criarMockApi();
await api.conta.entrar('visual@example.invalid','demonstracao',false);
const e=criarEntradaCalculo(await api.parametros.get());
e.margemLucroPercent=100;e.maoDeObra=[{id:'mao',qtdFuncionarios:1,base:'diaria',valor:1000}];
e.avulsos=[{id:'material',descricao:'Materiais',valor:500,modo:'cheio',acrescimoPersonalizadoPercent:50}];
const resultado=calcularCustoServico(e);
const doc=await api.orcamentos.create({data:'2026-10-15',destinatario:'Cliente de validação',formato:'carta',titulo:'Proposta rc20',introducao:'',itensServico:[{id:'servico-rc20',descricao:'Serviço rc20',unidade:'serviço',quantidade:3,valorUnitario:resultado.precoFinal/3,valorTotal:resultado.precoFinal,calculo:{entrada:e,resultado}}],materiais:[],observacoes:[],pagamentos:[],anexos:[],valorTotal:resultado.precoFinal,status:'rascunho',prazoDias:0,observacaoInterna:''});
const rel=await api.relatorios.criarDeOrcamento(doc.id);
window.rc20Ler=async(tipo)=>tipo==='orcamento'?api.orcamentos.get(doc.id):api.relatorios.get(rel.id);
window.rc20Exportacoes=[];
for(const [metodo,tipo,formato] of [['gerarPdf','orcamento','pdf'],['gerarDocx','orcamento','docx'],['gerarRelatorioPdf','relatorio','pdf'],['gerarRelatorioDocx','relatorio','docx']])api.documentos[metodo]=async(id)=>{
 const d=tipo==='orcamento'?await api.orcamentos.get(id):await api.relatorios.get(id);
 window.rc20Exportacoes.push({tipo,formato,valor:d.itensServico[0].valorTotal,meta:d.itensServico[0].calculo.entrada.precoFinalDesejado});return {caminho:null};
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
      name: 'rc20-fixture',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/rc20-entry.js') {
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
      body: (await response.text()).replace('src="/src/main.tsx"', 'src="/rc20-entry.js"')
    })
  })
  await page.reload()
  await page.setViewportSize({ width: 1024, height: 900 })
  const resultados = []
  for (const tipo of ['orcamento', 'relatorio']) {
    if (tipo === 'relatorio')
      await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
    await page
      .getByRole('button', {
        name: tipo === 'orcamento' ? 'Abrir orçamento Nº 1' : 'Abrir relatório Nº 1',
        exact: true
      })
      .click()
    await page.getByRole('button', { name: 'Editar serviço Serviço rc20', exact: true }).click()
    let modal = page.getByRole('dialog')
    await modal.getByRole('heading', { name: 'Calcular preço do serviço', exact: true }).waitFor()
    const resumo = modal
      .getByRole('heading', { name: 'Resumo do cálculo', exact: true })
      .locator('..')
      .locator('..')
    const linha = (nome) => resumo.getByText(nome, { exact: true }).last().locator('..')
    const meta = modal.getByLabel('Preço final desejado deste serviço (R$)', { exact: true })
    assert.match(await meta.inputValue(), /2\.750/)
    if (tipo === 'orcamento') {
      const lucroSelect = modal.getByLabel('Cálculo do lucro deste item', { exact: true })
      const popup = await lucroSelect.evaluate((select) => {
        for (let index = 0; index < 40; index++) {
          const option = document.createElement('option')
          option.value = `teste-opcao-${index}`
          option.textContent = `Opção de teste ${index + 1}`
          select.append(option)
        }
        return {
          suportado: CSS.supports('appearance', 'base-select'),
          aparencia: getComputedStyle(select).appearance,
          alturaMaxima: getComputedStyle(select, '::picker(select)').maxBlockSize,
          rolagem: getComputedStyle(select, '::picker(select)').overflowY
        }
      })
      assert.equal(popup.suportado, true)
      assert.equal(popup.aparencia, 'base-select')
      assert.equal(popup.alturaMaxima, '320px')
      assert.equal(popup.rolagem, 'auto')
      await lucroSelect.click()
      assert.equal(await lucroSelect.evaluate((select) => select.matches(':open')), true)
      await page.screenshot({ path: join(saida, 'select-opcoes-com-rolagem.png'), fullPage: true })
      // Fechar pelo próprio controle; Escape propaga até o diálogo do app.
      await lucroSelect.selectOption('proprio')
    }
    assert.match(await linha('Materiais').innerText(), /750,00/)
    assert.match(await linha('Custo do serviço').innerText(), /1.000,00/)
    assert.match(await linha('Outros custos e repasses').innerText(), /750,00/)
    assert.equal(await resumo.getByText('Subtotal antes do imposto', { exact: true }).count(), 0)
    const fontes = await resumo
      .getByText('Materiais', { exact: true })
      .evaluate((el) => getComputedStyle(el).fontSize)
    assert.equal(
      fontes,
      await resumo
        .getByText('Custo do serviço', { exact: true })
        .evaluate((el) => getComputedStyle(el).fontSize)
    )
    await modal.getByLabel('Cálculo do lucro deste item', { exact: true }).selectOption('geral')
    assert.match(await linha('Materiais').innerText(), /1.000,00/)
    assert.match(await linha('Custo do serviço').innerText(), /1.000,00/)
    assert.match(await linha('Outros custos e repasses').innerText(), /1.000,00/)
    assert.match(await linha('Preço final').innerText(), /3.000,00/)
    await modal.getByLabel('Incluir imposto da nota fiscal no preço', { exact: true }).check()
    assert.match(await linha('Preço final').innerText(), /3.191,49/)
    for (const width of [1024, 1600]) {
      await page.setViewportSize({ width, height: 1000 })
      await resumo.getByText('Preço final', { exact: true }).scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: join(saida, `${tipo}-resumo-${width}.png`), fullPage: true })
    }
    await modal.getByLabel('Cálculo do lucro deste item', { exact: true }).selectOption('proprio')
    await modal.getByLabel('Percentual próprio de lucro deste item (%)', { exact: true }).fill('50')
    await meta.fill('4000,17')
    assert.match(await linha('Preço final').innerText(), /4.000,17/)
    assert.equal(
      await modal
        .getByLabel('Percentual próprio de lucro deste item (%)', { exact: true })
        .inputValue(),
      '50'
    )
    const percentualGeral = modal.getByLabel('Percentual geral de lucro sobre o custo (%)', {
      exact: true
    })
    await percentualGeral.fill('100')
    assert.equal(await meta.inputValue(), '2.925,53')
    assert.match(await linha('Preço final').innerText(), /2.925,53/)
    await meta.fill('4.000,17')
    assert.notEqual(await percentualGeral.inputValue(), '100')
    assert.match(await linha('Preço final').innerText(), /4.000,17/)
    await meta.fill('1500')
    await modal.getByText(/A meta não cobre/).waitFor()
    assert.equal(await meta.inputValue(), '1.500')
    assert.match(await linha('Preço final').innerText(), /1.861,70/)
    await modal
      .getByRole('button', {
        name: tipo === 'orcamento' ? 'Usar no orçamento' : 'Usar no relatório',
        exact: true
      })
      .click()
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await page.waitForFunction(async (t) => {
      const d = await window.rc20Ler(t)
      return d.itensServico[0].valorTotal === 1861.7
    }, tipo)
    await page.getByRole('button', { name: 'Editar serviço Serviço rc20', exact: true }).click()
    modal = page.getByRole('dialog')
    assert.equal(
      await modal
        .getByLabel('Preço final desejado deste serviço (R$)', { exact: true })
        .inputValue(),
      '1.500,00'
    )
    await modal.getByLabel('Dias de serviço', { exact: true }).fill('2')
    await modal.getByText(/O cálculo foi alterado/).waitFor()
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('button', { name: 'Prévia', exact: true }).click()
    const previa = page.getByRole('dialog')
    await previa.waitFor()
    await page.waitForFunction(() =>
      [...document.querySelectorAll('iframe')].some((f) =>
        f.contentDocument?.body.innerText.includes('1.861,70')
      )
    )
    await previa.getByRole('button', { name: 'Fechar', exact: true }).last().click()
    for (const formato of ['PDF', 'Word'])
      await page.getByRole('button', { name: formato, exact: true }).click()
    resultados.push({
      tipo,
      proprio: 750,
      geral: 1000,
      comImposto: 3191.49,
      meta: 1500,
      fontes,
      preview: true
    })
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  }
  const exportacoes = await page.evaluate(() => window.rc20Exportacoes)
  assert.equal(exportacoes.length, 4)
  assert.ok(exportacoes.every((e) => e.valor === 1861.7 && e.meta === 1500))
  assert.deepEqual(erros, [])
  const resultado = { ok: true, resultados, exportacoes, erros }
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
