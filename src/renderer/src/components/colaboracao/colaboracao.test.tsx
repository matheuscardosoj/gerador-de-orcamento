// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComparacaoRascunho, RascunhoCompartilhado } from '@shared/evolucao'
import { PainelComparacao, TabelaRascunhos, rotuloCampo, trechoComputador } from './rascunhos'
import { ControleDaEdicao } from './controle'
import { RecebimentosPendentes } from './financeiro'

afterEach(() => cleanup())

const rascunho = (estado: RascunhoCompartilhado['estado'], id = 'r1'): RascunhoCompartilhado =>
  ({
    id,
    estado,
    baseRevisao: 4,
    atualizadoEm: '2026-10-20T12:00:00.000Z',
    documento: { id: 'd1' }
  }) as unknown as RascunhoCompartilhado

describe('painéis de colaboração', () => {
  it('rotula campos e abrevia ids de computador sem ambiguidade', () => {
    expect(rotuloCampo(`itensServico.${'x'.repeat(40)}.valorUnitario`)).toBe(
      'Serviços / Item / Valor unitário'
    )
    expect(trechoComputador('aaaaaaaa1', ['aaaaaaaa1', 'aaaaaaaa2'])).toBe('aaaaaaaa1')
    expect(trechoComputador('bbbbbbbbcc', ['aaaaaaaa1', 'bbbbbbbbcc'])).toBe('bbbbbbbb')
  })

  it('lista rascunhos, bloqueia ações enquanto aguarda a nuvem e dispara os callbacks', () => {
    const onExcluir = vi.fn()
    const onEditar = vi.fn()
    const onComparar = vi.fn()
    render(
      <table>
        <TabelaRascunhos
          rascunhos={[rascunho('local'), rascunho('aguardando_confirmacao', 'r2')]}
          ocupado={false}
          onExcluir={onExcluir}
          onEditar={onEditar}
          onComparar={onComparar}
        />
      </table>
    )
    expect(screen.getByText('Aguardando confirmação da nuvem')).toBeTruthy()
    const comparar = screen.getAllByRole('button', { name: /Comparar/ })
    expect((comparar[1] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(comparar[0])
    expect(onComparar).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    expect(onEditar).toHaveBeenCalledOnce()
    fireEvent.click(screen.getAllByRole('button', { name: /Excluir rascunho/ })[0])
    expect(onExcluir).toHaveBeenCalledOnce()
  })

  it('mostra a mensagem de vazio sem rascunhos', () => {
    render(
      <TabelaRascunhos
        rascunhos={[]}
        ocupado={false}
        onExcluir={vi.fn()}
        onEditar={vi.fn()}
        onComparar={vi.fn()}
      />
    )
    expect(screen.getByText(/Não há rascunhos guardados/)).toBeTruthy()
  })

  it('só libera "Aplicar como nova revisão" depois de escolher todos os conflitos', () => {
    const comparacao = {
      rascunho: { id: 'r1' },
      revisaoRemota: 7,
      remoto: { id: 'd1' },
      documento: { id: 'd1' },
      conflitos: [{ caminho: 'descricao', base: 'a', local: 'b', remoto: 'c', financeiro: false }]
    } as unknown as ComparacaoRascunho
    const onEscolher = vi.fn()
    const { rerender } = render(
      <PainelComparacao
        comparacao={comparacao}
        escolhas={{}}
        ocupado={false}
        reciboProtegido={false}
        onEscolher={onEscolher}
        onAplicar={vi.fn()}
        onCriarNovo={vi.fn()}
      />
    )
    const aplicar = (): HTMLButtonElement =>
      screen.getByRole('button', { name: /Aplicar como nova revisão/ }) as HTMLButtonElement
    expect(aplicar().disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'local' } })
    expect(onEscolher).toHaveBeenCalledWith('descricao', 'local')
    rerender(
      <PainelComparacao
        comparacao={comparacao}
        escolhas={{ descricao: 'local' }}
        ocupado={false}
        reciboProtegido={false}
        onEscolher={onEscolher}
        onAplicar={vi.fn()}
        onCriarNovo={vi.fn()}
      />
    )
    expect(aplicar().disabled).toBe(false)
  })

  it('controle da edição: transferir exige destino e recuperar pede confirmação', () => {
    const onControlar = vi.fn()
    const onRecuperar = vi.fn()
    const base = {
      controle: { podeEditar: true, offline: false } as never,
      status: { computador: 'pc-a' } as never,
      computadores: [
        { id: 'pc-a', nome: 'Este' },
        { id: 'pc-b', nome: 'Outro' }
      ],
      ocupado: false,
      sujo: false,
      onDestino: vi.fn(),
      onRecuperar,
      onControlar
    }
    const { rerender } = render(<ControleDaEdicao {...base} destino="" recuperar={false} />)
    const transferir = screen.getByRole('button', { name: /Transferir controle/ })
    expect((transferir as HTMLButtonElement).disabled).toBe(true)
    rerender(<ControleDaEdicao {...base} destino="pc-b" recuperar={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Transferir controle/ }))
    expect(onControlar).toHaveBeenCalledWith('transferir', 'pc-b')
    fireEvent.click(screen.getByRole('button', { name: /Confirmar recuperação/ }))
    expect(onControlar).toHaveBeenCalledWith('recuperar')
  })

  it('recebimentos pendentes só aparecem para recibos e relatórios', () => {
    const props = {
      recebimentos: null,
      confirmarFinanceiro: null,
      ocupado: false,
      sujo: false,
      onRevisar: vi.fn(),
      onEscolher: vi.fn(),
      onConfirmar: vi.fn()
    }
    const { container, rerender } = render(<RecebimentosPendentes tipo="orcamento" {...props} />)
    expect(container.textContent).toBe('')
    rerender(<RecebimentosPendentes tipo="recibo" {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Revisar recebimentos/ }))
    expect(props.onRevisar).toHaveBeenCalledOnce()
  })
})
