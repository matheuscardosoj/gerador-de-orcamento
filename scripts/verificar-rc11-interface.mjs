// Electron real, API de demonstração e perfil descartável; não abre bases de usuários.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { _electron } from 'playwright'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const saida = resolve('output/playwright/rc11-interface')
mkdirSync(saida, { recursive: true })
const servidor = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true }
})
await servidor.listen()
const entrada = join(saida, 'interface.cjs')
writeFileSync(
  entrada,
  `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(saida, 'perfil'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1024,height:768,webPreferences:{contextIsolation:true}});w.loadURL('http://127.0.0.1:5187')});app.on('window-all-closed',()=>app.quit());`
)
const app = await _electron.launch({ args: [entrada] })
const resultado = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.error(e.message))
  await page.getByLabel('E-mail', { exact: true }).fill('teste@exemplo.invalid')
  await page.locator('input[type=password]').fill('demonstracao')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  await page.evaluate(async () => {
    const api = window.__api
    const agora = new Date().toISOString()
    const nome =
      'Cliente com nome extenso para verificar alinhamento, espaço e leitura em janelas compactas'
    const comum = {
      id: 'visual',
      numero: 123456,
      data: '2026-10-14',
      destinatario: nome,
      status: 'rascunho',
      criadoEm: agora,
      atualizadoEm: agora,
      versao: 1,
      servicosBusca: ['Descrição de serviço muito longa para conferir o comportamento da tabela'],
      observacaoInterna: 'Anotação longa de teste visual'
    }
    api.orcamentos.list = async () => [{ ...comum, valorTotal: 123456.78 }]
    api.relatorios.list = async () => [
      {
        ...comum,
        totais: { servicos: 123456.78, valorFinal: 123456.78, saldo: 123456.78 },
        origemOrcamento: null
      }
    ]
    api.recibos.list = async () => [
      {
        ...comum,
        status: 'pendente',
        valor: 123456.78,
        descricao: 'Descrição extensa do recibo para testar a coluna',
        origemTipo: 'avulso',
        quitacao: 'parcial'
      }
    ]
  })
  // A primeira lista de orçamentos já foi carregada antes da substituição da API.
  // Navegar para outra tela e voltar força uma leitura do fixture de demonstração.
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
  await page.getByRole('heading', { level: 1 }).last().waitFor()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page
    .getByText('Cliente com nome extenso para verificar', { exact: false })
    .waitFor({ state: 'visible' })
  for (const largura of [1024, 1600]) {
    await page.setViewportSize({ width: largura, height: 900 })
    for (const tela of ['Orçamentos', 'Relatórios', 'Recibos', 'Cadastros', 'Configurações']) {
      await page.getByRole('button', { name: tela, exact: true }).click()
      await page.getByRole('heading', { level: 1 }).last().waitFor()
      if (['Orçamentos', 'Relatórios', 'Recibos'].includes(tela)) {
        await page
          .getByText('Cliente com nome extenso para verificar', { exact: false })
          .waitFor({ state: 'visible' })
      }
      const medidas = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        janela: innerWidth,
        tabelas: [...document.querySelectorAll('.data-table-viewport')].map((el) => ({
          largura: el.clientWidth,
          conteudo: el.scrollWidth
        }))
      }))
      assert.ok(medidas.pagina <= medidas.janela + 1, `${tela}: overflow da página em ${largura}`)
      await page.screenshot({ path: join(saida, `${tela}-${largura}.png`), fullPage: true })
      resultado.push({ tela, largura, ...medidas })
    }
  }
  await page.getByLabel('Seu nome', { exact: true }).fill('Nome de validação')
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click()
  await page.getByText('Seu nome foi atualizado.', { exact: true }).waitFor()
  await page
    .getByText('Seu nome foi atualizado.', { exact: true })
    .waitFor({ state: 'hidden', timeout: 12000 })
  const olho = page.locator('button[aria-label="Mostrar senha"]').first()
  await olho.hover()
  assert.ok(
    await olho.evaluate((b) => {
      const i = b.parentElement.querySelector('input').getBoundingClientRect(),
        r = b.getBoundingClientRect()
      return r.left > i.left && r.right < i.right && r.top > i.top && r.bottom < i.bottom
    })
  )
  await page.screenshot({ path: join(saida, 'senha-hover.png'), fullPage: true })
  await page.evaluate(() => {
    const api = window.__api
    let rascunhos = [
      {
        id: 'conflito-local',
        tipo: 'orcamento',
        documentoId: 'excluido-na-nuvem',
        documento: { destinatario: 'Rascunho de conflito' },
        atualizadoEm: new Date().toISOString()
      }
    ]
    api.rascunhos.list = async () => rascunhos
    api.rascunhos.remove = async (id) => {
      rascunhos = rascunhos.filter((rascunho) => rascunho.id !== id)
    }
  })
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).click()
  await page.getByText('Excluir rascunho local?', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).click()
  await page.getByRole('button', { name: 'Excluir rascunho', exact: true }).last().click()
  await page
    .getByText('Rascunhos locais recuperáveis', { exact: true })
    .waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Novo orçamento', exact: true }).first().click()
  await page.getByRole('button', { name: 'Com cálculo', exact: true }).click()
  await page.getByLabel('Descrição do serviço', { exact: true }).fill('Serviço de validação')
  await page.getByRole('button', { name: 'Custo', exact: true }).click()
  await page.getByLabel('Valor do custo (R$)', { exact: true }).fill('1000')
  await page.getByLabel('Acréscimo de lucro', { exact: true }).selectOption('proprio')
  await page.getByLabel('Lucro deste custo (%)', { exact: true }).fill('10')
  await page.getByText('R$ 1.100,00', { exact: true }).last().waitFor()
  await page.getByText('Custo do serviço', { exact: true }).waitFor()
  assert.equal(await page.getByText('Lucro personalizado', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Custos sem lucro', { exact: true }).count(), 0)
  await page.getByLabel('Lucro deste custo (%)', { exact: true }).fill('150')
  await page.getByText('R$ 2.500,00', { exact: true }).last().waitFor()
  await page.screenshot({ path: join(saida, 'lucro-personalizado.png'), fullPage: true })
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify(
      {
        escopo: 'Electron com API de demonstração, sem conexão remota',
        resultado,
        lucroPersonalizado: { percentual: 150, custoServico: 2500 }
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ saida, telas: resultado.length, lucroPersonalizado150: '2500.00' }))
} finally {
  await app.close()
  await servidor.close()
}
