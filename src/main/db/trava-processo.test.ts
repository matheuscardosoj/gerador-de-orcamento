import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ambiente = vi.hoisted(() => ({ raiz: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => ambiente.raiz, getVersion: () => '9.9.9' }
}))
import { conteudoDaTrava, inicioDoProcesso, travaObsoleta } from './trava-processo'
import { abrirBanco, fecharBanco, selecionarPerfilDados, pastaDados } from './sqlite'

const AGORA = Date.UTC(2026, 9, 23, 12, 0, 0)

it('PID reaproveitado: processo que começou depois da trava (formato antigo, só o PID)', () => {
  const gravadaEm = AGORA - 2 * 24 * 3600 * 1000
  expect(travaObsoleta('41740\n', gravadaEm, () => AGORA)).toBe(true)
})

it('dono verdadeiro: começou antes da trava ou na hora registrada por ele', () => {
  expect(travaObsoleta('41740\n', AGORA, () => AGORA - 60_000)).toBe(false)
  expect(travaObsoleta(`41740\n${AGORA}\n`, AGORA + 10, () => AGORA + 1_000)).toBe(false)
  expect(travaObsoleta(`41740\n${AGORA}\n`, AGORA, () => AGORA + 3_600_000)).toBe(true)
})

it('sem conseguir consultar o processo, a trava continua valendo', () => {
  expect(travaObsoleta('41740\n', AGORA - 1_000_000, () => null)).toBe(false)
})

it('conteúdo ilegível não segura o banco', () => {
  expect(travaObsoleta('', AGORA, () => AGORA)).toBe(true)
  expect(travaObsoleta('abc', AGORA, () => AGORA)).toBe(true)
})

it('a trava gravada traz o PID e a hora de início deste processo', () => {
  const [pid, inicio] = conteudoDaTrava().trim().split('\n')
  expect(Number(pid)).toBe(process.pid)
  expect(Math.abs(Number(inicio) - (Date.now() - process.uptime() * 1000))).toBeLessThan(2_000)
})

const noWindows = process.platform === 'win32' ? it : it.skip

noWindows(
  'lê a hora de início de um processo existente',
  () => {
    const inicio = inicioDoProcesso(process.pid)
    expect(inicio).not.toBeNull()
    expect(Math.abs((inicio as number) - (Date.now() - process.uptime() * 1000))).toBeLessThan(
      10_000
    )
  },
  30_000
)

beforeAll(() => {
  ambiente.raiz = mkdtempSync(join(tmpdir(), 'gdo-trava-'))
})
afterAll(() => {
  fecharBanco()
  selecionarPerfilDados(null)
  rmSync(ambiente.raiz, { recursive: true, force: true })
})

noWindows(
  'abre o banco quando o banco.lock é de uma execução antiga cujo PID outro processo ocupa hoje',
  () => {
    selecionarPerfilDados('c'.repeat(64))
    const lock = join(pastaDados(), 'banco.lock')
    mkdirSync(pastaDados(), { recursive: true })
    // PID de um processo vivo (este), gravado dois dias atrás, no formato antigo (só o PID).
    writeFileSync(lock, `${process.pid}\n`)
    const antigo = new Date(Date.now() - 2 * 24 * 3600 * 1000)
    utimesSync(lock, antigo, antigo)
    expect(() => abrirBanco()).not.toThrow()
    expect(readFileSync(lock, 'utf8').split('\n')[1]).toMatch(/^\d+$/)
    fecharBanco()
    expect(existsSync(lock)).toBe(false)
  },
  30_000
)

noWindows(
  'continua recusando quando o dono da trava é um processo que já estava aberto',
  () => {
    selecionarPerfilDados('d'.repeat(64))
    const lock = join(pastaDados(), 'banco.lock')
    mkdirSync(pastaDados(), { recursive: true })
    writeFileSync(lock, conteudoDaTrava())
    expect(() => abrirBanco()).toThrow(/código [0-9A-F]{6}/)
    rmSync(lock)
  },
  30_000
)
