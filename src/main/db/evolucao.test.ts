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
