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
    // Recibos têm sua própria folha A5 horizontal e fechamento indivisível.
    const reciboOriginal = doc.querySelector<HTMLElement>('.recibo-pagina')
    const recibo = reciboOriginal?.querySelector<HTMLElement>('.recibo')
    if (reciboOriginal && recibo) {
      if (doc.body.dataset.reciboPaginado) return
      const estiloPagina = doc.defaultView!.getComputedStyle(reciboOriginal)
      const alturaUtil =
        reciboOriginal.clientHeight -
        parseFloat(estiloPagina.paddingTop) -
        parseFloat(estiloPagina.paddingBottom) -
        (3 * 96) / 25.4
      const cabecalho = recibo.querySelector<HTMLElement>('.recibo-cabecalho')!
      const titulo = recibo.querySelector<HTMLElement>('.recibo-titulo')!
      const unidades = [...recibo.children].filter(
        (el) => el !== cabecalho && el !== titulo
      ) as HTMLElement[]
      const altura = (el: HTMLElement): number => {
        const estilo = doc.defaultView!.getComputedStyle(el)
        return (
          el.offsetHeight +
          (parseFloat(estilo.marginTop) || 0) +
          (parseFloat(estilo.marginBottom) || 0)
        )
      }
      let miolo: HTMLElement
      let usado = 0
      let alturaCabecalho = 0
      const novaPagina = (): void => {
        const pagina = doc.createElement('div')
        pagina.className = reciboOriginal.className
        miolo = doc.createElement('div')
        miolo.className = 'recibo'
        pagina.appendChild(miolo)
        reciboOriginal.parentNode!.insertBefore(pagina, reciboOriginal)
        const c = cabecalho.cloneNode(true) as HTMLElement
        const t = titulo.cloneNode(true) as HTMLElement
        miolo.append(c, t)
        usado = altura(c) + altura(t)
        alturaCabecalho = usado
      }
      novaPagina()
      const fechar = unidades.find((el) => el.classList.contains('recibo-fechamento'))
      const alturaFechamento = fechar ? altura(fechar) : 0
      for (const unidade of unidades) {
        const texto = unidade.querySelector<HTMLElement>(
          '.recibo-descricao, .recibo-observacao-texto'
        )
        if (texto) {
          // Mede na largura real e divide apenas em limites de palavras, mantendo todas elas.
          const palavras = texto.textContent?.match(/\S+\s*/g) ?? []
          let inicio = 0
          while (inicio < palavras.length) {
            const parte = unidade.cloneNode(true) as HTMLElement
            const conteudo = parte.querySelector<HTMLElement>(
              '.recibo-descricao, .recibo-observacao-texto'
            )!
            miolo!.appendChild(parte)
            const medir = (fim: number): number => {
              conteudo.textContent = palavras.slice(inicio, fim).join('')
              return altura(parte)
            }
            let disponivel = alturaUtil - usado
            const restante = medir(palavras.length)
            // Quando couber em uma folha, leva serviço e assinatura juntos para a próxima.
            if (
              restante <= disponivel &&
              restante + alturaFechamento > disponivel &&
              restante + alturaFechamento <= alturaUtil - alturaCabecalho &&
              usado > alturaCabecalho
            ) {
              parte.remove()
              novaPagina()
              miolo!.appendChild(parte)
              disponivel = alturaUtil - usado
            }
            let lo = inicio,
              hi = palavras.length
            while (lo < hi) {
              const meio = Math.ceil((lo + hi) / 2)
              if (medir(meio) <= disponivel) lo = meio
              else hi = meio - 1
            }
            if (lo === inicio) {
              parte.remove()
              if (usado <= alturaCabecalho)
                throw new Error(
                  'O texto do recibo contém uma palavra que não cabe na folha. Divida o texto em palavras menores.'
                )
              novaPagina()
              continue
            }
            usado += medir(lo)
            inicio = lo
            if (inicio < palavras.length) novaPagina()
          }
        } else {
          const h = altura(unidade)
          if (usado + h > alturaUtil && usado > alturaCabecalho) novaPagina()
          if (usado + h > alturaUtil)
            throw new Error(
              'A identificação ou o fechamento do recibo não cabe em A5. Reduza os campos de apresentação ou o texto do local.'
            )
          miolo!.appendChild(unidade)
          usado += h
        }
      }
      reciboOriginal.remove()
      doc.body.dataset.reciboPaginado = 'true'
      return
    }
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
      paginaOriginal?.parentNode?.insertBefore(pagina, paginaOriginal)
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
        const unidade = unidades[i]
        if (unidade.tagName === 'TABLE') {
          const tabela = unidade as HTMLTableElement
          const linhas = Array.from(tabela.tBodies).flatMap((body) => Array.from(body.rows))
          let indice = 0
          while (indice < linhas.length) {
            const parte = tabela.cloneNode(false) as HTMLTableElement
            if (tabela.tHead) parte.appendChild(tabela.tHead.cloneNode(true))
            const corpo = doc.createElement('tbody')
            parte.appendChild(corpo)
            miolo.appendChild(parte)
            const inicio = indice
            while (indice < linhas.length) {
              const linha = linhas[indice]
              corpo.appendChild(linha)
              if (usadoPx + alturaComMargens(parte) > alturaPaginaPx) {
                linha.remove()
                break
              }
              indice++
            }
            if (indice === inicio) {
              parte.remove()
              if (usadoPx === 0)
                throw new Error(
                  'Uma linha da tabela excede a altura da página. Divida a descrição em mais de um item antes de exportar.'
                )
            } else usadoPx += alturaComMargens(parte)
            if (indice < linhas.length) {
              miolo = criarPagina(tipo)
              usadoPx = 0
            }
          }
          tabela.remove()
          continue
        }
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
