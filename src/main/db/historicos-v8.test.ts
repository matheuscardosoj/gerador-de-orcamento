import { it, expect, vi, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from 'node-sqlite3-wasm'
import { aplicarMigracoes, VERSAO_BANCO } from './schema'
const raiz = mkdtempSync(join(tmpdir(), 'gdo-v8-'))
vi.mock('electron', () => ({
  app: { getPath: () => raiz, isPackaged: false, getAppPath: () => raiz }
}))
afterAll(async () => {
  const sql = await import('./sqlite')
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})
it('migra catálogo v7 mantendo ordem alfabética, PF/PJ e snapshots antigos', () => {
  const d = new Database(join(raiz, 'legado.db'))
  aplicarMigracoes(d, 7)
  d.exec(
    "INSERT INTO servicos VALUES('z','Zebra','','',NULL),('a','Abacate','','',NULL);INSERT INTO clientes(id,nome,criado_em,dados_json) VALUES('pj','Empresa','hoje','{\"documento\":\"04.871.989/0001-60\"}'),('pf','Nome','hoje','{}')"
  )
  aplicarMigracoes(d)
  expect(d.all('SELECT id FROM servicos ORDER BY ordem')).toEqual([{ id: 'a' }, { id: 'z' }])
  expect(
    JSON.parse(String(d.get("SELECT dados_json FROM clientes WHERE id='pj'")?.dados_json))
      .tipoPessoa
  ).toBe('pj')
  expect(
    JSON.parse(String(d.get("SELECT dados_json FROM clientes WHERE id='pf'")?.dados_json))
      .tipoPessoa
  ).toBe('pf')
  expect(d.get('PRAGMA user_version')?.user_version).toBe(VERSAO_BANCO)
  d.close()
})
it('reordena atomicamente e mantém preferências dos três históricos isoladas', async () => {
  const repos = await import('../repositories'),
    prefs = await import('../preferencias'),
    sql = await import('./sqlite')
  const a = repos.servicosRepo.create({
    nome: 'A',
    descricaoPadrao: '',
    unidade: '',
    precoReferencia: null
  })
  const b = repos.servicosRepo.create({
    nome: 'B',
    descricaoPadrao: '',
    unidade: '',
    precoReferencia: null
  })
  prefs.reordenarCadastro('servicos', [b.id, a.id])
  expect(repos.servicosRepo.list().map((s) => s.id)).toEqual([b.id, a.id])
  expect(() => prefs.reordenarCadastro('servicos', [a.id, a.id])).toThrow('lista mudou')
  expect(repos.servicosRepo.list().map((s) => s.id)).toEqual([b.id, a.id])
  prefs.salvarPreferencias('orcamento', { busca: 'João', colunas: ['versao'] })
  sql.fecharBanco()
  sql.abrirBanco()
  expect(prefs.lerPreferencias('orcamento').busca).toBe('João')
  expect(prefs.lerPreferencias('recibo').busca).toBe('')
  expect(sql.all('SELECT * FROM fila_nuvem')).toEqual([])
})
