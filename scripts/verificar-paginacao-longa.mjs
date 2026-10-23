// Verifica em layout real (Electron oculto) que blocos mais altos que uma folha —
// introdução, descrição de serviço e lista de observações longas — são divididos
// pelo paginador sem estourar a folha, sem perder palavras e com o mesmo número
// de folhas no PDF. Uso: node scripts/verificar-paginacao-longa.mjs
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const raiz = resolve(import.meta.dirname, '..')
const pasta = mkdtempSync(join(tmpdir(), 'gdo-paginacao-'))
const importar = (arquivo) => JSON.stringify(join(raiz, 'src/shared/documento', arquivo))

writeFileSync(
  join(pasta, 'entrada.ts'),
  `import { gerarHtmlOrcamento } from ${importar('template')}
import { paginarDocumento } from ${importar('paginar')}
const texto = (n: number, ini = 0): string =>
  Array.from({ length: n }, (_, i) => 'palavra' + ((i + ini) % 97)).join(' ')
export function html(): string {
  const empresa: any = { nome: 'VS PRESTADORA', razaoSocial: 'V S', endereco: 'Rio Verde - GO', telefones: '1', email: 'x@y.com', site: '', cnpj: '1', logoDataUrl: null, textoAssinatura: 'V S', corFaixaRodape: '#0f6d6b', nomeExibicao: 'nome' }
  const orc: any = {
    id: '1', numero: 1, data: '2026-05-04T12:00:00', clienteId: null, destinatario: 'A TMG,',
    formato: 'carta', titulo: 'Proposta', introducao: texto(1500),
    itensServico: [{ id: 'a', descricao: texto(900, 5), unidade: 'm', quantidade: 2, valorUnitario: 8, valorTotal: 16, calculo: null }],
    materiais: [],
    observacoes: Array.from({ length: 70 }, (_, i) => ({ id: 'o' + i, texto: 'Obs ' + (i + 1) + ' ' + texto(25, i) })),
    pagamentos: [{ id: 'p', texto: 'Via Pix.' }], anexos: [], prazoDias: 10, observacaoInterna: '',
    valorTotal: 16, status: 'rascunho', criadoEm: '', atualizadoEm: ''
  }
  return gerarHtmlOrcamento(orc, empresa)
}
export { paginarDocumento }
`
)
await build({
  entryPoints: [join(pasta, 'entrada.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(pasta, 'bundle.cjs'),
  logLevel: 'error'
})
writeFileSync(
  join(pasta, 'main.cjs'),
  `const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
const { html, paginarDocumento } = require('./bundle.cjs')
app.whenReady().then(async () => {
  const arq = path.join(__dirname, 'doc.html')
  fs.writeFileSync(arq, html())
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadFile(arq)
  await win.webContents.executeJavaScript('document.fonts.ready')
  // Conta por nó de texto: textContent cola palavras de blocos vizinhos.
  const contar =
    "(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n = 0, t; while ((t = w.nextNode())) n += (t.textContent.match(/\\\\S+/g) || []).length; return n })()"
  const antes = await win.webContents.executeJavaScript(contar)
  await win.webContents.executeJavaScript('(' + paginarDocumento.toString() + ')(document)')
  const r = await win.webContents.executeJavaScript(
    "(() => { const ps = [...document.querySelectorAll('.pagina')]; return { paginas: ps.length, estouro: ps.filter(p => p.scrollHeight > p.getBoundingClientRect().height + 2).length, rodapes: document.querySelectorAll('.rodape').length } })()"
  )
  const depois = await win.webContents.executeJavaScript(contar)
  const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
  const paginasPdf = (pdf.toString('latin1').match(/\\/Type\\s*\\/Page[^s]/g) || []).length
  console.log('RESULTADO ' + JSON.stringify({ antes, depois, ...r, paginasPdf }))
  app.quit()
})
`
)

const electron = createRequire(import.meta.url)('electron')
const exec = spawnSync(electron, [join(pasta, 'main.cjs')], { encoding: 'utf8', timeout: 120000 })
rmSync(pasta, { recursive: true, force: true })
const linha = (exec.stdout ?? '').split('\n').find((l) => l.startsWith('RESULTADO '))
if (!linha) {
  console.error('Não foi possível medir a paginação.\n', exec.stdout, exec.stderr)
  process.exit(1)
}
const r = JSON.parse(linha.slice('RESULTADO '.length))
console.log(r)
const falhas = []
if (r.estouro !== 0) falhas.push(`${r.estouro} folha(s) com conteúdo acima da altura`)
if (r.depois !== r.antes) falhas.push(`palavras antes=${r.antes} depois=${r.depois}`)
if (r.paginasPdf !== r.paginas)
  falhas.push(`PDF com ${r.paginasPdf} páginas para ${r.paginas} folhas`)
if (r.rodapes !== 1) falhas.push(`rodapé aparece ${r.rodapes} vez(es)`)
if (falhas.length) {
  console.error('FALHOU:\n- ' + falhas.join('\n- '))
  process.exit(1)
}
console.log('OK: blocos longos paginados sem estouro nem perda de texto.')
