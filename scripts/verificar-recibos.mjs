// Recibos reais em perfil descartável: logo, assinatura e paginação compartilhada.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const saida = resolve('output/playwright', `recibos-${Date.now()}`)
const documentos = join(saida, 'documentos')
mkdirSync(documentos, { recursive: true })
const logoPng = `data:image/png;base64,${readFileSync('build/logo-vs.png').toString('base64')}`
const logoJpeg = `data:image/jpeg;base64,${(await sharp('build/logo-vs.png').resize(420, 120, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).jpeg().toBuffer()).toString('base64')}`
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
const resultados = []
const erros = []
try {
  await app.evaluate(({ app, dialog }, dir) => {
    app.setPath('documents', dir)
    dialog.showSaveDialog = async (opcoes) => ({ canceled: false, filePath: opcoes.defaultPath })
  }, documentos)
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('button', { name: 'Recibos', exact: true }).waitFor()
  const nomes = ['Cliente somente nome', 'Cliente do recibo extenso', 'Cliente com logo horizontal']
  const textos = [
    'Corte de árvore e limpeza da área, conforme serviço acordado.',
    Array.from(
      { length: 24 },
      (_, i) =>
        `Etapa ${i + 1}: execução do serviço de poda e organização da área, com acompanhamento das atividades e retirada dos resíduos conforme o escopo acordado.`
    ).join('\n'),
    'Manutenção e limpeza da área.'
  ]
  for (let caso = 0; caso < nomes.length; caso++) {
    await app.evaluate(
      ({ BrowserWindow }, largura) => {
        const janela = BrowserWindow.getAllWindows()[0]
        janela.unmaximize()
        janela.setContentSize(largura, 900)
      },
      caso === 1 ? 1440 : 1024
    )
    await page.evaluate(
      (logoDataUrl) =>
        window.api.empresa.save({
          nome: 'VS Prestadora de Serviços',
          razaoSocial: 'Empresa de Serviços Ltda.',
          endereco: 'Rua Exemplo, 10, Rio Verde - GO',
          cnpj: '04.871.989/0001-60',
          telefones: '(64) 99999-0000',
          email: 'empresa@example.com',
          textoAssinatura: 'Empresa de Serviços Ltda.',
          logoDataUrl
        }),
      caso === 2 ? logoJpeg : logoPng
    )
    let recibo = await page.evaluate(
      ({ nome, texto, caso }) =>
        window.api.recibos.create({
          data: '2026-10-11',
          destinatario: nome,
          descricao: texto,
          valor: 3978.95,
          local: 'Rio Verde - GO',
          formaPagamento: 'Pix',
          quitacao: 'total',
          status: 'pendente',
          observacao:
            caso === 1
              ? Array.from(
                  { length: 10 },
                  (_, i) =>
                    `Observação ${i + 1}: os serviços foram realizados conforme a descrição e o acordo entre as partes.`
                ).join('\n')
              : ''
        }),
      { nome: nomes[caso], texto: textos[caso], caso }
    )
    if (caso !== 1)
      recibo = await page.evaluate((id) => window.api.recibos.confirmar(id), recibo.id)
    const versoes = await page.evaluate((id) => window.api.versoes.list('recibo', id), recibo.id)
    // Alterar o cadastro não poderá remover a logo da versão já salva.
    await page.evaluate(() =>
      window.api.empresa.save({ nome: 'Cadastro alterado depois', logoDataUrl: null })
    )
    const htmlAntigo = await page.evaluate((id) => window.api.versoes.html(id), versoes[0].id)
    assert.ok(htmlAntigo.includes('alt="Logo da empresa"'))
    assert.ok(!htmlAntigo.includes('Cadastro alterado depois'))
    await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
    await page.getByRole('button', { name: 'Recibos', exact: true }).click()
    await page.getByLabel('Buscar recibos').fill('Busca sem resultados')
    await page.getByText('Nenhum recibo encontrado', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
    await page
      .getByLabel('Filtrar estado dos recibos')
      .selectOption(caso === 1 ? 'pendente' : 'recebido')
    await page.getByLabel('Buscar recibos').fill(nomes[caso])
    await page.screenshot({ path: join(saida, `lista-${caso + 1}.png`), fullPage: true })
    await page
      .getByRole('button', { name: `Abrir recibo Nº ${recibo.numero}`, exact: true })
      .click()
    await page.getByRole('button', { name: 'Prévia', exact: true }).click()
    const frame = page.frameLocator('iframe[title="Recibo"]')
    await frame.locator('body[data-recibo-paginado="true"]').waitFor()
    const medidas = await frame.locator('body').evaluate((body) => {
      const folhas = [...body.querySelectorAll('.recibo-pagina')]
      const fechamento = body.querySelector('.recibo-fechamento')
      const assinatura = fechamento.querySelector('.recibo-assinatura p')
      const pagamento = fechamento.querySelector('.recibo-pagamento')
      return {
        paginas: folhas.length,
        descricao: [...body.querySelectorAll('.recibo-descricao')]
          .map((el) => el.textContent)
          .join(''),
        observacao: [...body.querySelectorAll('.recibo-observacao-texto')]
          .map((el) => el.textContent)
          .join(''),
        espacoAssinaturaMm:
          ((assinatura.getBoundingClientRect().top - pagamento.getBoundingClientRect().bottom) *
            25.4) /
          96,
        folhas: folhas.map((folha) => ({
          texto: folha.innerText,
          logo: !!folha.querySelector('.recibo-logo')?.naturalWidth,
          excessoMm:
            ((folha.querySelector('.recibo').getBoundingClientRect().bottom -
              folha.getBoundingClientRect().bottom +
              parseFloat(getComputedStyle(folha).paddingBottom)) *
              25.4) /
            96
        }))
      }
    })
    assert.equal(
      medidas.descricao.replace(/\s+/g, ' ').trim(),
      textos[caso].replace(/\s+/g, ' ').trim()
    )
    assert.ok(medidas.espacoAssinaturaMm >= 17.9)
    assert.ok(medidas.folhas.every((p) => p.logo && p.excessoMm < 0))
    assert.ok(medidas.folhas.every((p) => !p.texto.includes('CPF:')))
    assert.equal(
      medidas.folhas.filter((p) => p.texto.includes('Assinatura do prestador')).length,
      1
    )
    if (caso === 1) {
      assert.ok(medidas.paginas > 1)
      assert.ok(medidas.observacao.includes('Observação 10:'))
    } else assert.equal(medidas.paginas, 1)
    await page.screenshot({ path: join(saida, `previa-${caso + 1}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Fechar', exact: true }).click()
    const arquivos = []
    for (const metodo of ['gerarReciboPdf', 'gerarReciboDocx']) {
      const { caminho } = await page.evaluate(
        ({ id, metodo }) => window.api.documentos[metodo](id),
        { id: recibo.id, metodo }
      )
      assert.ok(readFileSync(caminho).length > 1000)
      arquivos.push(caminho)
    }
    resultados.push({ nome: nomes[caso], arquivos, medidas })
  }
  assert.deepEqual(erros, [])
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify({ resultados, erros }, null, 2))
  console.log('RECIBOS VALIDADOS:', saida)
} finally {
  await app.close()
}
