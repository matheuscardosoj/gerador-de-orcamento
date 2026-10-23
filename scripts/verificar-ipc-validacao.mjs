// Confere, no aplicativo real (código compilado em out/), que a validação do IPC roda antes da
// checagem de acesso: argumento malformado vira "dados inválidos"; argumento correto segue até
// a regra de acesso ("Entre na sua conta"). Uso: npm run build && node scripts/verificar-ipc-validacao.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'

const perfil = mkdtempSync(join(tmpdir(), 'gdo-ipc-'))
const app = await _electron.launch({
  args: [resolve('.')],
  env: { ...process.env, GERADOR_USER_DATA_DIR: perfil }
})
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const chamar = (js) =>
    page.evaluate(async (codigo) => {
      try {
        await new Function('api', `return (${codigo})`)(window.api)
        return 'ok'
      } catch (e) {
        return String(e.message)
      }
    }, js)
  const invalidos = [
    'api.orcamentos.get({ $ne: 1 })',
    'api.clientes.update("a", [])',
    'api.versoes.exportar("a", "exe")',
    'api.dados.importar("apagar")'
  ]
  for (const js of invalidos)
    assert.match(await chamar(js), /inválidos/, `deveria recusar a forma: ${js}`)
  const validos = [
    'api.orcamentos.get("abc")',
    'api.clientes.update("a", { nome: "x" })',
    'api.orcamentos.alterarNumero("a", 3)'
  ]
  for (const js of validos)
    assert.match(await chamar(js), /Entre na sua conta/, `deveria seguir até o acesso: ${js}`)
  console.log('ok: validação de argumentos do IPC ativa e sem recusar chamadas corretas')
} finally {
  await app.close()
  rmSync(perfil, { recursive: true, force: true })
}
