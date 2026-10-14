// Persistência do cadastro; documentos mantêm seus snapshots independentes.
import { randomUUID } from 'crypto'
import { validarCliente, normalizarTipoCliente } from '@shared/clientes'
import type { Cliente } from '@shared/types'
import { all, get, run, tx, bool, paraBool, texto, textoOuNulo } from '../db/sqlite'
import type { Linha } from '../db/sqlite'
import { proximoCodigoCadastro } from '../codigos-cadastros'

// ---------------------------------------------------------------- Clientes
const paraCliente = (l: Linha): Cliente => ({
  ...JSON.parse(texto(l.dados_json) || '{}'),
  id: texto(l.id),
  nome: texto(l.nome),
  tratamento: texto(l.tratamento),
  contato: textoOuNulo(l.contato) ?? undefined,
  observacao: textoOuNulo(l.observacao) ?? undefined,
  ativo: paraBool(l.ativo),
  criadoEm: texto(l.criado_em)
})

export const clientesRepo = {
  list: (): Cliente[] =>
    all('SELECT * FROM clientes ORDER BY nome COLLATE NOCASE').map(paraCliente),
  get: (id: string): Cliente | null => {
    const l = get('SELECT * FROM clientes WHERE id = ?', [id])
    return l ? paraCliente(l) : null
  },
  create: (dto: Omit<Cliente, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string }): Cliente => {
    const id = dto.id ?? randomUUID()
    const cliente: Cliente = {
      ...dto,
      tipoPessoa: normalizarTipoCliente(dto),
      id,
      criadoEm: dto.criadoEm ?? new Date().toISOString(),
      nome: dto.nome,
      tratamento: dto.tratamento,
      contato: dto.contato,
      observacao: dto.observacao,
      ativo: dto.ativo ?? true
    }
    validarCliente(cliente)
    return tx(() => {
      cliente.codigo = proximoCodigoCadastro('cliente', id)
      run(
        `INSERT INTO clientes (id, nome, tratamento, contato, observacao, ativo, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente.id,
          cliente.nome,
          cliente.tratamento,
          cliente.contato ?? null,
          cliente.observacao ?? null,
          bool(cliente.ativo),
          cliente.criadoEm
        ]
      )
      run('UPDATE clientes SET dados_json = ? WHERE id = ?', [JSON.stringify(cliente), cliente.id])
      return cliente
    })
  },
  update: (id: string, patch: Partial<Cliente>): Cliente | null => {
    const atual = clientesRepo.get(id)
    if (!atual) return null
    const novo = {
      ...atual,
      ...patch,
      id,
      codigo: atual.codigo,
      tipoPessoa: normalizarTipoCliente({ ...atual, ...patch })
    }
    validarCliente(novo)
    run(
      `UPDATE clientes SET nome = ?, tratamento = ?, contato = ?, observacao = ?, ativo = ? WHERE id = ?`,
      [
        novo.nome,
        novo.tratamento,
        novo.contato ?? null,
        novo.observacao ?? null,
        bool(novo.ativo),
        id
      ]
    )
    run('UPDATE clientes SET dados_json = ? WHERE id = ?', [JSON.stringify(novo), id])
    return novo
  },
  remove: (id: string): void => {
    const uso = get(
      `SELECT 1 AS usado FROM orcamentos WHERE cliente_id = ?
       UNION ALL SELECT 1 AS usado FROM relatorios WHERE cliente_id = ?
       UNION ALL SELECT 1 AS usado FROM recibos WHERE json_extract(dados,'$.clienteId') = ? LIMIT 1`,
      [id, id, id]
    )
    if (uso) {
      throw new Error(
        'Este cliente já foi usado em documentos e não pode ser excluído. Marque-o como inativo.'
      )
    }
    run('DELETE FROM clientes WHERE id = ?', [id])
  }
}
