import { registrarImagem } from './imagens'
import { Database } from 'node-sqlite3-wasm'
import { randomUUID } from 'crypto'
import { get, run, type Linha } from './db/sqlite'
import type { ItemMaterial, ItemServico, ItemTexto, LancamentoRelatorio } from '@shared/types'

import { type Resumo, tabelasDeDados as tabelas } from './dados-comuns'

export function resumo(): Resumo {
  return {
    importados: Object.fromEntries(tabelas.map((t) => [t, 0])),
    ignorados: Object.fromEntries(tabelas.map((t) => [t, 0])),
    renumerados: { orcamentos: 0, relatorios: 0 }
  }
}
export function contar(
  r: Resumo,
  grupo: keyof Resumo['importados'],
  tipo: 'importados' | 'ignorados'
): void {
  r[tipo][grupo] = (r[tipo][grupo] ?? 0) + 1
}
export function linha(l: Linha): Record<string, unknown> {
  return l as Record<string, unknown>
}
export function linhas(fonte: Database, sql: string, valores: unknown[] = []): Linha[] {
  return fonte.all(sql, valores as never) as Linha[]
}
export function temTabela(fonte: Database, nome: string): boolean {
  return Boolean(
    fonte.get("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?", [
      nome
    ] as never)
  )
}

export function imagemImportada(_fonte: Database, x: Record<string, unknown>): string | null {
  if (!x.imagem) return null
  if (typeof x.imagem === 'string') return x.imagem
  const mime = String(x.mime || 'image/jpeg')
  return registrarImagem(
    `data:${mime};base64,${Buffer.from(x.imagem as Uint8Array).toString('base64')}`,
    x.miniatura
      ? `data:${mime};base64,${Buffer.from(x.miniatura as Uint8Array).toString('base64')}`
      : null,
    Number(x.largura),
    Number(x.altura),
    true
  )
}
export function copiarAnexosOrcamento(
  fonte: Database,
  origemId: string,
  destinoId: string,
  itens: Map<string, string>
): number {
  if (!temTabela(fonte, 'anexos')) return 0
  let total = 0
  for (const a of linhas(fonte, 'SELECT * FROM anexos WHERE orcamento_id = ? ORDER BY ordem', [
    origemId
  ])) {
    const x = linha(a)
    run(
      `INSERT INTO anexos (id, orcamento_id, item_servico_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        destinoId,
        x.item_servico_id ? (itens.get(String(x.item_servico_id)) ?? null) : null,
        x.ordem,
        x.titulo,
        x.descricao,
        x.mime,
        x.largura,
        x.altura,
        imagemImportada(fonte, x),
        null
      ]
    )
    total++
  }
  return total
}

export function copiarAnexosRelatorio(
  fonte: Database,
  origemId: string,
  destinoId: string,
  referencias: Map<string, string>
): number {
  if (!temTabela(fonte, 'relatorio_anexos')) return 0
  let total = 0
  for (const a of linhas(
    fonte,
    'SELECT * FROM relatorio_anexos WHERE relatorio_id = ? ORDER BY ordem',
    [origemId]
  )) {
    const x = linha(a)
    run(
      `INSERT INTO relatorio_anexos (id, relatorio_id, referencia_tipo, referencia_id, ordem, titulo, descricao, mime, largura, altura, imagem, miniatura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        destinoId,
        x.referencia_tipo,
        x.referencia_id ? (referencias.get(String(x.referencia_id)) ?? null) : null,
        x.ordem,
        x.titulo,
        x.descricao,
        x.mime,
        x.largura,
        x.altura,
        imagemImportada(fonte, x),
        null
      ]
    )
    total++
  }
  return total
}

export function itensOrcamento(
  fonte: Database,
  id: string,
  servicos: Map<string, string>,
  observacoes: Map<string, string>,
  pagamentos: Map<string, string>
): {
  itensServico: ItemServico[]
  materiais: ItemMaterial[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
} {
  const itensServico = linhas(
    fonte,
    'SELECT * FROM itens_servico WHERE orcamento_id = ? ORDER BY ordem',
    [id]
  ).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      servicoId: x.servico_id ? (servicos.get(String(x.servico_id)) ?? null) : null,
      descricao: String(x.descricao ?? ''),
      unidade: String(x.unidade ?? ''),
      quantidade: Number(x.quantidade ?? 0),
      valorUnitario: Number(x.valor_unitario ?? 0),
      valorTotal: Number(x.valor_total ?? 0),
      calculo: x.calculo_json ? JSON.parse(String(x.calculo_json)) : null
    }
  })
  const materiais = linhas(fonte, 'SELECT * FROM materiais WHERE orcamento_id = ? ORDER BY ordem', [
    id
  ]).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      quantidade: Number(x.quantidade ?? 0),
      unidade: String(x.unidade ?? ''),
      especificacao: String(x.especificacao ?? '')
    }
  })
  const textosDoTipo = (tipo: string, mapa: Map<string, string>): ItemTexto[] =>
    linhas(
      fonte,
      'SELECT * FROM orcamento_textos WHERE orcamento_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      const origem = x.origem_padrao_id ? (mapa.get(String(x.origem_padrao_id)) ?? null) : null
      return { id: String(x.id), texto: String(x.texto ?? ''), origemPadraoId: origem }
    })
  return {
    itensServico,
    materiais,
    observacoes: textosDoTipo('observacao', observacoes),
    pagamentos: textosDoTipo('pagamento', pagamentos)
  }
}

export function itensRelatorio(
  fonte: Database,
  id: string,
  servicos: Map<string, string>,
  observacoes: Map<string, string>,
  pagamentos: Map<string, string>
): {
  itensServico: ItemServico[]
  adiantamentos: LancamentoRelatorio[]
  reembolsos: LancamentoRelatorio[]
  observacoes: ItemTexto[]
  pagamentos: ItemTexto[]
} {
  const itensServico = linhas(
    fonte,
    'SELECT * FROM relatorio_itens_servico WHERE relatorio_id = ? ORDER BY ordem',
    [id]
  ).map((l) => {
    const x = linha(l)
    return {
      id: String(x.id),
      servicoId: x.servico_id ? (servicos.get(String(x.servico_id)) ?? null) : null,
      descricao: String(x.descricao ?? ''),
      unidade: String(x.unidade ?? ''),
      quantidade: Number(x.quantidade ?? 0),
      valorUnitario: Number(x.valor_unitario ?? 0),
      valorTotal: Number(x.valor_total ?? 0),
      calculo: x.calculo_json ? JSON.parse(String(x.calculo_json)) : null
    }
  })
  const lancamentos = (tipo: string): LancamentoRelatorio[] =>
    linhas(
      fonte,
      'SELECT * FROM relatorio_lancamentos WHERE relatorio_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      return { id: String(x.id), descricao: String(x.descricao ?? ''), valor: Number(x.valor ?? 0) }
    })
  const textosDoTipo = (tipo: string, mapa: Map<string, string>): ItemTexto[] =>
    linhas(
      fonte,
      'SELECT * FROM relatorio_textos WHERE relatorio_id = ? AND tipo = ? ORDER BY ordem',
      [id, tipo]
    ).map((l) => {
      const x = linha(l)
      return {
        id: String(x.id),
        texto: String(x.texto ?? ''),
        origemPadraoId: x.origem_padrao_id ? (mapa.get(String(x.origem_padrao_id)) ?? null) : null
      }
    })
  return {
    itensServico,
    adiantamentos: lancamentos('adiantamento'),
    reembolsos: lancamentos('reembolso'),
    observacoes: textosDoTipo('observacao', observacoes),
    pagamentos: textosDoTipo('pagamento', pagamentos)
  }
}

export function novosIdsOrcamento(filhos: ReturnType<typeof itensOrcamento>): {
  filhos: ReturnType<typeof itensOrcamento>
  referencias: Map<string, string>
} {
  const referencias = new Map<string, string>()
  const itensServico = filhos.itensServico.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  return {
    filhos: {
      ...filhos,
      itensServico,
      materiais: filhos.materiais.map((item) => ({ ...item, id: randomUUID() })),
      observacoes: filhos.observacoes.map((item) => ({ ...item, id: randomUUID() })),
      pagamentos: filhos.pagamentos.map((item) => ({ ...item, id: randomUUID() }))
    },
    referencias
  }
}

export function novosIdsRelatorio(filhos: ReturnType<typeof itensRelatorio>): {
  filhos: ReturnType<typeof itensRelatorio>
  referencias: Map<string, string>
} {
  const referencias = new Map<string, string>()
  const itensServico = filhos.itensServico.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  const adiantamentos = filhos.adiantamentos.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  const reembolsos = filhos.reembolsos.map((item) => {
    const id = randomUUID()
    referencias.set(item.id, id)
    return { ...item, id }
  })
  return {
    filhos: {
      ...filhos,
      itensServico,
      adiantamentos,
      reembolsos,
      observacoes: filhos.observacoes.map((item) => ({ ...item, id: randomUUID() })),
      pagamentos: filhos.pagamentos.map((item) => ({ ...item, id: randomUUID() }))
    },
    referencias
  }
}

export function idLivre(
  tabela: 'clientes' | 'servicos' | 'observacoes_padrao' | 'pagamentos_padrao',
  desejado: string
): string {
  return get(`SELECT 1 AS existe FROM ${tabela} WHERE id = ?`, [desejado]) ? randomUUID() : desejado
}
