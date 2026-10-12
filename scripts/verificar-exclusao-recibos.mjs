// Exclusão em uma cópia do perfil sintético, sem tocar em documentos do usuário.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const base = resolve('output/playwright')
const origem = resolve(process.argv[2] ?? '')
assert.ok(origem.startsWith(base + sep))
const dados = JSON.parse(readFileSync(join(origem, 'resultado.json'), 'utf8'))
const saida = join(base, `exclusao-recibos-${Date.now()}`)
mkdirSync(saida, { recursive: true })
cpSync(join(origem, 'perfil'), join(saida, 'perfil'), { recursive: true })
const app = await electron.launch({
  ...(process.argv[3] ? { executablePath: resolve(process.argv[3]) } : { args: ['.'] }),
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
const erros = []
try {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('heading', { name: 'Orçamentos', exact: true }).waitFor()
  const casos = await page.evaluate(async ({ relatorioId }) => {
    const criar = (status, descricao, vinculo = false) =>
      window.api.recibos.create({
        data: '2026-10-11',
        destinatario: 'Cliente da exclusão',
        descricao,
        valor: 137.45,
        local: 'Rio Verde - GO',
        formaPagamento: 'Pix',
        quitacao: 'parcial',
        status,
        observacao: '',
        ...(vinculo ? { origemTipo: 'relatorio', origemId: relatorioId } : {})
      })
    const rascunho = await criar('rascunho', 'Rascunho da exclusão')
    const pendente = await criar('pendente', 'Cobrança da exclusão')
    const cancelado = await criar('pendente', 'Cancelado da exclusão')
    await window.api.recibos.confirmar(cancelado.id)
    await window.api.recibos.cancelar(cancelado.id)
    const saldoAntes = (await window.api.relatorios.get(relatorioId)).totais.saldo
    const vinculado = await criar('pendente', 'Recebido de relatório', true)
    await window.api.recibos.confirmar(vinculado.id)
    const editor = await criar('pendente', 'Avulso do editor')
    await window.api.recibos.confirmar(editor.id)
    return { rascunho, pendente, cancelado, vinculado, editor, saldoAntes }
  }, dados)
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  for (const r of [casos.rascunho, casos.pendente, casos.cancelado]) {
    const excluir = page.getByRole('button', { name: `Excluir recibo Nº ${r.numero}`, exact: true })
    await excluir.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert.ok(await page.evaluate((id) => window.api.recibos.get(id), r.id))
    await excluir.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click()
    await excluir.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate((id) => window.api.recibos.get(id), r.id), null)
    assert.ok((await page.evaluate((id) => window.api.versoes.list('recibo', id), r.id)).length > 0)
  }
  const pago = casos.vinculado
  const excluirPago = page.getByRole('button', {
    name: `Excluir recibo Nº ${pago.numero}`,
    exact: true
  })
  await excluirPago.click()
  await page
    .getByRole('dialog')
    .getByText(/O pagamento será estornado na mesma operação/)
    .waitFor()
  await page.screenshot({ path: join(saida, 'confirmacao-excluir-estornar.png') })
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal(
    (await page.evaluate((id) => window.api.recibos.get(id), pago.id)).status,
    'recebido'
  )
  assert.equal(
    (await page.evaluate((id) => window.api.relatorios.get(id), dados.relatorioId)).totais.saldo,
    Math.round((casos.saldoAntes - pago.valor) * 100) / 100
  )
  await excluirPago.click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir e estornar', exact: true })
    .click()
  await excluirPago.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate((id) => window.api.recibos.get(id), pago.id), null)
  assert.equal(
    (await page.evaluate((id) => window.api.relatorios.get(id), dados.relatorioId)).totais.saldo,
    casos.saldoAntes
  )
  const versoes = await page.evaluate((id) => window.api.versoes.list('recibo', id), pago.id)
  assert.equal(versoes[0].documento.status, 'cancelado')
  const recebido = versoes.find((v) => v.documento.status === 'recebido')
  assert.ok(
    (await page.evaluate((id) => window.api.versoes.html(id), recebido.id)).includes(
      'Recibo de pagamento'
    )
  )
  await page.evaluate((id) => window.api.recibos.remove(id, true), pago.id)
  assert.equal(
    (await page.evaluate((id) => window.api.relatorios.get(id), dados.relatorioId)).totais.saldo,
    casos.saldoAntes
  )

  await page
    .getByRole('button', { name: `Abrir recibo Nº ${casos.editor.numero}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir e estornar', exact: true })
    .click()
  await page.getByRole('button', { name: 'Novo recibo', exact: true }).waitFor()
  assert.equal(await page.evaluate((id) => window.api.recibos.get(id), casos.editor.id), null)
  assert.equal(
    (await page.evaluate((id) => window.api.relatorios.get(id), dados.relatorioId)).totais.saldo,
    casos.saldoAntes
  )
  const proximo = await page.evaluate(() =>
    window.api.recibos.create({
      data: '2026-10-11',
      destinatario: 'Novo',
      descricao: 'Novo',
      valor: 0,
      local: '',
      formaPagamento: 'Pix',
      status: 'rascunho',
      quitacao: 'parcial',
      observacao: ''
    })
  )
  assert.ok(proximo.numero > casos.editor.numero)
  await page.screenshot({ path: join(saida, 'historico-apos-exclusao.png') })
  assert.deepEqual(erros, [])
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify({ casos, proximo: proximo.numero, erros }, null, 2)
  )
  console.log(JSON.stringify({ saida, casos: 5, erros }))
} finally {
  await app.close()
}
