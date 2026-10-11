import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
const pasta = resolve('output/playwright', `ia-local-${Date.now()}`)
mkdirSync(pasta, { recursive: true })
const exe = process.argv[2] ? resolve(process.argv[2]) : undefined
const app = await electron.launch({
  executablePath: exe,
  args: exe ? [] : ['.'],
  env: { ...process.env, GERADOR_USER_DATA_DIR: join(pasta, 'perfil') }
})
try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).waitFor()
  const inicio = performance.now()
  const texto = 'Será feito o corte de 3 arvores com retirada dos residuos no valor de R$ 1.600,00.'
  const revisao = await page.evaluate(async (texto) => {
    await window.api.ia.save({ modo: 'embutida' })
    const id = crypto.randomUUID()
    const pendente = window.api.ia.revisarTexto({ id, campo: 'descricaoServico', texto }).then(
      () => '',
      (e) => String(e)
    )
    await new Promise((r) => setTimeout(r, 30))
    const inicioCancelamento = performance.now()
    await window.api.ia.cancelarRevisao(id)
    const cancelada = await pendente
    const cancelamentoMs = Math.round(performance.now() - inicioCancelamento)
    const sugestao = await window.api.ia.revisarTexto({
      id: crypto.randomUUID(),
      campo: 'descricaoServico',
      texto
    })
    return { cancelada, cancelamentoMs, sugestao }
  }, texto)
  const { sugestao } = revisao
  assert.ok(revisao.cancelada.includes('cancelada'))
  assert.ok(revisao.cancelamentoMs < 2000)
  assert.ok(sugestao.trim())
  assert.ok(sugestao.includes('3'))
  assert.ok(sugestao.includes('1.600,00'))
  const resultado = {
    texto,
    sugestao,
    segundos: Math.round((performance.now() - inicio) / 100) / 10,
    modeloLocal: true,
    cancelamentoInicializacaoMs: revisao.cancelamentoMs
  }
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado, null, 2))
  console.log(JSON.stringify({ ...resultado, pasta }))
} finally {
  await app.close()
}
