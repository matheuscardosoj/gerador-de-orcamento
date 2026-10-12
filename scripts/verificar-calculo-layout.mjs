// Exercita a composição do preço e a distribuição dos campos no Electron real.
// Usa exclusivamente um perfil novo, sem abrir o banco utilizado pelo usuário.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const pasta = resolve('output/playwright', `calculo-layout-${Date.now()}`)
mkdirSync(pasta, { recursive: true })
const executablePath = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath,
  args: executablePath ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(pasta, 'perfil') }
})
try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Novo orçamento', exact: true }).first().click()
  await page.getByRole('button', { name: 'Com cálculo', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Calcular custo do serviço' })
  await modal.getByLabel('Descrição do serviço', { exact: true }).fill('Execução de serviço')
  const bloco = modal
    .getByRole('heading', { name: 'Outros custos e repasses', exact: true })
    .locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]')
  for (let i = 0; i < 2; i++)
    await bloco.getByRole('button', { name: 'Custo', exact: true }).click()
  await bloco.getByLabel('Descrição', { exact: true }).nth(0).fill('Execução própria')
  await bloco.getByLabel('Descrição', { exact: true }).nth(1).fill('Despesa de terceiro')
  await bloco.getByLabel('Valor do custo (R$)', { exact: true }).nth(0).fill('100')
  await bloco.getByLabel('Valor do custo (R$)', { exact: true }).nth(1).fill('1200')
  await bloco.getByLabel('Aplicar acréscimo de lucro').nth(1).uncheck()
  await modal.getByLabel('Acréscimo sobre o custo (%)', { exact: true }).fill('100')
  await modal.getByLabel('Emitir Nota Fiscal de Serviço').check()
  await modal.getByLabel('Alíquota da nota (%)', { exact: true }).fill('7')
  await modal.getByLabel('Modo do imposto', { exact: true }).selectOption('gross_up')
  const linha = (nome) => modal.getByText(nome, { exact: true }).locator('..')
  assert.match(await linha('Custos com lucro').innerText(), /100,00/)
  assert.match(await linha('Acréscimo de lucro (100%)').innerText(), /100,00/)
  assert.match(await linha('Custos sem lucro').innerText(), /1\.200,00/)
  assert.match(await linha('Subtotal antes do imposto').innerText(), /1\.400,00/)
  assert.match(await linha('Imposto da nota (7%)').innerText(), /105,38/)
  assert.match(await linha('Preço final').innerText(), /1\.505,38/)
  assert.equal(await modal.getByText('Cobrado pelo custo, sem lucro', { exact: true }).count(), 1)
  await bloco.scrollIntoViewIfNeeded()
  const medidas = []
  for (const largura of [1024, 1280, 1440, 1920]) {
    await app.evaluate(({ BrowserWindow }, largura) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.unmaximize()
      w.setContentSize(largura, 1100)
    }, largura)
    await page.waitForFunction((l) => innerWidth === l, largura)
    await bloco.scrollIntoViewIfNeeded()
    const campos = await bloco.locator('input:not([type=checkbox]),select').evaluateAll((els) =>
      els.map((e) => ({
        largura: e.getBoundingClientRect().width,
        altura: e.getBoundingClientRect().height
      }))
    )
    assert.ok(
      campos.every((c) => c.altura >= 36 && c.altura <= 44),
      JSON.stringify(campos)
    )
    assert.ok(
      campos.every((c) => c.largura >= 170),
      JSON.stringify(campos)
    )
    const dimensao = await modal.evaluate((e) => ({
      largura: e.clientWidth,
      conteudo: e.scrollWidth
    }))
    assert.ok(dimensao.conteudo <= dimensao.largura + 1)
    await page.screenshot({ path: join(pasta, `calculo-${largura}.png`) })
    medidas.push({ largura, campos, dimensao })
  }
  // Sem nota, o repasse continua sem lucro; marcar a opção aplica o percentual.
  await modal.getByLabel('Emitir Nota Fiscal de Serviço').uncheck()
  assert.match(await linha('Preço final').innerText(), /1\.400,00/)
  await bloco.getByLabel('Aplicar acréscimo de lucro').nth(1).check()
  assert.match(await linha('Preço final').innerText(), /2\.600,00/)
  assert.equal(await modal.getByText('Custos sem lucro', { exact: true }).count(), 0)
  await bloco.getByLabel('Aplicar acréscimo de lucro').nth(1).uncheck()
  await modal.getByRole('button', { name: 'Usar no orçamento', exact: true }).click()
  await page
    .getByRole('button', { name: 'Editar serviço Execução de serviço', exact: true })
    .click()
  assert.match(await linha('Preço final').innerText(), /1\.400,00/)
  assert.equal(await bloco.getByLabel('Aplicar acréscimo de lucro').nth(1).isChecked(), false)
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify({ medidas, calculos: [1505.38, 1400, 2600], reabertura: true }, null, 2)
  )
  console.log(
    JSON.stringify({
      pasta,
      larguras: medidas.map((m) => m.largura),
      calculos: 'corretos',
      reabertura: true
    })
  )
} finally {
  await app.close()
}
