import { describe, expect, it } from 'vitest'
import {
  DESCRICAO_CAMPO,
  corrigirTexto,
  limparRotulos,
  prepararSugestao,
  trocaDeConteudo,
  violacaoDePapeis
} from './revisao-ia-texto'
import { numerosTexto } from './revisao-ia'

describe('corrigirTexto: maiúscula, ponto final e espaços', () => {
  it('põe maiúscula inicial e ponto final', () => {
    expect(corrigirTexto('fazer a poda de 3 árvores', 'descricaoServico')).toBe(
      'Fazer a poda de 3 árvores.'
    )
  })

  it('mantém o que já está certo (idempotente)', () => {
    const certo = 'Poda de 3 árvores de grande porte, com remoção dos resíduos gerados.'
    expect(corrigirTexto(certo, 'descricaoServico')).toBe(certo)
    const uma = corrigirTexto('poda  de arvores ,rapida', 'descricaoServico')
    expect(corrigirTexto(uma, 'descricaoServico')).toBe(uma)
  })

  it('corrige espaços duplicados, antes de pontuação e depois de vírgula', () => {
    expect(corrigirTexto('Poda   de árvores ,com   remoção ;fim', 'observacao')).toBe(
      'Poda de árvores, com remoção; fim.'
    )
    expect(corrigirTexto('Texto ok.Próxima frase', 'observacao')).toBe('Texto ok. Próxima frase.')
    expect(corrigirTexto('( entre parênteses )', 'observacao')).toBe('(entre parênteses).')
  })

  it('capitaliza depois de ponto final, exceto abreviações', () => {
    expect(corrigirTexto('primeira frase. segunda frase', 'observacao')).toBe(
      'Primeira frase. Segunda frase.'
    )
    expect(corrigirTexto('materiais, etc. e mão de obra', 'observacao')).toBe(
      'Materiais, etc. e mão de obra.'
    )
  })

  it('não mexe em números, valores, datas nem horários', () => {
    const entrada = 'pagar R$ 1.600,00 em 12/03/2026 às 10:30 e 2,5 m de cerca'
    const saida = corrigirTexto(entrada, 'observacao')
    expect(numerosTexto(saida)).toEqual(numerosTexto(entrada))
    expect(saida).toBe('Pagar R$ 1.600,00 em 12/03/2026 às 10:30 e 2,5 m de cerca.')
  })

  it('não capitaliza linhas que começam com número ou símbolo', () => {
    expect(corrigirTexto('3 árvores de grande porte', 'descricaoServico')).toBe(
      '3 árvores de grande porte.'
    )
  })

  it('trata cada item de lista e preserva as quebras de linha', () => {
    expect(corrigirTexto('- poda de árvores\n- limpeza do terreno', 'observacao')).toBe(
      '- Poda de árvores\n- Limpeza do terreno.'
    )
  })

  it('não acrescenta ponto em texto curto, valor, ou que já termina com pontuação', () => {
    expect(corrigirTexto('Poda', 'descricaoServico')).toBe('Poda')
    expect(corrigirTexto('R$ 100', 'observacao')).toBe('R$ 100')
    expect(corrigirTexto('Atenção:', 'observacao')).toBe('Atenção:')
    expect(corrigirTexto('Pago no ato!', 'observacaoRecibo')).toBe('Pago no ato!')
  })

  it('anotação interna não recebe ponto final', () => {
    expect(corrigirTexto('cerca da fazenda aguardando retorno', 'anotacao')).toBe(
      'Cerca da fazenda aguardando retorno'
    )
  })
})

describe('corrigirTexto: acentos de palavras comuns', () => {
  it('acentua palavras inequívocas, preservando a caixa', () => {
    expect(corrigirTexto('poda de arvores e remocao dos residuos', 'descricaoServico')).toBe(
      'Poda de árvores e remoção dos resíduos.'
    )
    expect(corrigirTexto('SERVICO DE ROCADA', 'descricaoServico')).toBe('SERVIÇO DE ROÇADA.')
    expect(corrigirTexto('Orcamento de manutencao', 'descricaoServico')).toBe(
      'Orçamento de manutenção.'
    )
    expect(corrigirTexto('mao de obra inclusa, nao inclui materiais', 'observacao')).toBe(
      'Mão de obra inclusa, não inclui materiais.'
    )
  })

  it('escreve Pix e "à vista"', () => {
    expect(corrigirTexto('pagamento via pix', 'pagamento')).toBe('Pagamento via Pix.')
    expect(corrigirTexto('pagamento a vista', 'pagamento')).toBe('Pagamento à vista.')
  })

  it('não toca em palavras ambíguas nem em e-mails e endereços', () => {
    // "esta"/"está", "inicio"/"início" e "publico"/"público" existem sem acento.
    expect(corrigirTexto('esta obra tem inicio amanha', 'observacao')).toBe(
      'Esta obra tem inicio amanha.'
    )
    expect(corrigirTexto('escreva para ate@servico.com ou www.servico.com.br', 'observacao')).toBe(
      'Escreva para ate@servico.com ou www.servico.com.br.'
    )
  })
})

describe('limparRotulos', () => {
  it('remove rótulos vazados do modelo', () => {
    expect(limparRotulos('Descr. Recibo: Serviço de roçada', 'ref. serviço de roçada')).toBe(
      'Serviço de roçada'
    )
    expect(limparRotulos('Texto revisado: Materiais por conta da contratante.', 'materiais')).toBe(
      'Materiais por conta da contratante.'
    )
    expect(limparRotulos('Observação: Pago no ato.', 'pago no ato')).toBe('Pago no ato.')
  })

  it('remove linha de apresentação, negrito, aspas e cercas de código', () => {
    expect(limparRotulos('Segue o texto revisado:\nPoda de árvores.', 'poda de arvores')).toBe(
      'Poda de árvores.'
    )
    expect(limparRotulos('**Poda de árvores.**', 'poda')).toBe('Poda de árvores.')
    expect(limparRotulos('"Poda de árvores."', 'poda')).toBe('Poda de árvores.')
    expect(limparRotulos('```\nPoda de árvores.\n```', 'poda')).toBe('Poda de árvores.')
  })

  it('remove a instrução do prompt que o modelo repete antes do texto', () => {
    const eco =
      'O texto abaixo é a descrição do serviço ou a referência de um recibo. Revise-o e devolva somente o texto revisado, sem rótulos.\n\nRef. Serviço de roçada terreno.'
    expect(limparRotulos(eco, 'ref. serviço de roçada terreno')).toBe(
      'Ref. Serviço de roçada terreno.'
    )
    expect(
      limparRotulos(
        'O texto abaixo é uma observação. Revise-o e devolva somente o texto revisado, sem rótulos. Pago no ato.',
        'pago no ato'
      )
    ).toBe('Pago no ato.')
    expect(
      limparRotulos('Revise-o e devolva somente o texto revisado.\nPago no ato.', 'pago')
    ).toBe('Pago no ato.')
  })

  it('preserva rótulos que a própria pessoa escreveu', () => {
    expect(limparRotulos('Observação: pagar em 3 vezes.', 'Observação: pagar em 3x')).toBe(
      'Observação: pagar em 3 vezes.'
    )
    expect(limparRotulos('Valor: R$ 100,00 à vista.', 'valor: R$ 100 a vista')).toBe(
      'Valor: R$ 100,00 à vista.'
    )
  })

  it('não confunde horário ou texto com número com rótulo', () => {
    expect(limparRotulos('Entrega às 10:30 do dia 12.', 'entrega as 10:30')).toBe(
      'Entrega às 10:30 do dia 12.'
    )
    expect(limparRotulos('Parcela 2: R$ 500', 'parcela 2 500')).toBe('Parcela 2: R$ 500')
  })
})

describe('violacaoDePapeis', () => {
  it('recusa trocar contratante por empresa, contratada ou cliente', () => {
    const original = 'materiais por conta da contratante'
    expect(violacaoDePapeis(original, 'materiais por conta da empresa')).toMatch(/trocou/)
    expect(violacaoDePapeis(original, 'materiais por conta da contratada')).toMatch(/trocou/)
    expect(violacaoDePapeis(original, 'materiais por conta do cliente')).toMatch(/trocou/)
  })

  it('recusa incluir ou remover um papel', () => {
    expect(violacaoDePapeis('poda de árvores', 'poda de árvores pela empresa')).not.toBeNull()
    expect(violacaoDePapeis('cliente paga o material', 'paga o material')).not.toBeNull()
  })

  it('ignora acentos, caixa e plural', () => {
    expect(violacaoDePapeis('Os CLIENTES pagam', 'Os clientes pagam em dia')).toBeNull()
    expect(violacaoDePapeis('a contratante paga', 'A Contratante paga o valor')).toBeNull()
  })

  it('recusa acrescentar, trocar ou remover a forma de pagamento', () => {
    const original = '50% na entrada e 50% na entrega via pix'
    expect(
      violacaoDePapeis(original, '50% em dinheiro na entrada e 50% via Pix na entrega')
    ).toMatch(/forma de pagamento/)
    expect(violacaoDePapeis(original, '50% na entrada e 50% na entrega, via cartão')).not.toBeNull()
    expect(violacaoDePapeis('Pago em dinheiro no ato', 'Pago no ato')).not.toBeNull()
    expect(violacaoDePapeis(original, '50% na entrada e 50% na entrega, via Pix.')).toBeNull()
    expect(violacaoDePapeis('Pagamento por Transferência', 'Pagamento por TED')).toBeNull()
  })

  it('recusa passar o texto para a primeira pessoa', () => {
    expect(violacaoDePapeis('pago em dinheiro no ato', 'paguei em dinheiro no ato')).toMatch(
      /primeira pessoa/
    )
    expect(violacaoDePapeis('recebi o valor', 'recebi o valor combinado')).toBeNull()
  })

  it('aceita texto sem papéis', () => {
    expect(violacaoDePapeis('Poda de árvores', 'Poda de 3 árvores de grande porte')).toBeNull()
  })
})

describe('trocaDeConteudo', () => {
  it('recusa trocar o serviço por outro (caso real do modelo de 3B)', () => {
    expect(trocaDeConteudo('ref. serviço de roçada terreno', 'Ref. Remoção terreno.')).toMatch(
      /trocou ou removeu/
    )
  })

  it('aceita ajustes de redação: plural, acento, pontuação e palavras de ligação', () => {
    expect(
      trocaDeConteudo(
        'Poda de 3 árvores de grande porte, com remoção dos resíduos gerados.',
        'Poda de 3 árvores de grande porte, remoção dos resíduos gerados.'
      )
    ).toBeNull()
    expect(
      trocaDeConteudo(
        'fazer a poda de 3 arvores e remocao dos residuos',
        'Fazer a poda de 3 árvores e a remoção dos resíduos.'
      )
    ).toBeNull()
    expect(trocaDeConteudo('serviço de roçada', 'Serviços de roçadas.')).toBeNull()
    expect(trocaDeConteudo('pago em dinheiro no ato', 'Pago em dinheiro no ato.')).toBeNull()
  })

  it('recusa trocar uma única palavra de conteúdo em textos curtos (caso real do Gemma 3 1B)', () => {
    expect(
      trocaDeConteudo('ref. serviço de roçada terreno', 'Ref. Serviço de Rotação do Terreno.')
    ).toMatch(/trocou ou removeu/)
    expect(
      trocaDeConteudo('materiais por conta da contratante', 'Materiais a pagar à contratante')
    ).toMatch(/trocou ou removeu/)
  })

  it('reconhece a mesma palavra em outra forma (verbo, substantivo, plural)', () => {
    expect(trocaDeConteudo('Cortar 3 árvores', 'Corte de 3 árvores')).toBeNull()
    expect(trocaDeConteudo('pintura do muro', 'Pintar o muro')).toBeNull()
    expect(trocaDeConteudo('Executar o serviço', 'Execução do serviço')).toBeNull()
  })

  it('aceita pequenas expansões que detalham o que já estava no texto', () => {
    expect(trocaDeConteudo('Poda de árvores', 'Poda de árvores de grande porte')).toBeNull()
  })

  it('recusa reescrita que perde mais de um terço do conteúdo', () => {
    expect(
      trocaDeConteudo(
        'poda de arvores e remocao dos residuos',
        'Poda de árvores e limpeza do terreno.'
      )
    ).toMatch(/trocou ou removeu/)
    // Reescrita que troca a maior parte das palavras também é recusada.
    expect(
      trocaDeConteudo(
        '50% na entrada e 50% na entrega via pix',
        '50% no pagamento inicial e 50% no pagamento à entrega através de Pix.'
      )
    ).not.toBeNull()
    // Em textos curtos, uma palavra pode mudar de forma (verbo vira substantivo).
    expect(
      trocaDeConteudo('Cortar 3 árvores por R$ 1.600,00.', 'Corte de 3 árvores por R$ 1.600,00.')
    ).toBeNull()
    expect(trocaDeConteudo('Poda', 'Corte')).toMatch(/trocou ou removeu/)
  })

  it('recusa acrescentar informações que não estavam no texto', () => {
    expect(
      trocaDeConteudo(
        'poda de arvores',
        'Poda de árvores, remoção de entulho, limpeza do terreno e transporte'
      )
    ).toMatch(/acrescentou/)
  })

  it('texto sem palavras de conteúdo (valores, siglas) não aciona a trava', () => {
    expect(trocaDeConteudo('R$ 100', 'R$ 100,00.')).toBeNull()
    expect(trocaDeConteudo('', 'qualquer coisa')).toBeNull()
  })
})

describe('prepararSugestao', () => {
  it('cai para as correções automáticas quando o modelo troca o serviço', () => {
    const r = prepararSugestao(
      'ref. serviço de roçada terreno',
      'Ref. Remoção terreno.',
      'descricaoRecibo'
    )
    expect(r.origem).toBe('automatica')
    expect(r.texto).toBe('Ref. Serviço de roçada terreno.')
  })

  it('usa a resposta do modelo quando ela melhora o texto', () => {
    const r = prepararSugestao(
      'poda de arvores',
      'Poda de árvores de grande porte',
      'descricaoServico'
    )
    expect(r).toEqual({ texto: 'Poda de árvores de grande porte.', origem: 'modelo' })
    // Já acrescentar serviços que ninguém escreveu é invenção e cai para as correções automáticas.
    expect(
      prepararSugestao(
        'poda de arvores',
        'Poda de árvores de grande porte, com remoção dos resíduos',
        'descricaoServico'
      )
    ).toEqual({ texto: 'Poda de árvores.', origem: 'automatica' })
  })

  it('remove rótulo vazado e aplica as correções', () => {
    const r = prepararSugestao(
      'ref. servico de rocada terreno',
      'Descr. Recibo: servico de rocada terreno',
      'descricaoRecibo'
    )
    expect(r.texto).toBe('Serviço de roçada terreno.')
    expect(r.texto).not.toMatch(/Recibo/)
  })

  it('quando o modelo devolve o mesmo texto, corrige automaticamente o original', () => {
    const original = 'fazer a poda de 3 arvores de grande porte e remocao dos residuos'
    const r = prepararSugestao(original, original, 'descricaoServico')
    expect(r).toEqual({
      texto: 'Fazer a poda de 3 árvores de grande porte e remoção dos resíduos.',
      origem: 'automatica'
    })
  })

  it('quando o modelo troca os papéis, mantém só as correções automáticas', () => {
    const r = prepararSugestao(
      'materiais por conta da contratante',
      'materiais por conta da empresa',
      'observacao'
    )
    expect(r).toEqual({
      texto: 'Materiais por conta da contratante.',
      origem: 'automatica'
    })
  })

  it('troca de papéis sem nada a corrigir vira erro, para a pessoa tentar de novo', () => {
    expect(() =>
      prepararSugestao(
        'Materiais por conta da contratante.',
        'Materiais por conta da empresa.',
        'observacao'
      )
    ).toThrow(/trocou/)
  })

  it('texto já correto e resposta igual: inalterada', () => {
    const certo = 'Pagamento à vista, via Pix.'
    expect(prepararSugestao(certo, certo, 'pagamento')).toEqual({
      texto: certo,
      origem: 'inalterada'
    })
  })

  it('resposta vazia cai para as correções automáticas ou inalterada', () => {
    expect(prepararSugestao('pago no ato', '   ', 'observacaoRecibo')).toEqual({
      texto: 'Pago no ato.',
      origem: 'automatica'
    })
    expect(prepararSugestao('Pago no ato.', '', 'observacaoRecibo').origem).toBe('inalterada')
  })

  it('nunca altera os números do texto', () => {
    const original = 'pagar 50% na entrada e 50% na entrega, total R$ 1.800,00'
    const r = prepararSugestao(original, original, 'pagamento')
    expect(numerosTexto(r.texto)).toEqual(numerosTexto(original))
  })
})

describe('DESCRICAO_CAMPO', () => {
  it('descreve todos os campos em linguagem natural, sem identificadores internos', () => {
    for (const texto of Object.values(DESCRICAO_CAMPO)) {
      expect(texto.length).toBeGreaterThan(10)
      expect(texto).not.toMatch(/[A-Z][a-z]+[A-Z]/)
    }
  })
})
