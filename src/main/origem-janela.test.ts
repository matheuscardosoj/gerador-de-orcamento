import { describe, expect, it } from 'vitest'
import { urlDoAplicativo } from './origem-janela'

describe('urlDoAplicativo', () => {
  it('aceita o index.html empacotado', () => {
    expect(
      urlDoAplicativo('file:///C:/Program%20Files/App/resources/app/out/renderer/index.html')
    ).toBe(true)
    expect(urlDoAplicativo('file:///C:/app/out/renderer/index.html#/historico')).toBe(true)
  })

  it('recusa outros arquivos locais e endereços remotos', () => {
    expect(urlDoAplicativo('file:///C:/Users/x/Documents/outra.html')).toBe(false)
    expect(urlDoAplicativo('https://exemplo.com/renderer/index.html')).toBe(false)
    expect(urlDoAplicativo('about:blank')).toBe(false)
    expect(urlDoAplicativo('')).toBe(false)
    expect(urlDoAplicativo('texto qualquer')).toBe(false)
  })

  it('aceita o servidor de desenvolvimento só quando informado', () => {
    expect(urlDoAplicativo('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(urlDoAplicativo('http://localhost:5173/x', 'http://localhost:5173')).toBe(true)
    expect(urlDoAplicativo('http://localhost:5173/')).toBe(false)
    expect(urlDoAplicativo('http://localhost:9999/', 'http://localhost:5173')).toBe(false)
  })
})
