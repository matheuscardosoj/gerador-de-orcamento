import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Recibo } from '@shared/types'

const estado = vi.hoisted(() => ({ perfil: '' }))
const raiz = mkdtempSync(join(tmpdir(), 'gdo-clientes-recibos-'))
vi.mock('electron', () => ({
  app: { getPath: () => estado.perfil, getAppPath: () => estado.perfil, isPackaged: false }
}))
let sql: typeof import('./sqlite'),
  repos: typeof import('../repositories'),
  recibos: typeof import('../recibos')
beforeAll(async () => {
  sql = await import('./sqlite')
  repos = await import('../repositories')
  recibos = await import('../recibos')
})
beforeEach(() => {
  estado.perfil = mkdtempSync(join(raiz, 'perfil-'))
  sql.abrirBanco()
  repos.semear()
})
afterEach(() => sql.fecharBanco())
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

it.each(['rascunho', 'pendente', 'recebido', 'cancelado'] as const)(
  'impede excluir cliente vinculado a recibo %s e permite inativação sem alterar o documento',
  (estadoRecibo) => {
    const cliente = repos.clientesRepo.create({
      nome: 'Cliente vinculado',
      tratamento: '',
      ativo: true
    })
    const recibo = recibos.recibosRepo.create({
      clienteId: cliente.id,
      data: '2026-10-12',
      destinatario: cliente.nome,
      descricao: 'Serviço prestado',
      valor: 100,
      local: 'Rio Verde',
      formaPagamento: 'Pix',
      status: estadoRecibo === 'rascunho' ? 'rascunho' : 'pendente',
      quitacao: 'total',
      observacao: ''
    })
    if (estadoRecibo === 'recebido' || estadoRecibo === 'cancelado')
      recibos.recibosRepo.confirmar(recibo.id)
    if (estadoRecibo === 'cancelado') recibos.recibosRepo.cancelar(recibo.id)
    const documentoAntes = recibos.recibosRepo.get(recibo.id)
    const versoesAntes = sql.all('SELECT * FROM versoes WHERE documento_id=? ORDER BY numero', [
      recibo.id
    ])
    const recebimentosAntes = sql.all('SELECT * FROM recebimentos WHERE recibo_id=?', [recibo.id])

    expect(() => repos.clientesRepo.remove(cliente.id)).toThrow('Marque-o como inativo')
    expect(repos.clientesRepo.get(cliente.id)).toEqual(cliente)
    expect(repos.clientesRepo.update(cliente.id, { ativo: false })?.ativo).toBe(false)
    expect(recibos.recibosRepo.get(recibo.id)).toEqual(documentoAntes)
    expect(
      sql.all('SELECT * FROM versoes WHERE documento_id=? ORDER BY numero', [recibo.id])
    ).toEqual(versoesAntes)
    expect(sql.all('SELECT * FROM recebimentos WHERE recibo_id=?', [recibo.id])).toEqual(
      recebimentosAntes
    )
  }
)

it('permite excluir cliente sem vínculos e não altera um recibo avulso', () => {
  const cliente = repos.clientesRepo.create({
    nome: 'Cliente sem vínculo',
    tratamento: '',
    ativo: true
  })
  const recibo = recibos.recibosRepo.create({
    data: '2026-10-12',
    destinatario: 'Outra pessoa',
    descricao: 'Serviço',
    valor: 10,
    local: 'Rio Verde',
    formaPagamento: 'Pix',
    status: 'rascunho',
    quitacao: 'parcial',
    observacao: ''
  })
  repos.clientesRepo.remove(cliente.id)
  expect(repos.clientesRepo.get(cliente.id)).toBeNull()
  expect(recibos.recibosRepo.get(recibo.id)).toEqual(recibo as Recibo)
})
