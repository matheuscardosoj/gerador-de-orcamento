// Todas as colunas dos três históricos, sempre em uma cópia de um perfil sintético.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const base = resolve('output/playwright')
const origem = resolve(process.argv[2] ?? '')
assert.ok(origem.startsWith(base + sep), 'Informe um perfil sintético em output/playwright.')
assert.ok(JSON.parse(readFileSync(join(origem, 'resultado.json'), 'utf8')).reciboId)
const saida = join(base, `colunas-${Date.now()}`)
mkdirSync(saida, { recursive: true })
cpSync(join(origem, 'perfil'), join(saida, 'perfil'), { recursive: true })
const colunas = {
  orcamento: [
    'data',
    'destinatario',
    'valor',
    'status',
    'servicos',
    'anotacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ],
  relatorio: [
    'data',
    'destinatario',
    'origem',
    'servicosValor',
    'valor',
    'status',
    'servicos',
    'anotacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ],
  recibo: [
    'data',
    'destinatario',
    'valor',
    'status',
    'descricao',
    'origem',
    'formaPagamento',
    'quitacao',
    'criadoEm',
    'atualizadoEm',
    'versao'
  ]
}
const app = await electron.launch({
  ...(process.argv[3] ? { executablePath: resolve(process.argv[3]) } : { args: ['.'] }),
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(saida, 'perfil') }
})
const resultados = []
const erros = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => erros.push(e.message))
  await page.getByRole('heading', { name: 'Orçamentos', exact: true }).waitFor()
  await page.evaluate(async (colunas) => {
    for (const tipo of Object.keys(colunas)) {
      await window.api.preferencias.salvarHistorico(tipo, {
        busca: '',
        campo: 'numero',
        direcao: 'desc',
        estado: '',
        de: '',
        ate: '',
        minimo: '',
        maximo: '',
        saldo: '',
        origem: '',
        colunas: colunas[tipo]
      })
    }
  }, colunas)
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click()
  for (const [tipo, nome] of [
    ['orcamento', 'Orçamentos'],
    ['relatorio', 'Relatórios'],
    ['recibo', 'Recibos']
  ]) {
    await page.getByRole('button', { name: nome, exact: true }).click()
    await page.locator('.data-table thead th').last().waitFor()
    await page.waitForFunction(
      (n) => document.querySelectorAll('.data-table thead th').length === n,
      colunas[tipo].length + 2
    )
    for (const largura of [1024, 1440, 1920, 2560]) {
      await app.evaluate(({ BrowserWindow }, largura) => {
        const janela = BrowserWindow.getAllWindows()[0]
        janela.unmaximize()
        janela.setContentSize(largura, 900)
      }, largura)
      await page.waitForFunction((n) => Math.abs(innerWidth - n) <= 2, largura)
      for (const fim of [false, true]) {
        await page.locator('.data-table-viewport').evaluate((el, fim) => {
          el.scrollLeft = fim ? el.scrollWidth : 0
        }, fim)
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        )
        const medidas = await page.evaluate(() => {
          const viewport = document.querySelector('.data-table-viewport')
          const tabela = viewport.querySelector('table')
          const limites = viewport.getBoundingClientRect()
          const celulas = [...tabela.querySelectorAll('tr')].map((tr) => {
            const primeira = tr.firstElementChild.getBoundingClientRect()
            const ultima = tr.lastElementChild.getBoundingClientRect()
            return {
              altura: tr.getBoundingClientRect().height,
              numeroVisivel:
                primeira.left >= limites.left - 1 && primeira.right <= limites.right + 1,
              acoesVisiveis: ultima.left >= limites.left - 1 && ultima.right <= limites.right + 1
            }
          })
          return {
            largura: innerWidth,
            pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            main:
              document.querySelector('main').scrollWidth -
              document.querySelector('main').clientWidth,
            larguraTabela: tabela.getBoundingClientRect().width,
            larguraDisponivel: viewport.clientWidth,
            excessoTabela: viewport.scrollWidth - viewport.clientWidth,
            scroll: viewport.scrollLeft,
            celulas,
            textos: [...tabela.querySelectorAll('tbody .line-clamp-2')].map((el) => ({
              display: getComputedStyle(el).display,
              clamp: getComputedStyle(el).webkitLineClamp,
              altura: el.getBoundingClientRect().height,
              completo: el.title
            }))
          }
        })
        assert.ok(
          medidas.pagina <= 1 && medidas.main <= 1,
          `${nome}/${largura}: página transbordou`
        )
        assert.ok(
          medidas.larguraDisponivel >= largura - 310,
          `${nome}: espaço da janela desperdiçado`
        )
        assert.ok(medidas.larguraTabela >= medidas.larguraDisponivel - 1)
        if (largura === 2560)
          assert.equal(medidas.excessoTabela, 0, `${nome}: deveria caber na janela larga`)
        if (largura === 1024) assert.ok(medidas.excessoTabela > 0)
        if (fim && medidas.excessoTabela > 0) assert.ok(medidas.scroll > 0)
        for (const linha of medidas.celulas) {
          assert.ok(
            linha.numeroVisivel && linha.acoesVisiveis,
            `${nome}: número/ações inacessíveis`
          )
          assert.ok(linha.altura <= 110, `${nome}: linha com altura excessiva`)
        }
        for (const texto of medidas.textos) {
          // Chromium recente normaliza o display legado do line-clamp como flow-root.
          assert.ok(['-webkit-box', 'flow-root'].includes(texto.display))
          assert.equal(texto.clamp, '2')
          assert.ok(texto.altura <= 41)
        }
        resultados.push({ tipo, fim, ...medidas })
        if (!fim) await page.screenshot({ path: join(saida, `${tipo}-${largura}.png`) })
      }
    }
  }
  assert.deepEqual(erros, [])
  writeFileSync(join(saida, 'resultado.json'), JSON.stringify({ resultados, erros }, null, 2))
  console.log(JSON.stringify({ saida, verificacoes: resultados.length, erros }))
} finally {
  await app.close()
}
