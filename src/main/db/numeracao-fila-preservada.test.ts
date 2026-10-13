import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const estado = vi.hoisted(() => ({ perfil: '' }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-numeracao-preservada-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, isPackaged: false, getAppPath: () => estado.perfil },
  dialog: {}
}))
let sql: typeof import('./sqlite'), numeros: typeof import('../numeros')
beforeAll(async () => {
  estado.perfil = raiz
  sql = await import('./sqlite')
  numeros = await import('../numeros')
  sql.abrirBanco()
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})
const inserir = (entidade: string, payload: unknown) => {
  for (const status of ['preservada', 'pendente'])
    sql.run(
      'INSERT INTO fila_nuvem(id,entidade,base,payload,criado_em,grupo,estado) VALUES(?,?,?,?,?,?,?)',
      [
        `${entidade}:${status}`,
        entidade,
        0,
        JSON.stringify(payload),
        '2026-10-12',
        `${entidade}:${status}`,
        status
      ]
    )
}

it('confirma o número do recibo sem modificar a operação preservada', () => {
  const documento = { id: 'recibo', numero: -8, valor: 100, descricao: 'Original' }
  sql.run('INSERT INTO recibos VALUES(?,?,?)', [documento.id, -8, JSON.stringify(documento)])
  inserir('recibo:recibo', {
    tipo: 'recibo',
    id: documento.id,
    rows: {
      recibos: [{ id: documento.id, numero: -8, dados: JSON.stringify(documento) }],
      versoes: [{ documento: JSON.stringify(documento) }]
    }
  })
  const antes = sql.get("SELECT * FROM fila_nuvem WHERE id='recibo:recibo:preservada'")
  numeros.confirmarNumero('recibo', documento.id, 4)
  expect(sql.get("SELECT * FROM fila_nuvem WHERE id='recibo:recibo:preservada'")).toEqual(antes)
  const atual = JSON.parse(
    String(sql.get("SELECT payload FROM fila_nuvem WHERE estado='pendente'")?.payload)
  )
  expect(atual.rows.recibos[0].numero).toBe(4)
  expect(JSON.parse(atual.rows.recibos[0].dados).numero).toBe(4)
  expect(JSON.parse(atual.rows.versoes[0].documento).numero).toBe(4)
})

it('confirma a origem do relatório provisório sem reescrever sua operação preservada', () => {
  sql.run('INSERT INTO orcamentos(id,numero,data,criado_em,atualizado_em) VALUES(?,?,?,?,?)', [
    'proposta',
    -10,
    '2026-10-12',
    '2026-10-12',
    '2026-10-12'
  ])
  sql.run(
    'INSERT INTO relatorios(id,numero,data,origem_orcamento_id,origem_orcamento_numero,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?)',
    ['relatorio', -11, '2026-10-12', 'proposta', -10, '2026-10-12', '2026-10-12']
  )
  const documento = { numero: -11, origemOrcamento: { id: 'proposta', numero: -10 } }
  inserir('relatorio:relatorio', {
    tipo: 'relatorio',
    id: 'relatorio',
    rows: {
      relatorios: [
        {
          id: 'relatorio',
          numero: -11,
          origem_orcamento_id: 'proposta',
          origem_orcamento_numero: -10
        }
      ],
      versoes: [{ documento: JSON.stringify(documento) }]
    }
  })
  const antes = sql.get("SELECT * FROM fila_nuvem WHERE id='relatorio:relatorio:preservada'")
  numeros.confirmarNumero('orcamento', 'proposta', 18)
  expect(sql.get("SELECT * FROM fila_nuvem WHERE id='relatorio:relatorio:preservada'")).toEqual(
    antes
  )
  const atual = JSON.parse(
    String(
      sql.get("SELECT payload FROM fila_nuvem WHERE id='relatorio:relatorio:pendente'")?.payload
    )
  )
  expect(atual.rows.relatorios[0].origem_orcamento_numero).toBe(18)
  expect(JSON.parse(atual.rows.versoes[0].documento).origemOrcamento.numero).toBe(18)
})
