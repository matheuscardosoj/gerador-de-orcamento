import { describe, expect, it } from 'vitest'
import {
  CHAVE_PREFERENCIA_TEMA,
  lerPreferenciaTema,
  modoNativoTema,
  normalizarPreferenciaTema,
  resolverTema,
  salvarPreferenciaTema
} from './tema'

const memoria = (inicial: Record<string, string> = {}) => {
  const dados = { ...inicial }
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => {
      dados[k] = v
    }
  }
}

describe('normalizarPreferenciaTema', () => {
  it('aceita só os três valores conhecidos', () => {
    for (const v of ['claro', 'escuro', 'sistema'] as const)
      expect(normalizarPreferenciaTema(v)).toBe(v)
  })

  it('volta ao padrão claro para qualquer outra coisa', () => {
    for (const v of [null, undefined, '', 'dark', 'ESCURO', 1, {}, ['escuro']])
      expect(normalizarPreferenciaTema(v)).toBe('claro')
  })
})

describe('lerPreferenciaTema / salvarPreferenciaTema', () => {
  it('guarda e relê a escolha, como ao fechar e abrir o aplicativo', () => {
    const a = memoria()
    expect(lerPreferenciaTema(a)).toBe('claro')
    expect(salvarPreferenciaTema(a, 'escuro')).toBe(true)
    expect(a.dados[CHAVE_PREFERENCIA_TEMA]).toBe('escuro')
    expect(lerPreferenciaTema(a)).toBe('escuro')
  })

  it('ignora valor corrompido no armazenamento', () => {
    expect(lerPreferenciaTema(memoria({ [CHAVE_PREFERENCIA_TEMA]: '{lixo' }))).toBe('claro')
  })

  it('funciona sem armazenamento e quando ele lança', () => {
    const quebrado = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      }
    }
    expect(lerPreferenciaTema(null)).toBe('claro')
    expect(lerPreferenciaTema(quebrado)).toBe('claro')
    expect(salvarPreferenciaTema(null, 'escuro')).toBe(false)
    expect(salvarPreferenciaTema(quebrado, 'escuro')).toBe(false)
  })
})

describe('resolverTema', () => {
  it('claro e escuro ignoram o sistema', () => {
    expect(resolverTema('claro', true)).toBe('claro')
    expect(resolverTema('escuro', false)).toBe('escuro')
  })

  it('sistema segue o tema do Windows', () => {
    expect(resolverTema('sistema', true)).toBe('escuro')
    expect(resolverTema('sistema', false)).toBe('claro')
  })
})

describe('modoNativoTema', () => {
  it('mapeia para o themeSource do Electron', () => {
    expect(modoNativoTema('claro')).toBe('light')
    expect(modoNativoTema('escuro')).toBe('dark')
    expect(modoNativoTema('sistema')).toBe('system')
  })
})
