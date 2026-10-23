# Validação da rc.19 — formação de preço

Data: 15/10/2026

Branch: `claude`
Versão: `1.5.0-rc.19`

## Alterações

- O resumo distingue custo do serviço, lucro incorporado aos itens adicionais, lucro sobre os demais custos, imposto e preço final.
- Materiais de R$ 500 aparecem por R$ 750 com lucro próprio de 50% e por R$ 1.000 com o percentual geral de 100%. O lucro aplicado aos materiais entra uma vez no preço.
- O percentual geral e o preço final desejado se atualizam automaticamente um pelo outro. Custos, percentuais próprios, repasses, quantidade e os dois métodos de imposto continuam considerados pelo motor compartilhado.
- Quando a meta digitada fica abaixo do preço atual, o aplicativo conserva a meta no campo, exibe um aviso e mantém preço e percentual atuais.
- A nomenclatura visível passou a distinguir lucro de percentual aplicado sobre custo, em telas de cálculo, configurações, validações e comparação de documentos.
- Orçamento e relatório usam o mesmo modal e cálculo.

## Verificações

- `npm run check`: lint, formatação, TypeScript, build e 354 testes em 66 arquivos aprovados.
- `node scripts/legado/verificar-rc19-calculo.mjs`: interface exercitada em orçamento e relatório, em larguras de 1024 e 1600 px. Verificados lucro próprio e geral, imposto de 6%, sincronização automática dos campos, aviso para meta menor, salvar/reabrir, prévia e chamadas de exportação de PDF e Word usando API simulada.
- `src/shared/documento/docx.gen.test.ts`: templates e DOCX reais verificam o preço desejado em orçamento e relatório.
- `node scripts/legado/verificar-rc19-pacote.mjs`: executável empacotado abriu com perfil temporário isolado, mostrou a tela de entrada e respondeu `1.5.0-rc.19` pelo IPC, sem erros de renderer.
- Conteúdo do `app.asar` conferido: versão rc.19 e nomenclatura nova; runtime de IA presente.

## Instalador

- Local: `output/instalacao-teste-1.5.0-rc.19/Gerador de Orçamentos Setup 1.5.0-rc.19.exe`
- Compartilhamento do N: `F:\Users\Public\Downloads\Gerador de Orçamentos Setup 1.5.0-rc.19.exe`
- Tamanho: 1.222.559.228 bytes
- SHA-256 local e no compartilhamento: `6AB5B47CBD84190018EDA9CACD1879D874875366D3B7CA0918963488AFAF6E03`

## Limite desta validação

A inicialização do pacote foi confirmada em perfil temporário. A instalação e o teste funcional nos computadores D-MATHEUS e N-MATHEUS ainda dependem da instalação manual pelo usuário. A interface automatizada usa dados e API simulados; não acessa o Supabase nem altera os dados da VS.
