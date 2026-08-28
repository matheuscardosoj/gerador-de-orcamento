// Motor de paginação único, compartilhado pela prévia e pela geração de PDF —
// antes cada uma tinha seu próprio tratamento (ou nenhum, no caso da prévia),
// o que fazia os dois divergirem entre si e do DOCX.
//
// A função é AUTOCONTIDA DE PROPÓSITO (nenhum import, nenhuma referência a
// variável de módulo): a geração de PDF roda no processo main (Node, sem DOM),
// então ela injeta esta função na janela oculta via `.toString()` +
// `webContents.executeJavaScript` (ver `src/main/documents.ts`). A prévia, por
// rodar no renderer, importa e chama normalmente sobre o `contentDocument` do
// iframe (ver `PreviaModal.tsx`) — sem esbarrar na CSP do app, já que é uma
// manipulação de DOM comum, não um script injetado no documento do iframe.
//
// Entrada esperada: um único `<div class="pagina">` contendo `<div
// class="proposta">` (terminando em `<div class="rodape">`) e, opcionalmente,
// `<section class="anexos">` como irmã — exatamente o que `gerarHtmlOrcamento`
// produz. A função quebra isso em quantas folhas A4 (`.pagina`, 210×297mm)
// forem necessárias, com o rodapé grudado no fim da última folha da proposta e
// os anexos sempre começando numa folha própria.
export function paginarDocumento(doc: Document): void {
  try {
    // CSS "mm" é sempre 96px / 25.4mm por especificação — não depende de DPI
    // nem de zoom, então dá para converter direto, sem medir nada no DOM.
    const MM_PARA_PX = 96 / 25.4
    // Mesma conta de `ALTURA_UTIL_MM` em template.ts (297 - 15*2): mantidas em
    // sincronia manualmente, já que esta função não pode importar a constante.
    const ALTURA_UTIL_MM = 267
    // Folga deliberada: sem ela, um orçamento cujo conteúdo enche a página até
    // o último pixel encaixa perfeito na medição em tela, mas o motor de
    // impressão do Chromium usa outro pipeline de layout para o PDF — uma
    // diferença de meio pixel de arredondamento entre os dois já é o bastante
    // para empurrar o rodapé sozinho para uma página em branco. 5mm de sobra
    // absorve essa diferença sem o usuário notar o espaço a menos.
    const MARGEM_SEGURANCA_MM = 5
    const alturaPaginaPx = (ALTURA_UTIL_MM - MARGEM_SEGURANCA_MM) * MM_PARA_PX

    const paginaOriginal = doc.querySelector<HTMLElement>('.pagina')
    if (!paginaOriginal) return
    const proposta = paginaOriginal.querySelector<HTMLElement>('.proposta')
    if (!proposta) return
    const rodape = proposta.querySelector<HTMLElement>('.rodape')
    const anexosSecoes = Array.from(paginaOriginal.querySelectorAll<HTMLElement>('.anexos'))

    // Unidades atômicas da proposta: filhos diretos de .proposta, exceto o
    // rodapé (tratado à parte) — com .servicos desembrulhado, para que cada
    // item (formato carta) possa cair numa página diferente do anterior.
    const unidadesProposta: HTMLElement[] = []
    Array.from(proposta.children).forEach((filho) => {
      if (filho === rodape) return
      if (filho.classList.contains('servicos')) {
        Array.from(filho.children).forEach((neto) => unidadesProposta.push(neto as HTMLElement))
      } else {
        unidadesProposta.push(filho as HTMLElement)
      }
    })

    // No formato tabela, a tabela inteira continua como uma unidade só (não
    // divide linha a linha) — diferente do Word, que pagina tabelas
    // automaticamente. Assumido como aceitável: orçamentos costumam ter poucos
    // itens (catálogo de referência tem 11 serviços).
    /**
     * `offsetHeight` sozinho subestima o espaço real: `.proposta` é um flex
     * column, e margens de irmãos flex NÃO colapsam entre si (diferente do
     * fluxo de bloco normal) — cada `margin-top`/`margin-bottom` de cada
     * unidade conta à parte como espaço ocupado na página.
     */
    function alturaComMargens(el: HTMLElement): number {
      const estilo = doc.defaultView?.getComputedStyle(el)
      const margemCima = estilo ? parseFloat(estilo.marginTop) || 0 : 0
      const margemBaixo = estilo ? parseFloat(estilo.marginBottom) || 0 : 0
      return margemCima + el.offsetHeight + margemBaixo
    }

    const alturasProposta = unidadesProposta.map(alturaComMargens)
    // Sem margens aqui: o `margin-top:auto` do CSS, medido na posição
    // original (dentro de um .proposta que ainda não foi reorganizado), já
    // vem resolvido para um valor grande (o auto-margin da página inteira) —
    // usar isso seria circular, já que é exatamente esse espaço que o `sobra`
    // abaixo recalcula do zero para a página final de cada rodapé.
    const alturaRodape = rodape ? rodape.offsetHeight : 0

    const paginasNovas: HTMLElement[] = []

    function criarPagina(tipo: 'proposta' | 'anexos'): HTMLElement {
      const pagina = doc.createElement('div')
      pagina.className = 'pagina'
      const miolo = doc.createElement('div')
      miolo.className = tipo
      pagina.appendChild(miolo)
      paginasNovas.push(pagina)
      return miolo
    }

    /** Acumula unidades numa página; abre uma nova sempre que a próxima não coube. */
    function distribuir(
      unidades: HTMLElement[],
      alturas: number[],
      tipo: 'proposta' | 'anexos'
    ): { miolo: HTMLElement; usadoPx: number } {
      let miolo = criarPagina(tipo)
      let usadoPx = 0
      for (let i = 0; i < unidades.length; i++) {
        const h = alturas[i]
        // Só abre página nova se já houver algo na atual — uma unidade maior
        // que a página inteira não pode gerar uma página vazia antes dela.
        if (usadoPx > 0 && usadoPx + h > alturaPaginaPx) {
          miolo = criarPagina(tipo)
          usadoPx = 0
        }
        miolo.appendChild(unidades[i])
        usadoPx += h
      }
      return { miolo, usadoPx }
    }

    const resultadoProposta = distribuir(unidadesProposta, alturasProposta, 'proposta')

    // O rodapé fecha a última página da proposta, grudado no rodapé da folha
    // (mesma ideia do antigo `margin-top:auto`, mas calculada por página, não
    // por scroll — funciona igual em propostas de uma ou várias páginas).
    if (rodape) {
      let { miolo, usadoPx } = resultadoProposta
      if (usadoPx > 0 && usadoPx + alturaRodape > alturaPaginaPx) {
        miolo = criarPagina('proposta')
        usadoPx = 0
      }
      miolo.appendChild(rodape)
      const sobra = alturaPaginaPx - usadoPx - alturaRodape
      if (sobra > 0) rodape.style.marginTop = `${sobra}px`
    }

    // Os anexos sempre começam numa folha nova própria — nunca dividem página
    // com o fim da proposta.
    for (const secao of anexosSecoes) {
      const unidades = Array.from(secao.children) as HTMLElement[]
      if (unidades.length > 0) distribuir(unidades, unidades.map(alturaComMargens), 'anexos')
    }

    const pai = paginaOriginal.parentNode
    if (pai) {
      paginasNovas.forEach((p) => pai.insertBefore(p, paginaOriginal))
      pai.removeChild(paginaOriginal)
    }
  } finally {
    // Sempre revela o documento, mesmo se algo acima falhar — o CSS parte de
    // `body { visibility: hidden }` para não piscar o bloco único antes da
    // reorganização; um erro no meio do caminho não pode deixar a tela em branco.
    doc.body.style.visibility = 'visible'
  }
}
