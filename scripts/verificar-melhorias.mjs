// Novos fluxos em perfil isolado; nenhum acesso à instalação de uso.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const pasta = resolve('output/playwright', `melhorias-${Date.now()}`)
mkdirSync(pasta, { recursive: true })
const exe = process.argv[2] ? resolve(process.argv[2]) : undefined
const lancar = () =>
  electron.launch({
    executablePath: exe,
    args: exe ? [] : ['.'],
    env: { ...process.env, GERADOR_USER_DATA_DIR: join(pasta, 'perfil') }
  })
let app = await lancar()
const erros = []
let resultado
async function arrastar(page, de, ate) {
  await de.scrollIntoViewIfNeeded()
  const a = await de.boundingBox(),
    b = await ate.boundingBox()
  assert.ok(a && b)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.up()
  // O sensor remove a captura do clique após o fim do gesto.
  await page.waitForTimeout(120)
}
try {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1
  })
  let page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  const ids = await page.evaluate(async () => {
    const cliente = await window.api.clientes.create({
      nome: 'São João',
      tratamento: 'A',
      ativo: true
    })
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const p = await window.api.orcamentos.create({
      clienteId: cliente.id,
      destinatario: cliente.nome,
      data: '2026-10-11',
      formato: 'carta',
      titulo: 'Proposta de Serviço',
      introducao: 'Serviços conforme a visita.',
      itensServico: [
        {
          id: 's1',
          descricao: 'Corte de 3 árvores',
          unidade: 'serviço',
          quantidade: 1,
          valorUnitario: 3000,
          valorTotal: 3000
        },
        {
          id: 's2',
          descricao: 'Limpeza da área',
          unidade: 'serviço',
          quantidade: 1,
          valorUnitario: 500,
          valorTotal: 500
        }
      ],
      materiais: [
        { id: 'm1', especificacao: 'Material um', quantidade: 1, unidade: 'unidade' },
        { id: 'm2', especificacao: 'Material dois', quantidade: 2, unidade: 'unidade' }
      ],
      observacoes: [
        { id: 'o1', texto: 'Observação um' },
        { id: 'o2', texto: 'Observação dois' }
      ],
      pagamentos: [
        { id: 'p1', texto: 'Pagamento um' },
        { id: 'p2', texto: 'Pagamento dois' }
      ],
      anexos: [
        {
          id: 'a1',
          titulo: 'Foto um',
          descricao: '',
          mime: 'image/png',
          largura: 1,
          altura: 1,
          imagemDataUrl: png,
          itemServicoId: 's1'
        },
        {
          id: 'a2',
          titulo: 'Foto dois',
          descricao: '',
          mime: 'image/png',
          largura: 1,
          altura: 1,
          imagemDataUrl: png,
          itemServicoId: 's2'
        }
      ],
      valorTotal: 3500,
      status: 'rascunho'
    })
    const rel = await window.api.relatorios.criarDeOrcamento(p.id)
    return { p: p.id, rel: rel.id, numero: p.numero, cliente: cliente.id }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  const antes = await page.evaluate(async () => ({
    n: (await window.api.recibos.list()).length,
    proximo: await window.api.orcamentos.proximoNumero()
  }))
  await page
    .getByRole('button', {
      name: `Gerar recibo / cobrança do orçamento Nº ${ids.numero}`,
      exact: true
    })
    .click()
  await page.getByLabel('Nome ou razão social', { exact: true }).waitFor()
  assert.equal(
    await page.getByLabel('Nome ou razão social', { exact: true }).inputValue(),
    'São João'
  )
  assert.equal(Number(await page.getByLabel('Valor', { exact: true }).inputValue()), 3500)
  assert.equal((await page.evaluate(() => window.api.recibos.list())).length, antes.n)
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click()
  await page.getByRole('heading', { name: 'Alterações não salvas', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continuar editando', exact: true }).click()
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
  await page
    .getByRole('button', { name: 'Gerar recibo / cobrança do relatório Nº 1', exact: true })
    .click()
  await page.getByLabel('Nome ou razão social', { exact: true }).waitFor()
  assert.equal(Number(await page.getByLabel('Valor', { exact: true }).inputValue()), 3500)
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
  await page.getByLabel('Buscar orçamentos').fill(' JOAO corte 000001 3500,00 ')
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByLabel('Valor máximo', { exact: true }).fill('3000')
  await page.getByText('Nenhum documento encontrado', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  await page.getByRole('button', { name: 'Colunas', exact: true }).click()
  await page.getByLabel('Resumo dos serviços', { exact: true }).check()
  await page.getByLabel('Versão', { exact: true }).check()
  const dialog = page.getByRole('dialog', { name: 'Colunas do histórico' })
  const handles = dialog.getByRole('button', { name: 'Arrastar para reordenar' })
  await arrastar(page, handles.nth(0), handles.nth(1))
  await page.getByRole('button', { name: 'Concluir', exact: true }).click()
  await page.getByLabel('Buscar orçamentos').fill('São João')
  await page.getByRole('button', { name: 'Abrir orçamento Nº 1', exact: true }).click()
  const alcas = page.getByRole('button', { name: 'Arrastar para reordenar' })
  assert.equal(await alcas.count(), 10)
  await arrastar(page, alcas.nth(0), alcas.nth(1))
  await alcas.nth(2).scrollIntoViewIfNeeded()
  await alcas.nth(2).focus()
  await page.keyboard.press('Space')
  await page.waitForSelector('[data-arrastando="true"]')
  await page.waitForTimeout(50)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(100)
  await page.keyboard.press('Space')
  await page.waitForTimeout(100)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  const salvo = await page.evaluate((id) => window.api.orcamentos.get(id), ids.p)
  assert.deepEqual(
    salvo.itensServico.map((i) => i.id),
    ['s2', 's1']
  )
  assert.deepEqual(
    salvo.materiais.map((i) => i.id),
    ['m2', 'm1']
  )
  assert.equal(salvo.valorTotal, 3500)
  assert.equal(salvo.anexos[0].itemServicoId, 's1')
  await alcas.nth(4).scrollIntoViewIfNeeded()
  await alcas.nth(4).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  await page.getByRole('button', { name: 'Editar serviço Corte de 3 árvores', exact: true }).click()
  const descricao = page.getByLabel('Descrição do serviço', { exact: true })
  await descricao.fill('Cortar 3 árvores por R$ 1.600,00.')
  await page.evaluate(() => window.api.ia.save({ modo: 'desligada' }))
  await page.getByRole('button', { name: 'Revisar com IA', exact: true }).last().click()
  await page.getByText(/A IA está desativada/).waitFor()
  await page
    .getByRole('dialog', { name: 'Revisão do texto com IA' })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click()
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ia.revisarTexto')
    ipcMain.handle('ia.revisarTexto', async () => {
      await new Promise((r) => setTimeout(r, 350))
      return 'Corte de 3 árvores por R$ 1.600,00.'
    })
  })
  await page.getByRole('button', { name: 'Revisar com IA', exact: true }).last().click()
  await descricao.fill('Texto editado durante a revisão, 3 árvores.')
  const revisao = page.getByRole('dialog', { name: 'Revisão do texto com IA' })
  await revisao.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await page.getByRole('heading', { name: 'O texto foi alterado', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Manter texto atual', exact: true }).click()
  assert.equal(await descricao.inputValue(), 'Texto editado durante a revisão, 3 árvores.')
  await revisao.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await page.getByRole('button', { name: 'Substituir pelo texto revisado', exact: true }).click()
  assert.equal(await descricao.inputValue(), 'Corte de 3 árvores por R$ 1.600,00.')
  await page
    .getByRole('dialog', { name: 'Editar serviço', exact: true })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click()
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  if (await page.getByRole('button', { name: 'Descartar alterações', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.screenshot({ path: join(pasta, 'historico-1024.png') })
  const prefs = await page.evaluate(() => window.api.preferencias.historico('orcamento'))
  assert.equal(prefs.busca, 'São João')
  assert.ok(prefs.colunas.includes('versao'))
  assert.equal(prefs.colunas[0], 'destinatario')
  await app.close()
  app = await lancar()
  page = await app.firstWindow()
  await page.getByLabel('Buscar orçamentos').waitFor()
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Buscar orçamentos"]')?.value === 'São João'
  )
  assert.deepEqual(await page.evaluate(() => window.api.preferencias.historico('orcamento')), prefs)
  assert.equal((await page.evaluate(() => window.api.recibos.list())).length, antes.n)
  assert.deepEqual(erros, [])
  resultado = {
    origens: 2,
    recibosCriadosSemSalvar: 0,
    arrasteMouse: true,
    arrasteTeclado: true,
    cancelamentoArraste: true,
    persistenciaAposReinicio: true,
    buscaAcentosETermos: true,
    revisaoIAConfirmada: true,
    edicaoConcorrenteProtegida: true,
    erros
  }
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(`MELHORIAS CONFERIDAS: ${pasta}`)
} catch (e) {
  try {
    await (await app.firstWindow()).screenshot({ path: join(pasta, 'falha.png') })
  } catch {
    // A falha original deve ser preservada mesmo se a janela já fechou.
  }
  throw e
} finally {
  await app.close()
}
