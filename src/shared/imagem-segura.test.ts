import { describe, expect, it } from 'vitest'
import { PADRAO_DATA_URL_IMAGEM, linhaImagemValida } from './imagem-segura'

const hash = 'a'.repeat(64)
const base = {
  hash,
  mime: 'image/png',
  base64: 'iVBORw0KGgo=',
  miniatura_base64: null,
  bytes: 8,
  largura: 10,
  altura: 10
}

describe('linhaImagemValida', () => {
  it('aceita a linha gerada pelo próprio aplicativo', () => {
    expect(linhaImagemValida(base)).toBe(true)
    expect(linhaImagemValida({ ...base, mime: 'image/jpeg', miniatura_base64: 'AAAA' })).toBe(true)
  })

  it('recusa mime fora de png/jpeg, inclusive com injeção de atributo', () => {
    expect(linhaImagemValida({ ...base, mime: 'image/svg+xml' })).toBe(false)
    expect(linhaImagemValida({ ...base, mime: 'image/png;base64,AA" onerror="x' })).toBe(false)
    expect(linhaImagemValida({ ...base, mime: 'text/html' })).toBe(false)
  })

  it('recusa base64 e miniatura com caracteres fora do alfabeto', () => {
    expect(linhaImagemValida({ ...base, base64: 'AAAA" onerror="x' })).toBe(false)
    expect(linhaImagemValida({ ...base, base64: '' })).toBe(false)
    expect(linhaImagemValida({ ...base, miniatura_base64: 'AA AA' })).toBe(false)
    expect(linhaImagemValida({ ...base, miniatura_base64: 123 })).toBe(false)
  })

  it('recusa hash e números inválidos', () => {
    expect(linhaImagemValida({ ...base, hash: 'abc' })).toBe(false)
    expect(linhaImagemValida({ ...base, hash: 'G'.repeat(64) })).toBe(false)
    expect(linhaImagemValida({ ...base, bytes: '8' })).toBe(false)
    expect(linhaImagemValida({ ...base, largura: Number.NaN })).toBe(false)
  })
})

describe('PADRAO_DATA_URL_IMAGEM', () => {
  it('só aceita data URL de imagem com base64', () => {
    expect(PADRAO_DATA_URL_IMAGEM.test('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(PADRAO_DATA_URL_IMAGEM.test('data:image/png;base64,AA"x')).toBe(false)
    expect(PADRAO_DATA_URL_IMAGEM.test('data:text/html;base64,AAAA')).toBe(false)
    expect(PADRAO_DATA_URL_IMAGEM.test('javascript:alert(1)')).toBe(false)
  })
})
