import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database } from 'node-sqlite3-wasm'
const estado = vi.hoisted(() => ({ perfil: '' }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-backup-versoes-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, isPackaged: false, getAppPath: () => estado.perfil },
  dialog: {}
}))
let sql: typeof import('./sqlite'),
  repos: typeof import('../repositories'),
  dados: typeof import('../dados'),
  recibos: typeof import('../recibos'),
  versoes: typeof import('../versoes')
let relId = '',
  reciboId = '',
  computador = '',
  numeroVersoes = 0
const backup = join(raiz, 'completo.gdo-backup')
const foto =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
async function perfil(nome: string): Promise<void> {
  sql?.fecharBanco()
  estado.perfil = join(raiz, nome)
  sql ??= await import('./sqlite')
  sql.abrirBanco()
}
beforeAll(async () => {
  await perfil('origem')
  repos = await import('../repositories')
  repos.semear()
  dados = await import('../dados')
  recibos = await import('../recibos')
  versoes = await import('../versoes')
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})

it('inclui pagamentos, versões e imagens, retirando sessão, identidade e reservas da cópia', () => {
  const proposta = repos.orcamentosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente',
    formato: 'carta',
    titulo: 'Proposta',
    itensServico: [
      {
        id: 's',
        descricao: 'Serviço',
        quantidade: 1,
        unidade: 'un',
        valorUnitario: 1000,
        valorTotal: 1000
      }
    ],
    materiais: [],
    observacoes: [],
    pagamentos: [],
    anexos: [
      {
        id: 'foto',
        titulo: 'Registro',
        descricao: '',
        mime: 'image/png',
        largura: 1,
        altura: 1,
        imagemDataUrl: foto
      }
    ],
    valorTotal: 1000,
    status: 'rascunho'
  })
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta.id)!
  relId = rel.id
  const recibo = recibos.recibosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente',
    descricao: 'Serviço',
    valor: 200,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    quitacao: 'parcial',
    status: 'pendente',
    observacao: '',
    origemTipo: 'relatorio',
    origemId: rel.id
  })
  reciboId = recibo.id
  recibos.recibosRepo.confirmar(recibo.id)
  numeroVersoes = Number(sql.get('SELECT count(*) AS n FROM versoes')?.n)
  computador = versoes.computadorId()
  sql.run('INSERT INTO configuracoes VALUES (?,?)', [
    'historico:orcamento',
    JSON.stringify({
      busca: 'Busca local',
      colunas: ['data', 'versao'],
      campo: 'data',
      direcao: 'asc'
    })
  ])
  sql.run("INSERT INTO configuracoes VALUES ('sessaoNuvem','\"credencial de teste\"')")
  sql.run("INSERT INTO reservas VALUES ('orcamento',999,0)")
  dados.exportarDadosPara(backup)
  const copia = new Database(backup)
  expect(
    copia.get(
      "SELECT count(*) AS n FROM configuracoes WHERE chave IN ('computadorId','sessaoNuvem','nuvem')"
    )
  ).toEqual({ n: 0 })
  expect(copia.get('SELECT count(*) AS n FROM reservas')).toEqual({ n: 0 })
  expect(copia.get('SELECT count(*) AS n FROM recebimentos')).toEqual({ n: 1 })
  expect(copia.get('SELECT count(*) AS n FROM versoes')).toEqual({ n: numeroVersoes })
  copia.close()
  expect(versoes.computadorId()).toBe(computador)
})

it('restaurar no mesmo perfil conserva a identidade local e a edição dos próprios documentos', () => {
  dados.importarDadosDe(backup, 'restaurar')
  expect(versoes.computadorId()).toBe(computador)
  const proposta = repos.orcamentosRepo.list()[0]
  expect(() =>
    repos.orcamentosRepo.update(proposta.id, { observacaoInterna: 'Revisão após restauração' })
  ).not.toThrow()
})

it('restaura em outro computador preservando o saldo e bloqueando autorização herdada', async () => {
  await perfil('restauracao')
  repos.semear()
  dados.importarDadosDe(backup, 'restaurar')
  expect(versoes.computadorId()).not.toBe(computador)
  expect(repos.relatoriosRepo.get(relId)?.totais.saldo).toBe(800)
  expect(recibos.recibosRepo.get(reciboId)?.status).toBe('recebido')
  expect(sql.get('SELECT count(*) AS n FROM versoes')?.n).toBe(numeroVersoes)
  expect(sql.get('SELECT count(*) AS n FROM imagens')?.n).toBe(1)
  expect(
    JSON.parse(
      String(sql.get("SELECT valor FROM configuracoes WHERE chave='historico:orcamento'")?.valor)
    ).busca
  ).toBe('Busca local')
  expect(() => recibos.recibosRepo.cancelar(reciboId)).toThrow('outro computador')
})

it('mescla em um perfil independente sem duplicar pagamentos ao repetir a importação', async () => {
  await perfil('mesclagem')
  repos.semear()
  sql.run('INSERT INTO configuracoes VALUES (?,?)', [
    'historico:orcamento',
    JSON.stringify({ busca: 'Preferência deste computador' })
  ])
  dados.importarDadosDe(backup, 'mesclar')
  expect(
    JSON.parse(
      String(sql.get("SELECT valor FROM configuracoes WHERE chave='historico:orcamento'")?.valor)
    ).busca
  ).toBe('Preferência deste computador')
  const rel = repos.relatoriosRepo.list()[0]
  const recibo = recibos.recibosRepo.list()[0]
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  expect(recibos.recibosRepo.get(recibo.id)?.origemId).toBe(rel.id)
  const pagamento = sql.get('SELECT * FROM recebimentos')!
  expect(pagamento.relatorio_id).toBe(rel.id)
  expect(repos.relatoriosRepo.get(rel.id)?.adiantamentos[0].id).toBe(pagamento.adiantamento_id)
  dados.importarDadosDe(backup, 'mesclar')
  expect(sql.get('SELECT count(*) AS n FROM recebimentos')?.n).toBe(1)
  expect(sql.get('SELECT count(*) AS n FROM recibos')?.n).toBe(1)
  expect(sql.get('SELECT count(*) AS n FROM imagens')?.n).toBe(1)
  expect(versoes.listarVersoes('relatorio', rel.id).length).toBeGreaterThan(1)
})

it('restaura estornos, versões e números de recibos excluídos sem ressuscitar o documento', () => {
  const r = recibos.recibosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente da exclusão',
    descricao: 'Serviço',
    valor: 125.5,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'pendente',
    quitacao: 'parcial',
    observacao: ''
  })
  recibos.recibosRepo.confirmar(r.id)
  recibos.recibosRepo.remove(r.id, true)
  const arquivo = join(raiz, 'exclusao.gdo-backup')
  dados.exportarDadosPara(arquivo)
  dados.importarDadosDe(arquivo, 'restaurar')
  expect(recibos.recibosRepo.get(r.id)).toBeNull()
  expect(sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [r.id])?.estornado).toBe(1)
  expect(versoes.listarVersoes('recibo', r.id)).toHaveLength(3)
  expect(
    sql.get('SELECT 1 FROM numeros_usados WHERE tipo=? AND numero=?', ['recibo', r.numero])
  ).toBeTruthy()
})
