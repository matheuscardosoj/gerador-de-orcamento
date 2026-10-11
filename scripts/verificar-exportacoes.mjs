// Tabelas extensas e proteção de arquivos existentes, em perfil isolado.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join, basename } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const saida = resolve('output/playwright', `exportacoes-${Date.now()}`)
mkdirSync(join(saida, 'documentos'), { recursive: true })
const executablePath = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath,
  args: executablePath ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
try {
  await app.evaluate(
    ({ app, dialog }, dir) => {
      app.setPath('documents', dir)
      dialog.showSaveDialog = async (opcoes) => ({ canceled: false, filePath: opcoes.defaultPath })
      dialog.showMessageBox = async () => ({ response: 1 })
    },
    join(saida, 'documentos')
  )
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  const proposta = await page.evaluate(async () => {
    await window.api.empresa.save({
      nome: 'Empresa de Teste',
      endereco: 'Rua Exemplo, 10, Curitiba - PR'
    })
    return window.api.orcamentos.create({
      data: '2026-10-11',
      destinatario: 'Fazenda São João / Nome longo para conferir os nomes de arquivos '.repeat(8),
      formato: 'tabela',
      titulo: 'Título personalizado não altera o nome do arquivo',
      itensServico: Array.from({ length: 70 }, (_, i) => ({
        id: `item-${i + 1}`,
        descricao: `Serviço ${i + 1}: manutenção e limpeza conforme escopo acordado, com materiais e equipe especializada.`,
        unidade: 'serviço',
        quantidade: 1,
        valorUnitario: 50,
        valorTotal: 50
      })),
      materiais: [],
      observacoes: [],
      pagamentos: [],
      anexos: [],
      valorTotal: 3500,
      status: 'rascunho'
    })
  })
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page
    .getByRole('button', { name: `Abrir orçamento Nº ${proposta.numero}`, exact: true })
    .click()
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  const frame = page.frameLocator('iframe[title="Prévia"]')
  await frame.locator('body[style*="visibility: visible"]').waitFor()
  const medidas = await frame.locator('body').evaluate((body) => ({
    paginas: body.querySelectorAll('.pagina').length,
    linhas: body.querySelectorAll('tbody tr').length,
    excessos: [...body.querySelectorAll('.pagina')].map((folha) => {
      const limite =
        folha.getBoundingClientRect().bottom - parseFloat(getComputedStyle(folha).paddingBottom)
      return (
        Math.max(
          ...[...folha.querySelector('.proposta').children].map(
            (el) => el.getBoundingClientRect().bottom
          )
        ) - limite
      )
    })
  }))
  assert.equal(medidas.linhas, 70)
  assert.ok(medidas.paginas > 2)
  assert.ok(
    medidas.excessos.every((x) => x <= 1),
    JSON.stringify(medidas)
  )
  await page.screenshot({ path: join(saida, 'tabela-70-servicos.png') })
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
  assert.equal(basename(arquivos[0]).slice(0, -4), basename(arquivos[1]).slice(0, -5))
  assert.ok(basename(arquivos[0]).startsWith('Proposta de Serviço - 000001 - '))
  assert.ok(basename(arquivos[0]).endsWith(' - 2026-10-11 - v001.pdf'))
  const anterior = readFileSync(arquivos[0])
  const copia = (await page.evaluate((id) => window.api.documentos.gerarPdf(id), proposta.id))
    .caminho
  assert.ok(copia.endsWith(' (2).pdf'))
  await app.evaluate(({ dialog }, original) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: original })
    dialog.showMessageBox = async () => ({ response: 0 })
  }, arquivos[0])
  const cancelado = await page.evaluate((id) => window.api.documentos.gerarPdf(id), proposta.id)
  assert.equal(cancelado.caminho, null)
  assert.deepEqual(readFileSync(arquivos[0]), anterior)
  assert.deepEqual(erros, [])
  writeFileSync(
    join(saida, 'resultado.json'),
    JSON.stringify({ arquivos, copia, medidas, substituicaoCancelada: true, erros }, null, 2)
  )
  console.log(`EXPORTAÇÕES CONFERIDAS: ${saida}`)
} finally {
  await app.close()
}
