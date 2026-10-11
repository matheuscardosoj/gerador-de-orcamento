// Conferência visual em um perfil criado por verificar-app.mjs, nunca no banco de uso.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join, sep } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const base = resolve('output/playwright')
const perfilTeste = resolve(process.argv[2] ?? '')
assert.ok(perfilTeste.startsWith(base + sep), 'Informe uma validação dentro de output/playwright.')
const dados = JSON.parse(readFileSync(join(perfilTeste, 'resultado.json'), 'utf8'))
const saida = join(base, `estilos-${Date.now()}`)
mkdirSync(saida, { recursive: true })
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(perfilTeste, 'perfil') }
})
const resultados = []
const erros = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  const conferir = async (nome) => {
    for (const largura of [1024, 1440]) {
      await app.evaluate(({ BrowserWindow }, largura) => {
        const janela = BrowserWindow.getAllWindows()[0]
        janela.unmaximize()
        janela.setContentSize(largura, 900)
      }, largura)
      await page.waitForFunction((largura) => Math.abs(window.innerWidth - largura) <= 2, largura)
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      )
      const medidas = await page.evaluate(() => {
        const main = document.querySelector('main')
        const titulos = [...document.querySelectorAll('h2')].map((el) => {
          const card = el.closest('.rounded-xl')
          return {
            titulo: el.textContent,
            fonte: getComputedStyle(el).fontSize,
            peso: getComputedStyle(el).fontWeight,
            padding: card ? getComputedStyle(card).padding : null
          }
        })
        const campos = [
          ...document.querySelectorAll(
            'input:not([type=checkbox]):not([type=file]):not([type=color]), select, textarea'
          )
        ]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            fonte: getComputedStyle(el).fontSize,
            borda: getComputedStyle(el).borderRadius
          }))
        return {
          largura: innerWidth,
          excessoPagina:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          excessoConteudo: main ? main.scrollWidth - main.clientWidth : 0,
          titulos,
          campos,
          rotulosAninhados: document.querySelectorAll('label label').length
        }
      })
      assert.ok(medidas.excessoPagina <= 1, `${nome}: rolagem horizontal na página`)
      assert.ok(medidas.excessoConteudo <= 1, `${nome}: rolagem horizontal no conteúdo`)
      assert.equal(medidas.rotulosAninhados, 0, `${nome}: rótulos aninhados`)
      for (const t of medidas.titulos) {
        assert.equal(t.fonte, '18px', `${nome}: título ${t.titulo}`)
        assert.equal(t.peso, '600', `${nome}: título ${t.titulo}`)
        if (t.padding !== null) assert.equal(t.padding, '24px', `${nome}: card ${t.titulo}`)
      }
      for (const c of medidas.campos) {
        assert.equal(c.fonte, '14px', `${nome}: fonte do campo`)
        assert.equal(c.borda, '8px', `${nome}: borda do campo`)
      }
      await page.screenshot({ path: join(saida, `${nome}-${largura}.png`) })
      for (const titulo of [
        'Dados do cliente no documento',
        'Nuvem da empresa',
        'Pagamento e emissão'
      ]) {
        const heading = page.getByRole('heading', { name: titulo, exact: true })
        if (await heading.count()) {
          const card = heading.locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]')
          await card.screenshot({ path: join(saida, `${nome}-card-${largura}.png`) })
        }
      }
      resultados.push({ tela: nome, ...medidas })
    }
  }
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await conferir('lista-propostas')
  const proposta = await page.evaluate((id) => window.api.orcamentos.get(id), dados.propostaId)
  await page
    .getByRole('button', { name: `Abrir orçamento Nº ${proposta.numero}`, exact: true })
    .click()
  await page.getByRole('heading', { name: 'Dados do cliente no documento', exact: true }).waitFor()
  await conferir('editor-proposta')
  await page.getByRole('button', { name: 'Versões e transferência', exact: true }).click()
  await page.frameLocator('iframe[title="Prévia da versão"]').locator('body').waitFor()
  await conferir('linha-tempo')
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).last().click()
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
  await conferir('lista-relatorios')
  const relatorio = await page.evaluate((id) => window.api.relatorios.get(id), dados.relatorioId)
  await page
    .getByRole('button', { name: `Abrir relatório Nº ${relatorio.numero}`, exact: true })
    .click()
  await page.getByRole('heading', { name: 'Dados do relatório', exact: true }).waitFor()
  await conferir('editor-relatorio')
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  await conferir('previa-relatorio')
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByText('Recebido', { exact: true }).waitFor()
  await conferir('lista-recibos')
  await page.getByRole('button', { name: 'Novo recibo', exact: true }).click()
  await conferir('editor-recibo')
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  await conferir('lista-clientes')
  await page.getByRole('button', { name: '+ Novo cliente', exact: true }).first().click()
  await conferir('cadastro-cliente')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('tab', { name: 'Catálogo de serviços', exact: true }).click()
  await conferir('catalogo-servicos')
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  for (const [aba, nome] of [
    ['Empresa / Cabeçalho', 'config-empresa'],
    ['Parâmetros financeiros', 'config-parametros'],
    ['Observações padrão', 'config-observacoes'],
    ['Formas de pagamento', 'config-pagamentos'],
    ['Numeração', 'config-numeracao'],
    ['Dados e backup', 'config-backup'],
    ['Nuvem / Sincronização', 'config-nuvem'],
    ['IA local', 'config-ia']
  ]) {
    await page.getByRole('tab', { name: aba, exact: true }).click()
    await page.locator('h2').first().waitFor()
    await conferir(nome)
  }
  assert.deepEqual(erros, [])
  writeFileSync(join(saida, 'medidas.json'), JSON.stringify({ resultados, erros }, null, 2))
  console.log(`ESTILOS CONFERIDOS: ${resultados.length} telas/tamanhos · ${saida}`)
} finally {
  await app.close()
}
