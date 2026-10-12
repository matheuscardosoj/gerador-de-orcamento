// Validação do Electron real em perfil descartável. Nunca abre o banco de uso.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import sharp from 'sharp'

const saida = resolve('output/playwright', `validacao-${Date.now()}`)
mkdirSync(join(saida, 'documentos'), { recursive: true })
const foto = join(saida, 'foto-complexa.png')
await sharp(randomBytes(2400 * 1800 * 3), { raw: { width: 2400, height: 1800, channels: 3 } })
  .png()
  .toFile(foto)
const executablePath = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath,
  args: executablePath ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
const erros = []
try {
  await app.evaluate(
    ({ app, dialog }, dir) => {
      app.setPath('documents', dir)
      dialog.showSaveDialog = async (opcoes) => ({ canceled: false, filePath: opcoes.defaultPath })
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    },
    join(saida, 'documentos')
  )
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).first().click()
  await page
    .getByLabel('Nome / razão social (obrigatório)', { exact: true })
    .fill('Cliente somente nome')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('Cliente somente nome', { exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.api.clientes.list()))[0].documento ?? '', '')
  const cliente = await page.evaluate(() =>
    window.api.clientes.create({
      nome: 'Fazenda São João e Administração de Propriedades Rurais com Nome Extenso para Validação',
      tipoPessoa: 'pj',
      documento: '00.000.000/E08G-12',
      telefone: '(64) 99999-9999',
      email: 'cliente@example.com',
      nomeFantasia: 'Fazenda São João',
      pessoaContato: 'Pessoa de Contato',
      tratamento: 'A',
      ativo: true,
      endereco: {
        logradouro: 'Rua das Árvores',
        numero: '123',
        complemento: 'Sala 2',
        bairro: 'Centro',
        cidade: 'Rio Verde',
        uf: 'GO',
        cep: '75900-000'
      }
    })
  )
  const logo = `data:image/png;base64,${readFileSync('build/logo-vs.png').toString('base64')}`
  await page.evaluate(
    (logoDataUrl) =>
      window.api.empresa.save({
        logoDataUrl,
        nome: 'Empresa de Teste',
        razaoSocial: 'Empresa de Serviços Ltda.',
        endereco: 'Rua Exemplo, 10, Rio Verde - GO',
        cnpj: '04.871.989/0001-60',
        telefones: '(64) 99999-0000',
        email: 'empresa@example.com',
        textoAssinatura: 'Empresa de Serviços Ltda.',
        camposClientePadrao: ['documento', 'endereco', 'telefone', 'email', 'pessoaContato']
      }),
    logo
  )
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page.getByRole('button', { name: 'Novo orçamento', exact: true }).first().click()
  const seletorCliente = page.getByLabel('Cliente cadastrado', { exact: true })
  await seletorCliente.selectOption(cliente.id)
  await page.getByRole('button', { name: 'Com cálculo', exact: true }).click()
  await page.getByLabel('Descrição do serviço', { exact: true }).fill('Corte de árvore com Munck')
  await page.getByRole('button', { name: 'Custo', exact: true }).click()
  await page.getByRole('button', { name: 'Custo', exact: true }).click()
  const descricoes = page.getByPlaceholder('Descrição', { exact: true })
  await descricoes.nth(0).fill('Serviço próprio')
  await descricoes.nth(1).fill('Munck')
  const custos = descricoes.locator('..').locator('input[type=number]')
  await custos.nth(0).fill('1000')
  await custos.nth(1).fill('1600')
  await page.getByLabel('Aplicar acréscimo de lucro').nth(1).uncheck()
  const nota = page.getByLabel('Emitir nota fiscal')
  if (await nota.isChecked()) await nota.uncheck()
  await page.screenshot({ path: join(saida, 'calculo-repasses.png'), fullPage: true })
  await page.getByRole('button', { name: 'Usar no orçamento', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles(foto)
  await page.getByRole('img', { name: 'foto-complexa', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('button', { name: 'Versões e transferência', exact: true }).waitFor()
  let proposta = (await page.evaluate(() => window.api.orcamentos.list()))[0]
  proposta = await page.evaluate((id) => window.api.orcamentos.get(id), proposta.id)
  assert.equal(proposta.itensServico[0].valorTotal, 2900)
  assert.ok(proposta.anexos[0].largura <= 1600)
  const fotoSalva = await page.evaluate((id) => window.api.anexos.imagem(id), proposta.anexos[0].id)
  assert.ok(Buffer.from(fotoSalva.split(',')[1], 'base64').length <= 250 * 1024)
  assert.ok(
    Buffer.from(proposta.anexos[0].miniaturaDataUrl.split(',')[1], 'base64').length <= 20 * 1024
  )
  const extras = Array.from({ length: 16 }, (_, i) => ({
    id: randomUUID(),
    descricao: `Serviço complementar ${i + 1}: execução conforme escopo acordado, incluindo organização da área e acompanhamento da atividade.`,
    unidade: 'serviço',
    quantidade: 1,
    valorUnitario: 50,
    valorTotal: 50
  }))
  proposta = await page.evaluate(
    ({ p, extras }) =>
      window.api.orcamentos.update(p.id, {
        itensServico: [...p.itensServico, ...extras],
        anexos: p.anexos.map((a) => ({ ...a, itemServicoId: p.itensServico[0].id })),
        observacoes: [
          {
            id: 'obs',
            texto:
              'Documento de teste. Esta proposta inclui despesas repassadas sem acréscimo de lucro e fotos em base64.'
          }
        ],
        valorTotal: 3700
      }),
    { p: proposta, extras }
  )
  // Reabrir garante que a prévia use exatamente a versão persistida.
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page
    .getByRole('button', { name: `Abrir orçamento Nº ${proposta.numero}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  await page
    .frameLocator('iframe[title="Prévia"]')
    .getByText('Proposta de Serviço', { exact: true })
    .waitFor()
  await page.screenshot({ path: join(saida, 'previa-proposta.png'), fullPage: true })
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  const arquivos = []
  for (const metodo of ['gerarPdf', 'gerarDocx'])
    arquivos.push(
      (
        await page.evaluate(({ id, metodo }) => window.api.documentos[metodo](id), {
          id: proposta.id,
          metodo
        })
      ).caminho
    )
  const relatorio = await page.evaluate(
    (id) => window.api.relatorios.criarDeOrcamento(id),
    proposta.id
  )
  for (const metodo of ['gerarRelatorioPdf', 'gerarRelatorioDocx'])
    arquivos.push(
      (
        await page.evaluate(({ id, metodo }) => window.api.documentos[metodo](id), {
          id: relatorio.id,
          metodo
        })
      ).caminho
    )
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByRole('button', { name: 'Novo recibo', exact: true }).click()
  await page.getByLabel('Vínculo', { exact: true }).selectOption('relatorio')
  await page.getByLabel('Documento de origem', { exact: true }).selectOption(relatorio.id)
  await page.getByLabel('Valor', { exact: true }).fill('200')
  await page.getByLabel('Local do pagamento', { exact: true }).fill('Rio Verde - GO')
  await page.getByLabel('Estado', { exact: true }).selectOption('pendente')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  let recibo = (await page.evaluate(() => window.api.recibos.list()))[0]
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  await page
    .frameLocator('iframe[title="Recibo"]')
    .locator('body[data-recibo-paginado="true"]')
    .waitFor()
  assert.equal(
    await page.frameLocator('iframe[title="Recibo"]').locator('.recibo-pagina').count(),
    1
  )
  await page
    .frameLocator('iframe[title="Recibo"]')
    .getByRole('img', { name: 'Logo da empresa' })
    .waitFor()
  assert.ok(
    await page
      .frameLocator('iframe[title="Recibo"]')
      .locator('.recibo-assinatura')
      .evaluate((el) => {
        return parseFloat(getComputedStyle(el).marginTop) >= (18 * 96) / 25.4 - 1
      })
  )
  await page.screenshot({ path: join(saida, 'previa-cobranca.png'), fullPage: true })
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  for (const metodo of ['gerarReciboPdf', 'gerarReciboDocx'])
    arquivos.push(
      (
        await page.evaluate(({ id, metodo }) => window.api.documentos[metodo](id), {
          id: recibo.id,
          metodo
        })
      ).caminho
    )
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar recebimento', exact: true })
    .click()
  await page
    .getByText('Recebimento confirmado. O documento está preservado.', { exact: true })
    .waitFor()
  recibo = await page.evaluate((id) => window.api.recibos.get(id), recibo.id)
  assert.equal(recibo.status, 'recebido')
  assert.equal(
    (await page.evaluate((id) => window.api.relatorios.get(id), relatorio.id)).totais.saldo,
    3500
  )
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  await page
    .frameLocator('iframe[title="Recibo"]')
    .locator('body[data-recibo-paginado="true"]')
    .waitFor()
  assert.equal(
    await page.frameLocator('iframe[title="Recibo"]').locator('.recibo-pagina').count(),
    1
  )
  await page.screenshot({ path: join(saida, 'previa-recibo.png'), fullPage: true })
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  for (const metodo of ['gerarReciboPdf', 'gerarReciboDocx'])
    arquivos.push(
      (
        await page.evaluate(({ id, metodo }) => window.api.documentos[metodo](id), {
          id: recibo.id,
          metodo
        })
      ).caminho
    )
  for (const caminho of arquivos) assert.ok(readFileSync(caminho).length > 1000)
  assert.equal(erros.length, 0)
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify(
      { arquivos, propostaId: proposta.id, relatorioId: relatorio.id, reciboId: recibo.id, erros },
      null,
      2
    )
  )
  console.log('VALIDAÇÃO CONCLUÍDA:', saida)
} finally {
  await app.close()
}
