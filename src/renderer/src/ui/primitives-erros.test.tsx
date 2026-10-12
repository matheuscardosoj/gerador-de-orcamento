import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Mensagem } from './primitives'

describe('mensagens renderizadas', () => {
  it('exibe uma única validação sem detalhes de transporte', () => {
    const html = renderToStaticMarkup(
      <Mensagem>
        {
          "Error: Error invoking remote method 'recibos.confirmar': Error: Preencha o nome do cliente."
        }
      </Mensagem>
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Preencha o nome do cliente.')
    expect(html).not.toMatch(/Error:|invoking|recibos.confirmar/)
  })

  it('protege a interface mesmo quando uma string técnica chega sem tratamento', () => {
    const html = renderToStaticMarkup(<Mensagem>SQLITE_ERROR: SELECT * FROM clientes</Mensagem>)
    expect(html).toContain('Não foi possível concluir esta ação.')
    expect(html).not.toMatch(/SQLITE|SELECT|clientes/)
  })

  it('preserva mensagens de sucesso, avisos e conteúdo interativo', () => {
    expect(renderToStaticMarkup(<Mensagem tom="sucesso">Backup salvo.</Mensagem>)).toContain(
      'Backup salvo.'
    )
    expect(
      renderToStaticMarkup(<Mensagem tom="aviso">Aguarde a sincronização.</Mensagem>)
    ).toContain('Aguarde a sincronização.')
    expect(
      renderToStaticMarkup(
        <Mensagem>
          <span>Revise os campos.</span>
          <button>Revisar</button>
        </Mensagem>
      )
    ).toContain('<button>Revisar</button>')
  })
})
