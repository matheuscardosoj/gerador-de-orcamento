import { afterAll, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ambiente = vi.hoisted(() => ({ raiz: '' }))
vi.mock('electron', () => ({ app: { getPath: () => ambiente.raiz } }))
import {
  gravarPerfil,
  idPerfil,
  lerPerfis,
  perfilAtual,
  idSolicitacao,
  concluirSolicitacao,
  removerPerfil,
  type PerfilConta
} from './perfis'
import { abrirBanco, fecharBanco, selecionarPerfilDados, run, get } from '../db/sqlite'

ambiente.raiz = mkdtempSync(join(tmpdir(), 'gdo-perfis-'))
it('retoma a mesma solicitação persistida sem duplicar a empresa após falha de rede', () => {
  const dados = { empresaNome: 'Empresa nova', email: 'convidado@example.com' }
  const id = idSolicitacao('conta-a', dados)
  expect(idSolicitacao('conta-a', dados)).toBe(id)
  expect(idSolicitacao('conta-b', dados)).not.toBe(id)
  expect(Object.values(lerPerfis().solicitacoes ?? {})).toContain(id)
  expect(readFileSync(join(ambiente.raiz, 'contas.json'), 'utf8')).not.toContain(dados.email)
  concluirSolicitacao('conta-a', dados)
  expect(idSolicitacao('conta-a', dados)).not.toBe(id)
})
afterAll(() => {
  fecharBanco()
  selecionarPerfilDados(null)
  rmSync(ambiente.raiz, { recursive: true, force: true })
})
it('separa os dados por projeto, empresa e usuário ao trocar e reabrir a base', () => {
  const a = idPerfil('https://a.supabase.co', 'empresa', 'pessoa-a')
  const b = idPerfil('https://a.supabase.co', 'empresa', 'pessoa-b')
  const c = idPerfil('https://a.supabase.co', 'outra', 'pessoa-a')
  expect(new Set([a, b, c, idPerfil('https://b.supabase.co', 'empresa', 'pessoa-a')]).size).toBe(4)
  selecionarPerfilDados(a)
  abrirBanco()
  run('INSERT INTO configuracoes(chave,valor) VALUES (?,?)', ['somente-a', '"privado"'])
  expect(() => selecionarPerfilDados(b)).toThrow('Feche a base')
  fecharBanco()
  selecionarPerfilDados(b)
  abrirBanco()
  expect(get('SELECT valor FROM configuracoes WHERE chave=?', ['somente-a'])).toBeNull()
  fecharBanco()
  selecionarPerfilDados(a)
  abrirBanco()
  expect(get('SELECT valor FROM configuracoes WHERE chave=?', ['somente-a'])?.valor).toBe(
    '"privado"'
  )
  fecharBanco()
})
it('preserva os perfis ao sair e registra a escolha de lembrar sem guardar senha', () => {
  const p: PerfilConta = {
    id: idPerfil('https://a.supabase.co', 'empresa', 'usuario'),
    usuario: 'usuario',
    email: 'pessoa@example.com',
    nome: 'Pessoa',
    empresa: { id: 'empresa', nome: 'Empresa', papel: 'administrador' },
    lembrar: true,
    central: true,
    operador: false,
    configuracao: {
      url: 'https://a.supabase.co',
      chavePublica: 'sb_publishable_teste',
      email: 'pessoa@example.com'
    }
  }
  gravarPerfil(p)
  gravarPerfil({ ...p, lembrar: false })
  expect(lerPerfis().perfis).toHaveLength(1)
  expect(perfilAtual()?.lembrar).toBe(false)
  expect(readFileSync(join(ambiente.raiz, 'contas.json'), 'utf8')).not.toMatch(
    /access_token|refresh_token|password|senha/
  )
})
it('guarda um contas.json truncado ao lado e segue sem perfis salvos', () => {
  const caminho = join(ambiente.raiz, 'contas.json')
  const antes = readFileSync(caminho, 'utf8')
  writeFileSync(caminho, '{"atual": "abc", "perfis": [{"id"')
  expect(lerPerfis()).toEqual({ atual: null, perfis: [] })
  const guardados = readdirSync(ambiente.raiz).filter((n) =>
    n.startsWith('contas.json.corrompido-')
  )
  expect(guardados).toHaveLength(1)
  expect(readFileSync(join(ambiente.raiz, guardados[0]), 'utf8')).toBe(
    '{"atual": "abc", "perfis": [{"id"'
  )
  expect(existsSync(caminho)).toBe(false)
  writeFileSync(caminho, antes)
})
it('apaga somente o perfil local que o servidor marcou como empresa removida', () => {
  const id = idPerfil('https://a.supabase.co', 'empresa-removida', 'usuario')
  const diretorio = join(ambiente.raiz, 'perfis', id)
  mkdirSync(diretorio, { recursive: true })
  writeFileSync(join(diretorio, 'banco.db'), 'perfil da empresa')
  removerPerfil(id)
  expect(lerPerfis().perfis.some((perfil) => perfil.id === id)).toBe(false)
  expect(() => readFileSync(join(diretorio, 'banco.db'))).toThrow()
})
