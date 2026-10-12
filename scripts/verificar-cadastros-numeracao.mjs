// Conferência real em perfil isolado; nunca abre o banco de uso.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'

const pasta = resolve('output/playwright', `cadastros-numeracao-${Date.now()}`)
const perfil = join(pasta, 'perfil')
mkdirSync(join(perfil, 'data'), { recursive: true })
if (process.argv[3]) copyFileSync(resolve(process.argv[3]), join(perfil, 'data/banco.db'))
const executablePath = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath,
  args: executablePath ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
})
const erros = []
try {
  const page = await app.firstWindow()
  const aguardarConsulta = async (consulta, argumento) => {
    const limite = Date.now() + 5000
    while (!(await page.evaluate(consulta, argumento))) {
      assert.ok(Date.now() < limite, 'A consulta assíncrona não confirmou o resultado esperado.')
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  let clientesAntes = await page.evaluate(() => window.api.clientes.list())
  if (!clientesAntes.length) {
    await page.evaluate(() =>
      window.api.clientes.create({
        nome: 'Cliente de validação',
        tipoPessoa: 'pf',
        tratamento: '',
        ativo: true
      })
    )
    await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
    await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
    clientesAntes = await page.evaluate(() => window.api.clientes.list())
  }
  const servicosAntes = await page.evaluate(() => window.api.servicos.list())
  assert.ok(servicosAntes.length >= 2)
  const medidas = []
  for (const largura of [1024, 1440, 2560]) {
    await app.evaluate(({ BrowserWindow }, l) => {
      const janela = BrowserWindow.getAllWindows()[0]
      janela.unmaximize()
      janela.setContentSize(l, 1100)
    }, largura)
    await page.waitForFunction((l) => innerWidth === l, largura)
    await page
      .getByRole('tab', { name: 'Clientes', exact: true })
      .getAttribute('aria-selected')
      .then((v) => assert.equal(v, 'true'))
    await page.locator('main').evaluate((e) => {
      e.scrollTop = 0
    })
    const quadro = page.locator('.data-table-viewport')
    const dimensoes = await quadro.evaluate((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x, direita: r.right, largura: r.width, conteudo: e.scrollWidth }
    })
    assert.ok(dimensoes.direita <= largura)
    const titulo = await page.getByRole('heading', { name: 'Cadastros', exact: true }).boundingBox()
    assert.ok(Math.abs(dimensoes.x - titulo.x) <= 1)
    const acao = await page.getByRole('button', { name: 'Novo cliente', exact: true }).boundingBox()
    assert.ok(acao.y >= 0 && acao.y < 100)
    await page.screenshot({ path: join(pasta, `clientes-${largura}.png`), fullPage: true })
    await page.getByRole('tab', { name: 'Catálogo de serviços', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ===
        'Catálogo de serviços'
    )
    await page.locator('main').evaluate((e) => {
      e.scrollTop = 0
    })
    assert.ok(
      (await page.getByRole('button', { name: 'Novo serviço', exact: true }).boundingBox()).y < 100
    )
    const catalogo = await quadro.evaluate((e) => ({
      largura: e.clientWidth,
      conteudo: e.scrollWidth
    }))
    assert.equal(catalogo.largura, dimensoes.largura)
    await page.screenshot({ path: join(pasta, `servicos-${largura}.png`), fullPage: true })
    medidas.push({ largura, clientes: dimensoes, catalogo })
    await page.getByRole('tab', { name: 'Clientes', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === 'Clientes'
    )
  }
  if (clientesAntes.length) {
    await page
      .getByRole('textbox', { name: 'Buscar clientes' })
      .fill(clientesAntes[0].nome.toUpperCase())
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1)
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click()
  await page
    .getByLabel('Nome / razão social (obrigatório)', { exact: true })
    .fill('Cliente apenas nome')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Editar cliente Cliente apenas nome', exact: true })
    .waitFor()
  const novo = (await page.evaluate(() => window.api.clientes.list())).find(
    (c) => c.nome === 'Cliente apenas nome'
  )
  assert.equal(novo.tipoPessoa, 'pf')
  assert.ok(!novo.documento)

  await page.getByRole('tab', { name: 'Catálogo de serviços', exact: true }).click()
  const ids = servicosAntes.map((s) => s.id)
  const alcas = page.getByRole('button', { name: 'Arrastar para reordenar', exact: true })
  const primeira = await alcas.nth(0).boundingBox()
  const segunda = await alcas.nth(1).boundingBox()
  await page.mouse.move(primeira.x + primeira.width / 2, primeira.y + primeira.height / 2)
  await page.mouse.down()
  await page.mouse.move(segunda.x + segunda.width / 2, segunda.y + segunda.height / 2, {
    steps: 12
  })
  await page.mouse.up()
  const movidos = [ids[1], ids[0], ...ids.slice(2)]
  await aguardarConsulta(
    async (esperados) =>
      JSON.stringify((await window.api.servicos.list()).map((s) => s.id)) ===
      JSON.stringify(esperados),
    movidos
  )
  await page.waitForFunction(
    (nome) =>
      document.querySelector('tbody tr')?.textContent.includes(nome) &&
      !document.querySelector('button[aria-label="Arrastar para reordenar"]')?.disabled,
    servicosAntes[1].nome
  )
  await alcas.first().focus()
  await page.keyboard.press('Space')
  await page.locator('button[data-arrastando="true"]').waitFor()
  // O sensor instala a escuta de teclado no próximo turno; aguarda o render real.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await page.locator('button[data-arrastando="true"]').waitFor({ state: 'detached' })
  assert.deepEqual(
    (await page.evaluate(() => window.api.servicos.list())).map((s) => s.id),
    movidos
  )
  await alcas.first().focus()
  await page.keyboard.press('Space')
  await page.locator('button[data-arrastando="true"]').waitFor()
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() =>
    document.querySelectorAll('tbody tr')[1]?.style.outline.includes('2px')
  )
  await page.keyboard.press('Space')
  await aguardarConsulta(
    async (esperados) =>
      JSON.stringify((await window.api.servicos.list()).map((s) => s.id)) ===
      JSON.stringify(esperados),
    ids
  )
  await page.getByRole('textbox', { name: 'Buscar serviços' }).fill(servicosAntes[0].nome)
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('button[aria-label="Arrastar para reordenar"]')).every(
      (e) => e.disabled
    )
  )
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()

  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.getByRole('tab', { name: 'Numeração dos documentos', exact: true }).click()
  const painel = page
    .getByRole('heading', { name: 'Numeração dos recibos', exact: true })
    .locator('xpath=ancestor::form')
  await painel.getByLabel('Próximo número', { exact: true }).fill('120')
  await painel.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
  await aguardarConsulta(async () => (await window.api.recibos.numeracao()).proximoNumero === 120)
  const estadoAntes = await page.evaluate(() => window.api.recibos.list())
  assert.equal(estadoAntes.length, 0)
  const recibo = await page.evaluate(() =>
    window.api.recibos.create({
      data: '2026-10-12',
      destinatario: 'Cliente apenas nome',
      descricao: 'Serviço de teste',
      valor: 100,
      local: 'Rio Verde',
      formaPagamento: 'Pix',
      status: 'rascunho',
      quitacao: 'parcial',
      observacao: ''
    })
  )
  assert.equal(recibo.numero, 120)
  const ocupacao = await page.evaluate(() => window.api.recibos.definirProximoNumero(120))
  assert.equal(ocupacao.ok, false)
  await page.screenshot({ path: join(pasta, 'numeracao.png'), fullPage: true })
  assert.deepEqual(erros, [])
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify(
      {
        medidas,
        busca: true,
        cadastroSomenteNome: true,
        arrasteMouse: true,
        tecladoECancelamento: true,
        reciboNumero: recibo.numero,
        colisaoRecusada: true,
        erros
      },
      null,
      2
    )
  )
  console.log(
    JSON.stringify({
      pasta,
      larguras: medidas.map((m) => m.largura),
      arrasteMouse: true,
      tecladoECancelamento: true,
      reciboNumero: recibo.numero,
      erros
    })
  )
} finally {
  await app.close()
}
