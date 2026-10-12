// Testes dos repositórios SQLite. O único ponto que depende do Electron é o
// `app.getPath('userData')`, substituído aqui por uma pasta temporária.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import type { Orcamento } from '@shared/types'
import { aplicarMigracoes } from './schema'
import { run } from './sqlite'

const raiz = mkdtempSync(join(tmpdir(), 'orc-teste-'))

vi.mock('electron', () => ({
  app: { getPath: () => raiz, isPackaged: false, getAppPath: () => raiz }
}))

// PNG 1×1 usado como imagem de anexo.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// O banco legado repete os ids dos filhos entre orçamentos duplicados —
// exatamente o caso que quebrava a importação.
const bancoLegado = {
  seqOrcamento: 2,
  clientes: [
    {
      id: 'cli-1',
      nome: 'TMG',
      tratamento: 'A',
      contato: '',
      observacao: '',
      criadoEm: '2026-01-01T12:00:00.000Z'
    }
  ],
  servicos: [],
  observacoesPadrao: [],
  pagamentosPadrao: [],
  orcamentos: [1, 2].map((n) => ({
    id: `orc-${n}`,
    numero: n,
    data: '2026-05-04T12:00:00.000Z',
    clienteId: 'cli-1',
    destinatario: 'A TMG,',
    formato: 'carta',
    titulo: 'Proposta de Serviço',
    introducao: '',
    itensServico: [
      {
        id: 'item-a',
        descricao: 'Cerca',
        unidade: 'm',
        quantidade: 100,
        valorUnitario: 8,
        valorTotal: 800,
        calculo: null
      }
    ],
    materiais: [{ id: 'mat-a', quantidade: 2, unidade: 'un', especificacao: 'Mourão' }],
    observacoes: [{ id: 'obs-a', texto: 'Materiais por conta da contratante.' }],
    pagamentos: [{ id: 'pag-a', texto: 'Via Pix.' }],
    prazoDias: 10,
    valorTotal: 800,
    status: 'rascunho',
    criadoEm: `2026-0${n}-01T12:00:00.000Z`,
    atualizadoEm: `2026-0${n}-01T12:00:00.000Z`
  }))
}

let repos: typeof import('../repositories')
let anexoCriadoId = ''

beforeAll(async () => {
  mkdirSync(join(raiz, 'data'), { recursive: true })
  writeFileSync(join(raiz, 'data', 'banco.json'), JSON.stringify(bancoLegado), 'utf-8')

  const { abrirBanco } = await import('./sqlite')
  abrirBanco()
  repos = await import('../repositories')
  const { migrarJsonSeExistir } = await import('./migrar-json')
  migrarJsonSeExistir()
})

afterAll(async () => {
  const { fecharBanco } = await import('./sqlite')
  fecharBanco()
  rmSync(raiz, { recursive: true, force: true })
})

it('importa o banco JSON preservando números, datas e filhos', () => {
  const lista = repos.orcamentosRepo.list()
  expect(lista).toHaveLength(2)
  expect(lista.map((o) => o.numero).sort()).toEqual([1, 2])
  // Ordenação por criação, mais novo primeiro (igual à tela de histórico).
  expect(lista[0].numero).toBe(2)

  const primeiroResumo = lista.find((o) => o.numero === 1)!
  expect(primeiroResumo.servicosBusca).toEqual(['Cerca'])
  expect('materiais' in primeiroResumo).toBe(false)
  const primeiro = repos.orcamentosRepo.get(primeiroResumo.id)!
  expect(primeiro.data).toBe('2026-05-04')
  expect(primeiro.criadoEm).toBe('2026-01-01T12:00:00.000Z')
  expect(primeiro.itensServico).toHaveLength(1)
  expect(primeiro.itensServico[0].valorTotal).toBe(800)
  expect(primeiro.materiais[0].especificacao).toBe('Mourão')
  expect(primeiro.observacoes[0].texto).toContain('contratante')
  expect(primeiro.pagamentos[0].texto).toBe('Via Pix.')
  expect(primeiro.clienteId).toBe('cli-1')

  // O arquivo legado é arquivado, não apagado.
  expect(existsSync(join(raiz, 'data', 'banco.json'))).toBe(false)
  expect(readdirSync(join(raiz, 'data')).some((f) => f.includes('banco.json.migrado-'))).toBe(true)
})

it('migra datas ISO de um banco SQLite v5 para a data civil', () => {
  const caminho = join(raiz, 'datas-v5.db')
  const banco = new Database(caminho)
  try {
    aplicarMigracoes(banco, 5)
    banco.exec(`
      DROP TABLE orcamentos;
      DROP TABLE relatorios;
      CREATE TABLE orcamentos (id TEXT,numero INTEGER,data TEXT NOT NULL);
      CREATE TABLE relatorios (id TEXT,numero INTEGER,data TEXT NOT NULL);
      INSERT INTO orcamentos (numero,data) VALUES (1,'2026-05-04T12:00:00.000Z');
      INSERT INTO relatorios (numero,data) VALUES (1,'2026-05-05T00:00:00.000Z');
      PRAGMA user_version = 5;
    `)
    aplicarMigracoes(banco)

    expect(banco.get('SELECT data FROM orcamentos')?.data).toBe('2026-05-04')
    expect(banco.get('SELECT data FROM relatorios')?.data).toBe('2026-05-05')
    expect(banco.get('PRAGMA user_version')?.user_version).toBe(9)
  } finally {
    banco.close()
  }
})

it('gera relatório independente da proposta, com totais financeiros próprios', () => {
  const proposta = repos.orcamentosRepo.list().find((o) => o.numero === 1)!
  const relatorio = repos.relatoriosRepo.criarDeOrcamento(proposta.id)!
  expect(relatorio.numero).toBe(1)
  expect(relatorio.status).toBe('rascunho')
  expect(relatorio.itensServico).toEqual(
    expect.arrayContaining([expect.objectContaining({ descricao: 'Cerca', valorTotal: 800 })])
  )
  const atualizado = repos.relatoriosRepo.update(relatorio.id, {
    adiantamentos: [{ id: 'a1', descricao: 'Sinal', valor: 100 }],
    reembolsos: [{ id: 'r1', descricao: 'Combustível', valor: 25 }],
    observacaoInterna: 'Serviço concluído; falta conferir o reembolso.'
  })!
  expect(atualizado.totais.saldo).toBe(725)
  expect(repos.relatoriosRepo.get(relatorio.id)?.observacaoInterna).toContain('reembolso')
  expect(repos.orcamentosRepo.get(proposta.id)!.valorTotal).toBe(800)
})

it('mantém a numeração dos relatórios independente e não reutiliza números excluídos', () => {
  const proposta = repos.orcamentosRepo.list().find((o) => o.numero === 1)!
  const primeiro = repos.relatoriosRepo.criarDeOrcamento(proposta.id)!
  const segundo = repos.relatoriosRepo.criarDeOrcamento(proposta.id)!
  expect([primeiro.numero, segundo.numero]).toEqual([2, 3])

  repos.relatoriosRepo.remove(segundo.id)
  expect(repos.relatoriosRepo.proximoNumero()).toBe(4)
  expect(repos.relatoriosRepo.definirProximoNumero(1).ok).toBe(false)
  expect(repos.relatoriosRepo.definirProximoNumero(9).ok).toBe(true)
  expect(repos.relatoriosRepo.proximoNumero()).toBe(9)
})

/** Orçamento mínimo para os testes de numeração. */
function novoOrcamento(destinatario = 'A Fazenda Boa Vista,', numero?: number): Orcamento {
  return repos.orcamentosRepo.create({
    data: new Date().toISOString(),
    clienteId: null,
    destinatario,
    formato: 'carta',
    titulo: 'Proposta de Serviço',
    introducao: '',
    itensServico: [
      {
        id: 'i1',
        descricao: 'Alambrado',
        unidade: 'm',
        quantidade: 50,
        valorUnitario: 30,
        valorTotal: 1500,
        calculo: null
      }
    ],
    materiais: [],
    observacoes: [],
    pagamentos: [],
    anexos: [],
    prazoDias: null,
    observacaoInterna: 'Cliente pediu para revisar em agosto.',
    valorTotal: 1500,
    status: 'rascunho',
    numero
  })
}

it('numera novos orçamentos a partir do contador', () => {
  expect(repos.orcamentosRepo.proximoNumero()).toBe(3)
  const novo = novoOrcamento()
  expect(novo.numero).toBe(3)
  expect(novo.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(novo.observacaoInterna).toBe('Cliente pediu para revisar em agosto.')
  repos.orcamentosRepo.remove(novo.id)
})

it('permite rascunho incompleto e bloqueia status final sem campos essenciais', () => {
  const rascunho = novoOrcamento('   ')
  expect(rascunho.status).toBe('rascunho')
  expect(rascunho.destinatario).toBe('')
  expect(() => repos.orcamentosRepo.update(rascunho.id, { status: 'enviado' })).toThrow(
    'Informe o destinatário'
  )
  repos.orcamentosRepo.remove(rascunho.id)
})

it('preserva números utilizados após exclusões', () => {
  const a = novoOrcamento('A Sítio das Palmeiras,') // nº 3
  const b = novoOrcamento('A Chácara do Zé,') // nº 4
  expect([a.numero, b.numero]).toEqual([5, 6])

  // Excluir o do meio não mexe no contador: o 4 continua entregue.
  repos.orcamentosRepo.remove(a.id)
  expect(repos.orcamentosRepo.proximoNumero()).toBe(7)

  // Excluir o último entregue devolve exatamente esse número para reaproveitamento.
  repos.orcamentosRepo.remove(b.id)
  expect(repos.orcamentosRepo.proximoNumero()).toBe(7)
})

it('deixa escolher o próximo número e recusa os já usados', () => {
  expect(repos.orcamentosRepo.definirProximoNumero(7).ok).toBe(true)
  expect(repos.orcamentosRepo.proximoNumero()).toBe(7)

  const ocupado = repos.orcamentosRepo.definirProximoNumero(2)
  expect(ocupado.ok).toBe(false)
  expect(ocupado.erro).toContain('já é do orçamento')
  expect(ocupado.proximoLivre).toBe(7)

  expect(repos.orcamentosRepo.definirProximoNumero(0).ok).toBe(false)
  expect(repos.orcamentosRepo.definirProximoNumero(1.5).ok).toBe(false)
  // Nenhuma tentativa recusada altera o contador.
  expect(repos.orcamentosRepo.proximoNumero()).toBe(7)

  const criado = novoOrcamento('A Granja Modelo,')
  expect(criado.numero).toBe(7)

  // Um ajuste manual não é desfeito ao excluir um orçamento que não é o último.
  expect(repos.orcamentosRepo.definirProximoNumero(3).ok).toBe(false)
  repos.orcamentosRepo.remove(criado.id)
  expect(repos.orcamentosRepo.proximoNumero()).toBe(8)
})

it('altera o número de um orçamento e bloqueia duplicidade', () => {
  const alvo = repos.orcamentosRepo.list().find((o) => o.numero === 2)!

  const conflito = repos.orcamentosRepo.alterarNumero(alvo.id, 1)
  expect(conflito.ok).toBe(false)
  expect(conflito.erro).toContain('O número 1 já é do orçamento')
  // Sugere 3: o 2 está em uso — pelo próprio orçamento que se quer renumerar.
  expect(conflito.proximoLivre).toBe(8)
  // Nada mudou.
  expect(repos.orcamentosRepo.get(alvo.id)?.numero).toBe(2)

  expect(repos.orcamentosRepo.alterarNumero(alvo.id, 0).ok).toBe(false)

  const ok = repos.orcamentosRepo.alterarNumero(alvo.id, 20)
  expect(ok.ok).toBe(true)
  expect(ok.orcamento?.numero).toBe(20)
  // O contador acompanha para o próximo não colidir.
  expect(repos.orcamentosRepo.proximoNumero()).toBe(21)

  const info = repos.orcamentosRepo.numeracao()
  expect(info.maiorEmUso).toBe(20)
  expect(info.menorLivre).toBe(8)
  expect(info.totalDocumentos).toBe(2)

  // O número anterior também fica preservado no registro de uso.
  expect(repos.orcamentosRepo.alterarNumero(alvo.id, 2).ok).toBe(false)
})

it('grava a foto como texto deduplicado e devolve só a miniatura na leitura', () => {
  const resumo = repos.orcamentosRepo.list().find((o) => o.numero === 1)!
  const alvo = repos.orcamentosRepo.get(resumo.id)!
  const atualizado = repos.orcamentosRepo.update(alvo.id, {
    anexos: [
      {
        id: 'anexo-1',
        itemServicoId: alvo.itensServico[0].id,
        titulo: 'Divisa leste',
        descricao: 'Antes do serviço.',
        mime: 'image/png',
        largura: 1600,
        altura: 1200,
        miniaturaDataUrl: PNG,
        imagemDataUrl: PNG
      }
    ]
  })!
  anexoCriadoId = atualizado.anexos[0].id

  expect(atualizado.anexos).toHaveLength(1)
  expect(atualizado.anexos[0].titulo).toBe('Divisa leste')
  expect(atualizado.anexos[0].itemServicoId).toBe(alvo.itensServico[0].id)
  // A miniatura acompanha o orçamento; a imagem cheia, não.
  expect(atualizado.anexos[0].miniaturaDataUrl).toContain('data:image/png;base64,')
  expect(atualizado.anexos[0].imagemDataUrl).toBeUndefined()
  expect(repos.anexosRepo.imagem(anexoCriadoId)).toContain('data:image/png;base64,')
  expect(repos.anexosRepo.buffer(anexoCriadoId)?.length).toBeGreaterThan(50)
})

it('mantém o BLOB quando o orçamento é salvo de novo sem reenviar a imagem', () => {
  // A listagem compacta não traz anexos; o editor sempre carrega o documento completo por id.
  const daListagem = repos.orcamentosRepo.list().find((o) => o.numero === 1)!
  expect('anexos' in daListagem).toBe(false)

  const alvo = repos.orcamentosRepo.get(daListagem.id)!
  expect(alvo.anexos[0].miniaturaDataUrl).toContain('data:image/png;base64,')
  // É o que o editor faz: devolve o anexo como leu, sem `imagemDataUrl`.
  repos.orcamentosRepo.update(alvo.id, {
    anexos: [{ ...alvo.anexos[0], titulo: 'Divisa leste (revisado)' }]
  })
  const relido = repos.orcamentosRepo.get(alvo.id)!
  expect(relido.anexos[0].titulo).toBe('Divisa leste (revisado)')
  expect(repos.anexosRepo.buffer(anexoCriadoId)?.length).toBeGreaterThan(50)
})

it('duplica o orçamento copiando as fotos e religando-as aos novos itens', () => {
  const original = repos.orcamentosRepo.get(
    repos.orcamentosRepo.list().find((o) => o.numero === 1)!.id
  )!
  const copia = repos.orcamentosRepo.duplicate(original.id)!

  expect(copia.id).not.toBe(original.id)
  expect(copia.numero).toBeGreaterThan(20)
  expect(copia.status).toBe('rascunho')
  expect(copia.itensServico[0].id).not.toBe(original.itensServico[0].id)
  expect(copia.anexos).toHaveLength(1)
  // O vínculo aponta para o item da CÓPIA, não para o do original.
  expect(copia.anexos[0].itemServicoId).toBe(copia.itensServico[0].id)
  expect(repos.anexosRepo.buffer(copia.anexos[0].id)?.length).toBeGreaterThan(50)

  // Excluir a cópia não pode afetar o original.
  repos.orcamentosRepo.remove(copia.id)
  expect(repos.anexosRepo.buffer(anexoCriadoId)?.length).toBeGreaterThan(50)
})

it('salva e relê a configuração de IA', () => {
  expect(repos.configIARepo.get().modo).toBe('embutida')
  const salvo = repos.configIARepo.save({ modo: 'ollama', modeloOllama: 'qwen2.5:3b' })
  expect(salvo.modo).toBe('ollama')
  expect(repos.configIARepo.get().modeloOllama).toBe('qwen2.5:3b')
  // Campos não informados permanecem.
  expect(repos.configIARepo.get().urlOllama).toBe('http://localhost:11434')
  expect(() =>
    repos.configIARepo.save({ modo: 'ollama', urlOllama: 'https://api.externa.example' })
  ).toThrow('URL HTTP local')
})

it('desativa configuração Ollama legada que aponta para fora da máquina', () => {
  const anterior = repos.configIARepo.get()
  run('UPDATE configuracoes SET valor = ? WHERE chave = ?', [
    JSON.stringify({ ...anterior, modo: 'ollama', urlOllama: 'https://api.externa.example' }),
    'configIA'
  ])

  expect(repos.configIARepo.get()).toMatchObject({
    modo: 'desligada',
    urlOllama: 'http://localhost:11434'
  })
  repos.configIARepo.save(anterior)
})

it('não permite excluir cliente usado e permite inativá-lo', () => {
  const cliente = repos.clientesRepo.get('cli-1')!
  expect(() => repos.clientesRepo.remove(cliente.id)).toThrow('não pode ser excluído')
  const inativo = repos.clientesRepo.update(cliente.id, { ativo: false })!
  expect(inativo.ativo).toBe(false)
})

it('exporta e restaura relatório com anotação interna e comprovante em BLOB', async () => {
  const resumoRelatorio = repos.relatoriosRepo.list()[0]!
  expect('adiantamentos' in resumoRelatorio).toBe(false)
  const relatorio = repos.relatoriosRepo.get(resumoRelatorio.id)!
  const salvo = repos.relatoriosRepo.update(relatorio.id, {
    observacaoInterna: 'Backup: relatório conferido pela IA.',
    anexos: [
      {
        id: 'anexo-relatorio-backup',
        referenciaTipo: 'adiantamento',
        referenciaId: relatorio.adiantamentos[0]?.id ?? null,
        titulo: 'Comprovante do sinal',
        descricao: 'Preservado no backup.',
        mime: 'image/png',
        largura: 1600,
        altura: 1200,
        miniaturaDataUrl: PNG,
        imagemDataUrl: PNG
      }
    ]
  })!
  const { exportarDadosPara, importarDadosDe } = await import('../dados')
  const backup = join(raiz, 'backup-completo.gdo-backup')
  exportarDadosPara(backup)
  expect(existsSync(backup)).toBe(true)
  repos.relatoriosRepo.update(salvo.id, {
    observacaoInterna: 'Alterado depois da exportação.',
    anexos: []
  })

  const resultado = importarDadosDe(backup, 'restaurar')
  expect(resultado.reiniciarNecessario).toBe(true)
  expect(existsSync(resultado.backupAntes)).toBe(true)
  const restaurado = repos.relatoriosRepo.get(salvo.id)!
  expect(restaurado.observacaoInterna).toBe('Backup: relatório conferido pela IA.')
  expect(restaurado.anexos).toHaveLength(1)
  expect(repos.anexosRelatorioRepo.buffer(restaurado.anexos[0].id)?.length).toBeGreaterThan(50)
})

it('não duplica documentos ao importar o próprio backup', async () => {
  const { exportarDadosPara, importarDadosDe } = await import('../dados')
  const backup = join(raiz, 'backup-idempotente.gdo-backup')
  exportarDadosPara(backup)
  const orcamentosAntes = repos.orcamentosRepo.list().length
  const relatoriosAntes = repos.relatoriosRepo.list().length
  const primeira = importarDadosDe(backup, 'mesclar')
  const segunda = importarDadosDe(backup, 'mesclar')
  expect(primeira.importados.orcamentos).toBe(0)
  expect(primeira.importados.relatorios).toBe(0)
  expect(primeira.ignorados.orcamentos).toBe(orcamentosAntes)
  expect(primeira.ignorados.relatorios).toBe(relatoriosAntes)
  expect(primeira.renumerados).toEqual({ orcamentos: 0, relatorios: 0 })
  expect(segunda.importados.orcamentos).toBe(0)
  expect(segunda.importados.relatorios).toBe(0)
  expect(repos.orcamentosRepo.list()).toHaveLength(orcamentosAntes)
  expect(repos.relatoriosRepo.list()).toHaveLength(relatoriosAntes)
})
