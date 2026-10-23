# Validação da versão 1.5.1

## Alterações verificadas

- Históricos de clientes e serviços paginam 12 registros por página e exibem a faixa
  atual e o total filtrado. Busca e ordenação retornam à primeira página; a página
  visível se ajusta ao total após uma exclusão.
- Erros de exclusão de clientes e serviços permanecem no diálogo de confirmação,
  sem fechar o diálogo nem permitir novo envio enquanto a operação está em curso.
- Erros e avisos de validação, meta de preço e alteração do cálculo aparecem como
  notificações flutuantes no modal compartilhado por orçamento e relatório. As
  notificações são removidas ao fechar o modal e não duplicam as mensagens no topo.

## Evidências de teste

- `node scripts/legado/verificar-1-5-1-cadastros.mjs`: passou com perfil e dados sintéticos;
  verificou paginação de clientes e serviços, busca e apresentação de falha na
  exclusão de serviço.
- `node scripts/legado/verificar-rc20-calculo.mjs`: passou em orçamento e relatório, cobrindo
  notificações flutuantes, cálculo, metas, prévias e quatro exportações PDF/Word.
- `npm run check`: passou (lint, formatação, TypeScript, 359 testes em 66 arquivos e
  build de produção).
- `npm run dist`: gerou `release/Gerador de Orçamentos Setup 1.5.1.exe`.
- `node scripts/legado/verificar-1-5-1-pacote.mjs`: o executável abriu com perfil temporário,
  retornou a versão `1.5.1` e não registrou erros de página.

## Instalador local

- Caminho: `release/Gerador de Orçamentos Setup 1.5.1.exe`
- Tamanho: 1.222.560.143 bytes
- SHA-256: `D4D067E55FB4233FA9664BBD256F27F8648EF2958BDDA6AB191418825FD59F7A`
- O instalador permanece local; não foi copiado para o compartilhamento de N.

## Limites

A validação do executável foi feita com um perfil isolado. A instalação manual e o
teste nos computadores D-MATHEUS e N-MATHEUS não fazem parte desta validação.
