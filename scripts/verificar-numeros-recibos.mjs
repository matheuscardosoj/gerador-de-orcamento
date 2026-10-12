// Digitação real e pagamentos em cópia sintética; nunca utiliza o perfil do usuário.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const base = resolve('output/playwright')
const origem = resolve(process.argv[2] ?? '')
assert.ok(origem.startsWith(base + sep))
const dados = JSON.parse(readFileSync(join(origem, 'resultado.json'), 'utf8'))
const saida = join(base, `numeros-recibos-${Date.now()}`)
mkdirSync(saida, { recursive: true })
cpSync(join(origem, 'perfil'), join(saida, 'perfil'), { recursive: true })
const app = await electron.launch({
  ...(process.argv[3] ? { executablePath: resolve(process.argv[3]) } : { args: ['.'] }),
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
const erros = [],
  verificacoes = []
try {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('heading', { name: 'Orçamentos', exact: true }).waitFor()
  const proposta = await page.evaluate((id) => window.api.orcamentos.get(id), dados.propostaId)
  const relAntes = await page.evaluate(() => window.api.relatorios.list())
  await page
    .getByRole('button', {
      name: `Gerar recibo / cobrança do orçamento Nº ${proposta.numero}`,
      exact: true
    })
    .click()
  const valor = page.getByLabel('Valor', { exact: true })
  await valor.waitFor()
  await valor.fill('200')
  assert.equal(
    await valor.inputValue(),
    '200',
    'Focar e substituir não pode anexar ao valor sugerido.'
  )
  await valor.fill('1e3')
  assert.equal(await valor.inputValue(), '200', 'Entrada inválida deve preservar o valor anterior.')
  assert.equal(await valor.getAttribute('type'), 'text')
  assert.equal(
    await page.getByLabel('Local do pagamento', { exact: true }).inputValue(),
    'Rio Verde - GO'
  )
  const digitar = async (entrada, esperado) => {
    await valor.click()
    await valor.press('Control+A')
    await valor.press('Backspace')
    await valor.pressSequentially(entrada, { delay: 10 })
    assert.equal(await valor.inputValue(), esperado)
    verificacoes.push({ entrada, esperado })
  }
  await digitar('25591,40', '25.591,40')
  await page.getByLabel('Forma de pagamento', { exact: true }).focus()
  assert.equal(await valor.inputValue(), '25.591,40')
  await digitar('12,', '12,')
  await valor.pressSequentially('50')
  assert.equal(await valor.inputValue(), '12,50')
  await digitar('12.5', '12,5')
  await digitar('a1e+xy2', '12')
  await digitar('1,23456789', '1,23456789')
  await digitar('1234,56', '1.234,56')
  await valor.evaluate((el) => el.setSelectionRange(3, 3))
  await valor.press('9')
  assert.equal(await valor.inputValue(), '12.934,56')
  await digitar('1234,56', '1.234,56')
  await valor.evaluate((el) => el.setSelectionRange(2, 2))
  await valor.press('Backspace')
  assert.equal(await valor.inputValue(), '234,56')
  await valor.press('Control+A')
  await valor.evaluate((el) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text', 'R$ 25.591,40')
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }))
  })
  assert.equal(await valor.inputValue(), '25.591,40')
  await valor.press('Control+A')
  await valor.press('Backspace')
  assert.equal(await valor.inputValue(), '')
  await page.getByLabel('Forma de pagamento', { exact: true }).focus()
  assert.equal(await valor.inputValue(), '0,00')
  await digitar('25591,40', '25.591,40')
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByText(/sem exigir ou alterar um relatório/).waitFor()
  await modal.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click()
  await page
    .getByText('Recebimento confirmado. O documento está preservado.', { exact: true })
    .waitFor()
  const vinculado = (await page.evaluate(() => window.api.recibos.list())).find(
    (r) => r.origemTipo === 'orcamento' && r.origemId === proposta.id && r.status === 'recebido'
  )
  assert.equal(vinculado.valor, 25591.4)
  await page.evaluate((id) => window.api.recibos.confirmar(id), vinculado.id)
  assert.deepEqual(await page.evaluate(() => window.api.relatorios.list()), relAntes)
  await page.screenshot({ path: join(saida, 'recibo-proposta-confirmado.png'), fullPage: true })

  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click()
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.getByRole('tab', { name: 'Numeração', exact: true }).click()
  const inteiro = page.getByLabel('Próximo número', { exact: true }).first()
  await inteiro.fill('1234')
  await inteiro.press('End')
  await inteiro.pressSequentially(',x')
  assert.equal(await inteiro.inputValue(), '1.234')
  assert.equal(await inteiro.getAttribute('inputmode'), 'numeric')
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  const minimo = page.getByLabel('Valor mínimo', { exact: true })
  await minimo.fill('3500,25')
  await minimo.blur()
  assert.equal(await minimo.inputValue(), '3.500,25')
  await minimo.fill('')
  await minimo.blur()
  assert.equal(await minimo.inputValue(), '')
  assert.equal(
    (await page.evaluate(() => window.api.preferencias.historico('orcamento'))).minimo,
    ''
  )

  await page.evaluate(() => window.api.empresa.save({ endereco: '' }))
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByRole('button', { name: 'Novo recibo', exact: true }).click()
  await page
    .getByLabel('Nome ou razão social', { exact: true })
    .fill('Cliente avulso sem relatório')
  await page.getByLabel('Serviço prestado', { exact: true }).fill('Serviço independente')
  await page.getByLabel('Valor', { exact: true }).fill('125,50')
  const quantidadeAntes = (await page.evaluate(() => window.api.recibos.list())).length
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click()
  await page.getByText('Informe o local do pagamento (cidade e UF).', { exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal((await page.evaluate(() => window.api.recibos.list())).length, quantidadeAntes)
  assert.equal(
    await page.getByLabel('Local do pagamento', { exact: true }).getAttribute('aria-invalid'),
    'true'
  )
  assert.ok(!(await page.locator('main').innerText()).includes('remote method'))
  await page.screenshot({ path: join(saida, 'local-faltante.png'), fullPage: true })
  await page.getByLabel('Local do pagamento', { exact: true }).fill('Rio Verde - GO')
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar recebimento', exact: true })
    .click()
  await page
    .getByText('Recebimento confirmado. O documento está preservado.', { exact: true })
    .waitFor()
  const avulso = (await page.evaluate(() => window.api.recibos.list())).find(
    (r) => r.destinatario === 'Cliente avulso sem relatório'
  )
  assert.equal(avulso.valor, 125.5)
  assert.equal(avulso.origemTipo ?? null, null)
  assert.equal(avulso.status, 'recebido')
  assert.deepEqual(await page.evaluate(() => window.api.relatorios.list()), relAntes)
  assert.equal(await page.locator('input[type=number]').count(), 0)
  assert.deepEqual(erros, [])
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify({ verificacoes, vinculado, avulso, erros }, null, 2)
  )
  console.log(JSON.stringify({ saida, vinculado: vinculado.id, avulso: avulso.id, erros }))
} finally {
  await app.close()
}
