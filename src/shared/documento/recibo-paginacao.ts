import type { BlocoRecibo, PaginacaoRecibo } from './recibo'

/** Autocontida: executada na janela de exportação depois do mesmo paginador da prévia. */
export function lerPaginacaoRecibo(doc: Document): PaginacaoRecibo {
  const linhasVisuais = (el: Element): string[] => {
    const texto = el.firstChild
    if (!texto || texto.nodeType !== 3) return [el.textContent ?? '']
    const conteudo = texto.textContent ?? ''
    const linhas = ['']
    const range = doc.createRange()
    let topo: number | undefined
    for (let i = 0; i < conteudo.length; i++) {
      const letra = conteudo[i]
      if (letra === '\r') continue
      if (letra === '\n') {
        linhas.push('')
        topo = undefined
        continue
      }
      range.setStart(texto, i)
      range.setEnd(texto, i + 1)
      const atual = range.getBoundingClientRect().top
      if (topo !== undefined && atual > topo + 1 && linhas.at(-1)!.trim()) linhas.push('')
      linhas[linhas.length - 1] += letra
      topo = atual
    }
    return linhas.map((linha) => linha.trimEnd())
  }
  const folhas = [...doc.querySelectorAll<HTMLElement>('.recibo-pagina')]
  const primeira = folhas[0]
  const inicio = primeira?.querySelector<HTMLElement>('.recibo-valor')
  if (!primeira || !inicio) throw new Error('Não foi possível obter a paginação do recibo.')
  return {
    topoCorpoMm:
      ((inicio.getBoundingClientRect().top - primeira.getBoundingClientRect().top) * 25.4) / 96,
    paginas: folhas.map((folha) => {
      const blocos: BlocoRecibo[] = []
      for (const el of folha.querySelectorAll<HTMLElement>('.recibo > *')) {
        if (el.classList.contains('recibo-valor')) blocos.push({ tipo: 'valor' })
        else if (el.classList.contains('recibo-cliente')) blocos.push({ tipo: 'cliente' })
        else if (el.classList.contains('recibo-servico'))
          blocos.push({
            tipo: 'servico',
            texto: el.querySelector('.recibo-descricao')!.textContent ?? '',
            linhas: linhasVisuais(el.querySelector('.recibo-descricao')!)
          })
        else if (el.classList.contains('recibo-observacao'))
          blocos.push({
            tipo: 'observacao',
            texto: el.querySelector('.recibo-observacao-texto')!.textContent ?? '',
            linhas: linhasVisuais(el.querySelector('.recibo-observacao-texto')!)
          })
        else if (el.classList.contains('recibo-fechamento')) blocos.push({ tipo: 'fechamento' })
      }
      return blocos
    })
  }
}
