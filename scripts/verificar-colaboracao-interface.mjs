// Conferência Electron e migração de uma cópia; o banco de uso nunca é aberto em SQLite.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import sqlite from 'node-sqlite3-wasm'
const { Database } = sqlite
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const pasta = resolve('output/playwright', `colaboracao-${Date.now()}`),
  perfil = join(pasta, 'perfil')
mkdirSync(join(perfil, 'data'), { recursive: true })
const banco = join(perfil, 'data', 'banco.db')
const origem =
  process.argv[3] ?? 'C:/Users/Matheus/AppData/Roaming/gerador-de-orcamento/data/banco.db'
const bytes = readFileSync(origem),
  hash = (b) => createHash('sha256').update(b).digest('hex')
writeFileSync(banco, bytes)
assert.equal(
  hash(bytes),
  hash(readFileSync(origem)),
  'A base mudou durante a cópia; refaça o ensaio.'
)
const tabelas = [
  'clientes',
  'servicos',
  'observacoes_padrao',
  'pagamentos_padrao',
  'orcamentos',
  'itens_servico',
  'materiais',
  'orcamento_textos',
  'anexos',
  'relatorios',
  'relatorio_itens_servico',
  'relatorio_lancamentos',
  'relatorio_textos',
  'relatorio_anexos',
  'recibos',
  'recebimentos',
  'versoes',
  'imagens',
  'documento_meta',
  'numeros_usados'
]
function retrato(caminho) {
  const db = new Database(caminho)
  try {
    assert.equal(db.get('PRAGMA integrity_check').integrity_check, 'ok')
    assert.equal(db.all('PRAGMA foreign_key_check').length, 0)
    return Object.fromEntries(
      tabelas.map((t) => [
        t,
        db
          .all(`SELECT * FROM ${t}`)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      ])
    )
  } finally {
    db.close()
  }
}
const inicial = retrato(banco)
const copia = new Database(banco)
try {
  copia.exec(
    "DELETE FROM configuracoes WHERE chave IN ('computadorId','sessaoNuvem','nuvem','usuarioNuvem','contextoNuvem','empresaNuvem','cursorNuvem','ultimaNuvem','erroNuvem','bytesNuvem','membrosCache','pedidosEdicaoCache','restauracaoLocal') OR chave LIKE 'estado:%' OR chave LIKE 'transferencia:%' OR chave LIKE 'computadorUsuario:%' OR chave LIKE 'numeracaoNuvem:%'; DELETE FROM reservas;DELETE FROM fila_nuvem;DELETE FROM sincronizacao;DELETE FROM conflitos_nuvem;"
  )
  if (copia.get("SELECT 1 FROM sqlite_master WHERE name='edicoes_documento'"))
    copia.exec('DELETE FROM edicoes_documento')
} finally {
  copia.close()
}
const exe = process.argv[2] || undefined
const app = await electron.launch({
  executablePath: exe,
  args: exe ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
})
const erros = [],
  medidas = []
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
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page.getByRole('heading', { name: 'Dados do cabeçalho', exact: true }).waitFor()
  copyFileSync(banco, join(pasta, 'base-migrada.gdo-backup'))
  assert.deepEqual(
    retrato(join(pasta, 'base-migrada.gdo-backup')),
    inicial,
    'Conteúdo comercial alterado pela migração.'
  )
  const migrada = new Database(join(pasta, 'base-migrada.gdo-backup'))
  assert.equal(migrada.get('PRAGMA user_version').user_version, 9)
  migrada.close()
  for (const largura of [1024, 1440, 2560]) {
    await app.evaluate(({ BrowserWindow }, l) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.unmaximize()
      w.setContentSize(l, 1000)
    }, largura)
    await page.waitForFunction((l) => innerWidth === l, largura)
    for (const aba of [
      'Empresa / Cabeçalho',
      'Parâmetros financeiros',
      'Observações padrão',
      'Formas de pagamento',
      'Numeração dos documentos',
      'Dados e backup',
      'Nuvem / Sincronização',
      'Usuários',
      'IA local'
    ]) {
      await page.getByRole('tab', { name: aba, exact: true }).click()
      await page.locator('main').evaluate((e) => (e.scrollTop = 0))
      if (['Empresa / Cabeçalho', 'Parâmetros financeiros', 'IA local'].includes(aba)) {
        const salvar = await page
          .getByRole('button', { name: /^(Salvar alterações|Salvo|Salvando…)$/ })
          .boundingBox()
        assert.ok(salvar.y < 110, `Salvar fora do cabeçalho: ${aba}`)
      }
      await page.waitForTimeout(100)
      const geometria = await page
        .locator('main')
        .evaluate((e) => ({ largura: e.clientWidth, conteudo: e.scrollWidth }))
      assert.ok(
        geometria.conteudo <= geometria.largura + 1,
        `Overflow da página ${aba} a ${largura}`
      )
      if (['Observações padrão', 'Formas de pagamento'].includes(aba)) {
        const titulo = await page
          .getByRole('heading', { name: 'Configurações', exact: true })
          .boundingBox()
        const quadro = page.locator('.data-table-viewport')
        if (await quadro.count()) {
          const r = await quadro.boundingBox()
          assert.ok(Math.abs(r.x - titulo.x) <= 1)
          assert.ok(r.x + r.width <= largura)
        }
      }
      await page.screenshot({
        path: join(pasta, `${aba.replace(/[^a-z0-9]/gi, '-')}-${largura}.png`)
      })
      medidas.push({ largura, aba, ...geometria })
    }
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000)
  )
  await page.getByRole('tab', { name: 'Observações padrão', exact: true }).click()
  await page.getByRole('button', { name: 'Nova observação', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Nova observação', exact: true })
  await modal.getByLabel('Texto', { exact: true }).fill('Texto de conferência da configuração')
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click()
  await modal.waitFor({ state: 'hidden' })
  await page.getByRole('textbox', { name: 'Buscar observações' }).fill('conferencia configuracao')
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1)
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  const numero = await page.evaluate(async () => {
    const p = (await window.api.orcamentos.list())[0]
    return (await window.api.orcamentos.duplicate(p.id)).numero
  })
  const s = await page.evaluate(() => window.api.nuvem.status())
  // Estado de colaboração simulado só neste perfil. Backend e socket têm ensaios próprios.
  await app.evaluate(({ ipcMain }, s) => {
    ipcMain.removeHandler('nuvem.status')
    ipcMain.handle('nuvem.status', () => ({
      ...s,
      protocolo: 2,
      autenticada: true,
      tempoReal: 'conectado',
      usuarioId: 'usuario-ui',
      empresaId: 'empresa-ui'
    }))
    ipcMain.removeHandler('colaboracao.edicao')
    ipcMain.handle('colaboracao.edicao', (_e, tipo, id) => ({
      tipo,
      documentoId: id,
      usuarioId: 'usuario-ui',
      usuarioNome: 'Usuário de teste',
      computador: s.computador,
      geracao: 1,
      expiraEm: new Date(Date.now() + 120000).toISOString(),
      offline: false,
      revisao: 1,
      podeEditar: true,
      solicitacoes: []
    }))
  }, s)
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click()
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
  await page.getByRole('button', { name: `Abrir orçamento Nº ${numero}`, exact: true }).click()
  await page.getByRole('heading', { name: 'Edição compartilhada', exact: true }).waitFor()
  const campo = page.getByLabel('Introdução / apresentação', { exact: true })
  const id = await page.evaluate(
    async (n) => (await window.api.orcamentos.list()).find((p) => p.numero === n).id,
    numero
  )
  await page.evaluate(async (id) => {
    const d = await window.api.orcamentos.get(id)
    await window.api.orcamentos.update(id, {
      introducao: 'Conteúdo remoto limpo',
      versao: d.versao
    })
  }, id)
  await app.evaluate(
    ({ BrowserWindow }, id) =>
      BrowserWindow.getAllWindows()[0].webContents.send('dados.alterados', {
        origem: 'nuvem',
        entidades: [`orcamento:${id}`]
      }),
    id
  )
  await page.waitForFunction(
    () => document.querySelector('textarea')?.value === 'Conteúdo remoto limpo'
  )
  await campo.fill('Texto digitado local e preservado')
  await page.evaluate(async (id) => {
    const d = await window.api.orcamentos.get(id)
    await window.api.orcamentos.update(id, {
      introducao: 'Texto confirmado na empresa',
      versao: d.versao
    })
  }, id)
  await app.evaluate(
    ({ BrowserWindow }, id) =>
      BrowserWindow.getAllWindows()[0].webContents.send('dados.alterados', {
        origem: 'nuvem',
        entidades: [`orcamento:${id}`]
      }),
    id
  )
  await page.getByText('Existe uma nova versão na nuvem.', { exact: false }).waitFor()
  assert.equal(await campo.inputValue(), 'Texto digitado local e preservado')
  await page.getByRole('button', { name: 'Preservar edição como rascunho', exact: true }).click()
  await page.getByRole('heading', { name: 'Rascunho de trabalho', exact: true }).waitFor()
  const rascunhos = await page.evaluate((id) => window.api.rascunhos.list('orcamento', id), id)
  assert.equal(rascunhos.at(-1).documento.introducao, 'Texto digitado local e preservado')
  assert.equal(
    (await page.evaluate((id) => window.api.orcamentos.get(id), id)).introducao,
    'Texto confirmado na empresa'
  )
  await campo.fill('Outra edição do rascunho')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await aguardarConsulta(
    async (id) =>
      (await window.api.rascunhos.list('orcamento', id)).some(
        (r) => r.documento.introducao === 'Outra edição do rascunho'
      ),
    id
  )
  await page.screenshot({ path: join(pasta, 'editor-rascunho.png'), fullPage: true })
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByRole('button', { name: 'Novo recibo', exact: true }).click()
  await page.getByLabel('Nome ou razão social', { exact: true }).fill('Cliente do recibo não salvo')
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByRole('dialog', { name: 'Alterações não salvas', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continuar editando', exact: true }).click()
  assert.equal(
    await page.getByLabel('Nome ou razão social', { exact: true }).inputValue(),
    'Cliente do recibo não salvo'
  )
  await page.getByRole('button', { name: 'Recibos', exact: true }).click()
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
  await page.getByRole('heading', { name: 'Recibos e cobranças', exact: true }).waitFor()
  assert.equal(
    (await page.evaluate(() => window.api.recibos.list())).length,
    inicial.recibos.length
  )
  assert.deepEqual(erros, [])
  const resultado = {
    pasta,
    interfaceComApiSimulada: true,
    migracaoSchema: 9,
    tabelasPreservadas: tabelas.length,
    contagens: {
      orcamentos: inicial.orcamentos.length,
      relatorios: inicial.relatorios.length,
      recibos: inicial.recibos.length,
      versoes: inicial.versoes.length,
      imagens: inicial.imagens.length
    },
    medidas,
    editorLimpoAtualiza: true,
    editorSujoPreservado: true,
    rascunhoSemAlterarEmpresa: true,
    reciboNaoSalvoProtegido: true,
    erros
  }
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify({ pasta, contagens: resultado.contagens, erros }))
} finally {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app.close()
}
