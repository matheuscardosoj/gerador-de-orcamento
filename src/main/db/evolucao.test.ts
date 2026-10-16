import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Orcamento, Recibo } from '@shared/types'
const raiz = mkdtempSync(join(tmpdir(), 'gdo-evolucao-'))
vi.mock('electron', () => ({
  app: { getPath: () => raiz, isPackaged: false, getAppPath: () => raiz }
}))
let repos: typeof import('../repositories')
let recibos: typeof import('../recibos')
let versoes: typeof import('../versoes')
let sql: typeof import('./sqlite')
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

it('guardar conteúdo idêntico reutiliza o rascunho e excluir preserva o documento principal', async () => {
  const rascunhos = await import('../rascunhos')
  const p = proposta()
  const a = rascunhos.criarRascunho('orcamento', p.id, p)
  expect(rascunhos.criarRascunho('orcamento', p.id, p).id).toBe(a.id)
  rascunhos.salvarRascunho(a.id, { ...p, titulo: 'Alternativa local' })
  expect(rascunhos.listarRascunhos('orcamento', p.id)).toHaveLength(1)
  rascunhos.descartarRascunho(a.id)
  expect(rascunhos.listarRascunhos('orcamento', p.id)).toHaveLength(0)
  expect(repos.orcamentosRepo.get(p.id)?.titulo).toBe(p.titulo)
})

it('restaurar orçamento cria nova versão sem alterar snapshots anteriores', async () => {
  const p = proposta()
  const original = versoes.listarVersoes('orcamento', p.id)[0]
  repos.orcamentosRepo.update(p.id, { titulo: 'Conteúdo novo', versao: p.versao })
  const { restaurarVersao } = await import('../historico-documentos')
  const restaurado = restaurarVersao(original.id, false)
  expect(restaurado).toMatchObject({ id: p.id, numero: p.numero, titulo: p.titulo, versao: 3 })
  expect(versoes.obterVersao(original.id).documento).toEqual(original.documento)
  expect(versoes.listarVersoes('orcamento', p.id)).toHaveLength(3)
})
function proposta(): Orcamento {
  return repos.orcamentosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente',
    formato: 'carta',
    titulo: 'Proposta',
    itensServico: [
      {
        id: 'i',
        descricao: 'Corte de árvore',
        unidade: 'serviço',
        quantidade: 1,
        valorUnitario: 1000,
        valorTotal: 1000
      }
    ],
    materiais: [],
    observacoes: [],
    pagamentos: [],
    anexos: [],
    valorTotal: 1000,
    status: 'rascunho'
  })
}
function novoRecibo(origemId?: string, adiantamentoId?: string): Recibo {
  return recibos.recibosRepo.create({
    data: '2026-10-11',
    destinatario: 'Cliente',
    descricao: 'Corte de árvore',
    valor: 200,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'pendente',
    quitacao: 'parcial',
    observacao: '',
    origemTipo: origemId ? 'relatorio' : undefined,
    origemId,
    adiantamentoId
  })
}
beforeAll(async () => {
  sql = await import('./sqlite')
  sql.abrirBanco()
  repos = await import('../repositories')
  repos.semear()
  recibos = await import('../recibos')
  versoes = await import('../versoes')
})
afterAll(() => {
  sql.fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})
it('registra versões sem repetir salvamentos idênticos e rejeita edições obsoletas', () => {
  const p = proposta()
  expect(p.versao).toBe(1)
  const igual = repos.orcamentosRepo.update(p.id, { titulo: p.titulo })!
  expect(igual.versao).toBe(1)
  const novo = repos.orcamentosRepo.update(p.id, { titulo: 'Proposta revisada', versao: 1 })!
  expect(novo.versao).toBe(2)
  expect(() => repos.orcamentosRepo.update(p.id, { titulo: 'Obsoleto', versao: 1 })).toThrow(
    'mudou'
  )
  expect(versoes.listarVersoes('orcamento', p.id)).toHaveLength(2)
})
it('preserva cliente e empresa após alterações cadastrais', () => {
  const c = repos.clientesRepo.create({
    nome: 'Nome original',
    tipoPessoa: 'pf',
    tratamento: 'Ao Sr.',
    ativo: true
  })
  repos.empresaRepo.save({ nome: 'Empresa original' })
  const p = repos.orcamentosRepo.create({ ...proposta(), clienteId: c.id, destinatario: c.nome })
  repos.clientesRepo.update(c.id, { nome: 'Nome alterado' })
  repos.empresaRepo.save({ nome: 'Empresa alterada' })
  const l = repos.orcamentosRepo.get(p.id)!
  expect(l.clienteSnapshot?.nome).toBe('Nome original')
  expect(l.empresaSnapshot?.nome).toBe('Empresa original')
})
it('deduplica fotos e conserva ativos de versões após remover o anexo', () => {
  const p = proposta()
  const a = {
    id: 'foto',
    titulo: 'Antes',
    descricao: '',
    mime: 'image/png',
    largura: 1,
    altura: 1,
    imagemDataUrl: PNG,
    miniaturaDataUrl: PNG
  }
  const com = repos.orcamentosRepo.update(p.id, { anexos: [a] })!
  const hash = com.anexos[0].imagemHash
  repos.orcamentosRepo.duplicate(p.id)
  expect(sql.get('SELECT COUNT(*) AS n FROM imagens')?.n).toBe(1)
  expect(typeof sql.get('SELECT base64 FROM imagens')?.base64).toBe('string')
  repos.orcamentosRepo.update(p.id, { anexos: [] })
  expect(sql.get('SELECT hash FROM imagens WHERE hash=?', [hash])?.hash).toBe(hash)
  expect(versoes.listarVersoes('orcamento', p.id)[1].documento).toHaveProperty(
    'anexos.0.imagemHash',
    hash
  )
})
it('confirma recebimentos uma vez e estorna somente o lançamento criado pelo recibo', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const r = novoRecibo(rel.id)
  expect(recibos.recibosRepo.confirmar(r.id).status).toBe('recebido')
  recibos.recibosRepo.confirmar(r.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  expect(sql.get('SELECT COUNT(*) AS n FROM recebimentos WHERE recibo_id=?', [r.id])?.n).toBe(1)
  expect(() => recibos.recibosRepo.update(r.id, { valor: 300 })).toThrow('preservados')
  recibos.recibosRepo.cancelar(r.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
})
it('confirma e estorna recibos avulsos e de propostas sem exigir ou modificar relatórios', () => {
  const p = proposta()
  const quantidade = sql.get('SELECT COUNT(*) AS n FROM relatorios')?.n
  for (const origem of [undefined, p.id]) {
    const criado = novoRecibo()
    const r = recibos.recibosRepo.update(criado.id, {
      origemTipo: origem ? 'orcamento' : undefined,
      origemId: origem,
      valor: 203.45
    })!
    expect(recibos.recibosRepo.confirmar(r.id).status).toBe('recebido')
    recibos.recibosRepo.confirmar(r.id)
    const lancamento = sql.get('SELECT * FROM recebimentos WHERE recibo_id=?', [r.id])!
    expect(lancamento.relatorio_id).toBeNull()
    expect(lancamento.valor).toBe(203.45)
    expect(sql.get('SELECT COUNT(*) AS n FROM recebimentos WHERE recibo_id=?', [r.id])?.n).toBe(1)
    recibos.recibosRepo.cancelar(r.id)
    expect(sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [r.id])?.estornado).toBe(
      1
    )
  }
  expect(sql.get('SELECT COUNT(*) AS n FROM relatorios')?.n).toBe(quantidade)
  expect(repos.orcamentosRepo.get(p.id)?.valorTotal).toBe(p.valorTotal)
})
it('falha de validação não registra pagamentos nem versões de recebimento', () => {
  const r = novoRecibo()
  recibos.recibosRepo.update(r.id, { status: 'rascunho', local: '' })
  const antes = versoes.listarVersoes('recibo', r.id).length
  expect(() => recibos.recibosRepo.confirmar(r.id)).toThrow('local do pagamento')
  expect(recibos.recibosRepo.get(r.id)?.status).toBe('rascunho')
  expect(sql.get('SELECT COUNT(*) AS n FROM recebimentos WHERE recibo_id=?', [r.id])?.n).toBe(0)
  expect(versoes.listarVersoes('recibo', r.id)).toHaveLength(antes)
})
it('exclui rascunhos e cobranças preservando versões e sem reutilizar números', () => {
  for (const status of ['rascunho', 'pendente'] as const) {
    const r = novoRecibo()
    recibos.recibosRepo.update(r.id, { status })
    const versoesAntes = versoes.listarVersoes('recibo', r.id)
    recibos.recibosRepo.remove(r.id)
    recibos.recibosRepo.remove(r.id)
    expect(recibos.recibosRepo.get(r.id)).toBeNull()
    expect(versoes.listarVersoes('recibo', r.id)).toEqual(versoesAntes)
    expect(
      sql.get('SELECT 1 FROM numeros_usados WHERE tipo=? AND numero=?', ['recibo', r.numero])
    ).toBeTruthy()
    expect(novoRecibo().numero).toBeGreaterThan(r.numero)
  }
})
it('exige estorno explícito e exclui pagamento confirmado atomicamente', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const r = novoRecibo(rel.id)
  recibos.recibosRepo.confirmar(r.id)
  expect(() => recibos.recibosRepo.remove(r.id)).toThrow('excluir e estornar')
  expect(recibos.recibosRepo.get(r.id)?.status).toBe('recebido')
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  recibos.recibosRepo.remove(r.id, true)
  recibos.recibosRepo.remove(r.id, true)
  expect(recibos.recibosRepo.get(r.id)).toBeNull()
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
  expect(sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [r.id])?.estornado).toBe(1)
  const estados = versoes.listarVersoes('recibo', r.id).map((v) => (v.documento as Recibo).status)
  expect(estados).toContain('recebido')
  expect(estados[0]).toBe('cancelado')
})
it('exclusão não desfaz adiantamentos preexistentes e conserva pagamentos já estornados', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  repos.relatoriosRepo.update(rel.id, {
    adiantamentos: [{ id: 'anterior', descricao: 'Anterior', valor: 200 }]
  })
  const r = novoRecibo(rel.id, 'anterior')
  recibos.recibosRepo.confirmar(r.id)
  recibos.recibosRepo.remove(r.id, true)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  expect(repos.relatoriosRepo.get(rel.id)?.adiantamentos).toHaveLength(1)
  const avulso = novoRecibo()
  recibos.recibosRepo.confirmar(avulso.id)
  recibos.recibosRepo.cancelar(avulso.id)
  recibos.recibosRepo.remove(avulso.id)
  expect(
    sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [avulso.id])?.estornado
  ).toBe(1)
})
it('falha na autorização do relatório reverte toda a exclusão e o estorno', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const r = novoRecibo(rel.id)
  recibos.recibosRepo.confirmar(r.id)
  const meta = sql.get('SELECT dados FROM documento_meta WHERE tipo=? AND documento_id=?', [
    'relatorio',
    rel.id
  ])!
  sql.run("INSERT OR REPLACE INTO configuracoes VALUES ('restauracaoLocal','true')")
  sql.run('UPDATE documento_meta SET dados=? WHERE tipo=? AND documento_id=?', [
    JSON.stringify({
      ...JSON.parse(String(meta.dados)),
      computadorResponsavel: 'outro-computador'
    }),
    'relatorio',
    rel.id
  ])
  try {
    expect(() => recibos.recibosRepo.remove(r.id, true)).toThrow('outro computador')
    expect(recibos.recibosRepo.get(r.id)?.status).toBe('recebido')
    expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
    expect(sql.get('SELECT estornado FROM recebimentos WHERE recibo_id=?', [r.id])?.estornado).toBe(
      0
    )
  } finally {
    sql.run("DELETE FROM configuracoes WHERE chave='restauracaoLocal'")
    sql.run('UPDATE documento_meta SET dados=? WHERE tipo=? AND documento_id=?', [
      meta.dados,
      'relatorio',
      rel.id
    ])
  }
})
it('cria outra proposta a partir de uma versão com foto sem duplicar o ativo', async () => {
  const p = proposta()
  repos.orcamentosRepo.update(p.id, {
    anexos: [
      {
        id: 'foto-para-copia',
        titulo: 'Foto',
        descricao: '',
        mime: 'image/png',
        largura: 1,
        altura: 1,
        imagemDataUrl: PNG
      }
    ]
  })
  const v = versoes.listarVersoes('orcamento', p.id)[0]
  const { restaurarVersao } = await import('../historico-documentos')
  const copia = restaurarVersao(v.id, true) as Orcamento
  expect(copia.anexos[0].id).not.toBe((v.documento as Orcamento).anexos[0].id)
  expect(copia.anexos[0].imagemHash).toBe((v.documento as Orcamento).anexos[0].imagemHash)
})
it('emite recibo de adiantamento existente sem descontar duas vezes', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  repos.relatoriosRepo.update(rel.id, {
    adiantamentos: [{ id: 'sinal', descricao: 'Sinal', valor: 200 }]
  })
  const r = novoRecibo(rel.id, 'sinal')
  recibos.recibosRepo.confirmar(r.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  const outro = novoRecibo(rel.id, 'sinal')
  expect(() => recibos.recibosRepo.confirmar(outro.id)).toThrow('já possui')
  recibos.recibosRepo.cancelar(r.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
})
it('restaurar relatório não desfaz recebimentos e permite cópia de versão antiga', async () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const antiga = versoes.listarVersoes('relatorio', rel.id).at(-1)!
  recibos.recibosRepo.confirmar(novoRecibo(rel.id).id)
  const { restaurarVersao } = await import('../historico-documentos')
  restaurarVersao(antiga.id, false)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(800)
  const copia = restaurarVersao(antiga.id, true)
  expect(copia.id).not.toBe(rel.id)
})
it('reserva números por computador e bloqueia edição por outro responsável', async () => {
  const p = proposta()
  sql.run("INSERT INTO configuracoes VALUES ('nuvem','{}')")
  sql.run("INSERT INTO reservas VALUES ('orcamento',900,0)")
  expect(proposta().numero).toBe(900)
  expect(proposta().numero).toBeLessThan(0)
  sql.run('UPDATE documento_meta SET dados=? WHERE tipo=? AND documento_id=?', [
    JSON.stringify({ ...versoes.lerMeta('orcamento', p.id), computadorResponsavel: 'outro-pc' }),
    'orcamento',
    p.id
  ])
  expect(() => repos.orcamentosRepo.update(p.id, { titulo: 'Inválido' })).toThrow(
    'outro computador'
  )
  sql.run("DELETE FROM configuracoes WHERE chave='nuvem'")
})
it('preserva pagamentos confirmados contra edições e exclusão do relatório', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const r = novoRecibo(rel.id)
  recibos.recibosRepo.confirmar(r.id)
  expect(() => repos.relatoriosRepo.update(rel.id, { adiantamentos: [] })).toThrow('confirmados')
  expect(() => repos.relatoriosRepo.remove(rel.id)).toThrow('recebimentos')
  recibos.recibosRepo.cancelar(r.id)
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
})
it('rejeita quitação total quando ainda há saldo', () => {
  const rel = repos.relatoriosRepo.criarDeOrcamento(proposta().id)!
  const r = novoRecibo(rel.id)
  recibos.recibosRepo.update(r.id, { quitacao: 'total' })
  expect(() => recibos.recibosRepo.confirmar(r.id)).toThrow('quitação total')
  expect(repos.relatoriosRepo.get(rel.id)?.totais.saldo).toBe(1000)
})
it('bloqueia emissão e edição durante transferência de confirmação desconhecida', () => {
  const p = proposta()
  sql.run("INSERT INTO configuracoes VALUES ('nuvem','{}')")
  sql.run('INSERT INTO configuracoes VALUES (?,?)', [`transferencia:orcamento:${p.id}`, '{}'])
  expect(() => repos.orcamentosRepo.update(p.id, { titulo: 'Edição indevida' })).toThrow(
    'transferência'
  )
  sql.run("DELETE FROM configuracoes WHERE chave='nuvem' OR chave LIKE 'transferencia:%'")
})
