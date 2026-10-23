// @vitest-environment jsdom
// Fumaça do renderer: monta o App inteiro contra a API de demonstração e percorre as telas
// principais. Pega erro de renderização, import quebrado e tela que lança ao abrir.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

beforeAll(() => {
  // O jsdom não implementa estes recursos usados pela interface.
  window.matchMedia ??= ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
  window.scrollTo = (() => undefined) as typeof window.scrollTo
  Element.prototype.scrollIntoView = () => undefined
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})
afterEach(() => cleanup())

describe('App (API de demonstração)', () => {
  it('abre na tela de acesso e entra na empresa de demonstração', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { default: App } = await import('./App')
    const { api } = await import('./lib/api')
    render(<App />)
    await screen.findByRole('button', { name: 'Entrar' })
    await api.conta.entrar('pessoa@example.com', 'x', false)
    await api.conta.selecionarEmpresa('demo')
    cleanup()
    render(<App />)
    await screen.findByRole('button', { name: /Orçamentos/ })
    expect(erros).not.toHaveBeenCalled()
  })

  it.each([
    ['Orçamentos', 'Novo orçamento'],
    ['Relatórios', 'Novo relatório']
  ])('abre o editor em %s ("%s") sem erro', async (tela, novo) => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${tela}`) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(novo) }))
    await waitFor(() => expect(screen.queryByRole('button', { name: new RegExp(novo) })).toBeNull())
    // Há campos do documento para preencher e a tela segue renderizada.
    await waitFor(() => expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0))
    expect(erros).not.toHaveBeenCalled()
  })

  it.each(['Relatórios', 'Recibos', 'Cadastros', 'Configurações', 'Orçamentos'])(
    'abre a tela %s sem erro',
    async (nome) => {
      const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { default: App } = await import('./App')
      render(<App />)
      const botao = await screen.findByRole('button', { name: new RegExp(`^${nome}`) })
      fireEvent.click(botao)
      await waitFor(() => expect(screen.getAllByText(new RegExp(nome)).length).toBeGreaterThan(0))
      expect(erros).not.toHaveBeenCalled()
    }
  )
})
