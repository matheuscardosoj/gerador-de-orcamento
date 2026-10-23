import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ambiente = vi.hoisted(() => ({ raiz: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => ambiente.raiz, getVersion: () => '9.9.9' }
}))
import { montarRelatorioDiagnostico, pastaLogs, registrarDiagnostico } from './diagnostico'

beforeAll(() => {
  ambiente.raiz = mkdtempSync(join(tmpdir(), 'gdo-diagnostico-'))
})
afterAll(() => rmSync(ambiente.raiz, { recursive: true, force: true }))

function linhas(): Array<Record<string, unknown>> {
  return readFileSync(join(pastaLogs(), 'app.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

it('registra a causa real com um código curto e sem credenciais', () => {
  const causa = new Error('SQLITE_CORRUPT: database disk image is malformed')
  const erro = new Error('falha ao abrir', { cause: causa })
  const id = registrarDiagnostico('abrir-banco', erro, { backup: 'C:\\copia.db' })
  expect(id).toMatch(/^[0-9A-F]{6}$/)
  const [registro] = linhas().filter((l) => l.id === id)
  expect(registro).toMatchObject({ etapa: 'abrir-banco', versao: '9.9.9', backup: 'C:\\copia.db' })
  expect(registro.cadeia).toEqual([
    'falha ao abrir',
    'SQLITE_CORRUPT: database disk image is malformed'
  ])
  const senhas = registrarDiagnostico('login', new Error('falha com pessoa@example.com'))
  const texto = readFileSync(join(pastaLogs(), 'app.jsonl'), 'utf8')
  expect(texto).not.toContain('pessoa@example.com')
  expect(linhas().some((l) => l.id === senhas)).toBe(true)
})

it('não lança quando não consegue gravar o registro', () => {
  const anterior = ambiente.raiz
  const arquivo = join(anterior, 'ocupado')
  writeFileSync(arquivo, 'x')
  ambiente.raiz = arquivo // userData apontando para um arquivo: mkdir falha
  expect(() => registrarDiagnostico('etapa', new Error('x'))).not.toThrow()
  ambiente.raiz = anterior
})

it('o relatório mostra perfis, trava e contas.json ilegível sem expor e-mails', () => {
  const perfil = 'a'.repeat(64)
  const dados = join(ambiente.raiz, 'perfis', perfil, 'data')
  mkdirSync(dados, { recursive: true })
  writeFileSync(join(dados, 'banco.db'), 'abc')
  writeFileSync(join(dados, 'banco.lock'), '4242\n')
  writeFileSync(
    join(ambiente.raiz, 'contas.json'),
    '{"atual": "aaaa", "perfis": [{"email":"pessoa@'
  )
  const relatorio = JSON.parse(montarRelatorioDiagnostico())
  expect(relatorio.aplicativo).toBe('9.9.9')
  expect(relatorio.contas).toMatchObject({ existe: true, legivel: false })
  expect(relatorio.perfis).toEqual([
    expect.objectContaining({ perfil: 'aaaaaaaa', banco: 3, trava: '4242' })
  ])
  expect(JSON.stringify(relatorio)).not.toContain('pessoa@')
  expect(relatorio.registros.length).toBeGreaterThan(0)
  expect(existsSync(join(ambiente.raiz, 'contas.json'))).toBe(true)
})
